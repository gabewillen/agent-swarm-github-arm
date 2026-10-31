// Quorum Run rules: DESIGN.md §5 (state), §6 (a step), §7 (events).
// Pure: step never changes the state (or anything in it) it is given, and
// every draw of randomness takes the state's seed.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';

// The level loader and the shipped levels are separate areas of this
// project; they are imported by their relative names but defensively, so
// a sibling module that has not landed yet cannot stop this one loading
// (the tests keep every module runnable on its own).
let parseLevel = null;
try {
  ({ parseLevel } = await import('./level.js'));
} catch {
  parseLevel = null; // src/core/level.js has not landed yet
}
let LEVELS = [];
try {
  ({ LEVELS } = await import('../data/levels.js'));
} catch {
  LEVELS = []; // src/data/levels.js has not landed yet
}

// §5: a step's state is plain JSON data; nothing in it is ever mutated.
function cloneForStep(state) {
  return {
    ...state,
    player: { x: state.player.x, y: state.player.y },
    carried: state.carried.slice(),
    patches: state.patches.map((p) => ({ x: p.x, y: p.y, color: p.color })),
    drifts: state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    conflicts: state.conflicts.map((c) => ({ x: c.x, y: c.y, ttl: c.ttl })),
    events: [],
  };
}

// Loading a level (§5): sets level, player, patches (with fresh colour
// draws, one per spawn point in reading order), and drifts; resets
// carried, conflicts, merges, open, invuln, and levelTicks; keeps score,
// lives, tick, and the PRNG state it is given in `base`.
function loadLevel(base) {
  if (typeof parseLevel !== 'function') {
    throw new Error('invalid level: the level loader (src/core/level.js) is unavailable');
  }
  const level = parseLevel(base.levels[base.levelIndex]);
  let seed = base.seed;
  const patches = [];
  for (const sp of level.spawns) {
    const r = rngInt(seed, COLORS);
    seed = r.seed;
    patches.push({ x: sp.x, y: sp.y, color: r.value });
  }
  return {
    ...base,
    seed, // the state after the colour draws
    level,
    player: { x: level.start.x, y: level.start.y },
    carried: [],
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
    status: 'playing',
    paused: false,
    events: [],
  };
}

export function init(seed, options) {
  const opts = options ?? {};
  const base = {
    levels: Array.isArray(opts.levels) ? opts.levels : LEVELS,
    levelIndex: opts.level ?? 0,
    score: 0,
    lives: START_LIVES,
    tick: 0,
    seed: seed >>> 0,
  };
  return loadLevel(base);
}

// §5: the level's terrain character at a cell, '#' outside the map.
export function tileAt(state, x, y) {
  const rows = state.level.tiles;
  if (y < 0 || y >= rows.length) return '#';
  const row = rows[y];
  if (x < 0 || x >= row.length) return '#';
  return row[x];
}

// §6: what the player may enter. Walls never; holds and the exit when open.
function playerPassable(tile, open) {
  if (tile === '#') return false;
  if (tile === 'H' || tile === 'X') return open;
  return true;
}

// §6 step 10: what a drift may enter. Holds and the exit are walls to a
// drift whether open or not; patches, the player, and other drifts are not.
function driftPassable(tile) {
  return tile === '.' || tile === 'M';
}

function hasConflictAt(conflicts, x, y) {
  return conflicts.some((c) => c.x === x && c.y === y);
}

// §6: a missing or null input, or a missing field, means no move and no pause.
function normalizeInput(input) {
  const out = { move: null, pause: false };
  if (input && typeof input === 'object') {
    if (typeof input.move === 'string' && Object.prototype.hasOwnProperty.call(DIRS, input.move)) {
      out.move = input.move;
    }
    if (input.pause === true) out.pause = true;
  }
  return out;
}

export function step(state, input) {
  const cur = state;
  const inp = normalizeInput(input);

  // 1. A finished game changes nothing.
  if (cur.status !== 'playing') return { ...cur, events: [] };

  // 2. Pausing flips paused and does nothing else.
  if (inp.pause) {
    const paused = !cur.paused;
    return { ...cur, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // 3. While paused, nothing moves.
  if (cur.paused) return { ...cur, events: [] };

  // 4. The tick grows.
  const n = cloneForStep(cur);
  n.tick = cur.tick + 1;
  n.levelTicks = cur.levelTicks + 1;
  const events = [];

  // 5. Conflicts age; ones at 0 go.
  n.conflicts = [];
  for (const c of cur.conflicts) {
    if (c.ttl > 1) n.conflicts.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }

  // 6. The player moves when the target cell is passable and conflict-free.
  const px = cur.player.x;
  const py = cur.player.y;
  let nx = px;
  let ny = py;
  if (inp.move) {
    const d = DIRS[inp.move];
    const tx = px + d[0];
    const ty = py + d[1];
    if (playerPassable(tileAt(cur, tx, ty), cur.open) && !hasConflictAt(n.conflicts, tx, ty)) {
      nx = tx;
      ny = ty;
    }
  }
  n.player = { x: nx, y: ny };

  // 7. Pickup.
  if (n.carried.length < CARRY_MAX) {
    const i = n.patches.findIndex((p) => p.x === nx && p.y === ny);
    if (i >= 0) {
      n.carried.push(n.patches[i].color);
      n.patches.splice(i, 1);
      events.push('pickup');
    }
  }

  // 8. Merge on a pad.
  const onTile = tileAt(cur, nx, ny);
  if (onTile === 'M' && n.carried.length > 0) {
    const k = n.carried.length;
    let gain = PATCH_BASE * k * k;
    if (k >= 2 && n.carried.every((c) => c === n.carried[0])) {
      gain += SAME_COLOR_BONUS * k;
    }
    n.score += gain;
    n.merges += k;
    n.carried = [];
    events.push('merge');
    if (!n.open && n.merges >= n.level.quorum) {
      n.open = true;
      events.push('quorum');
    }
  }

  // 9. The exit ships the level; the step ends here afterwards.
  if (n.open && onTile === 'X') {
    n.score += Math.max(0, n.level.par - n.levelTicks) * TIME_BONUS_PER_TICK;
    if (n.levelIndex + 1 < n.levels.length) {
      return {
        ...loadLevel({
          levels: n.levels,
          levelIndex: n.levelIndex + 1,
          score: n.score,
          lives: n.lives,
          tick: n.tick,
          seed: n.seed,
          paused: n.paused,
        }),
        events: [...events, 'level'],
      };
    }
    n.status = 'won';
    events.push('won');
    n.events = events;
    return n;
  }

  // 10. Drifts move on their tick, trying their own direction first, then
  // clockwise. They ignore the player, patches, and each other.
  let driftsTurn = false;
  let prevPos = null;
  if (n.level.driftPeriod > 0 && n.tick % n.level.driftPeriod === 0) {
    driftsTurn = true;
    prevPos = n.drifts.map((d) => ({ x: d.x, y: d.y }));
    for (const d of n.drifts) {
      const from = Math.max(0, CLOCKWISE.indexOf(d.dir));
      for (let i = 0; i < 4; i++) {
        const dir = CLOCKWISE[(from + i) % 4];
        const dd = DIRS[dir];
        const tx = d.x + dd[0];
        const ty = d.y + dd[1];
        if (driftPassable(tileAt(n, tx, ty)) && !hasConflictAt(n.conflicts, tx, ty)) {
          d.dir = dir;
          d.x = tx;
          d.y = ty;
          break;
        }
      }
    }
  }

  // 11. On a drifts' tick, cells holding two or more drifts (read in
  // reading order) make conflicts, and every drift there reverses.
  if (driftsTurn) {
    const cellOf = (d) => d.y * n.level.width + d.x;
    const groups = new Map();
    for (let i = 0; i < n.drifts.length; i++) {
      const key = cellOf(n.drifts[i]);
      const list = groups.get(key);
      if (list) list.push(i);
      else groups.set(key, [i]);
    }
    for (const key of [...groups.keys()].sort((a, b) => a - b)) {
      const list = groups.get(key);
      if (list.length < 2) continue;
      const at = n.drifts[list[0]];
      for (const i of list) {
        const d = n.drifts[i];
        d.dir = d.dir === 'up' ? 'down'
          : d.dir === 'down' ? 'up'
          : d.dir === 'left' ? 'right'
          : 'left';
      }
      if (!hasConflictAt(n.conflicts, at.x, at.y)) {
        n.conflicts.push({ x: at.x, y: at.y, ttl: CONFLICT_TICKS });
      }
      events.push('conflict');
    }
  }

  // 12. Hits: the player is touched by a drift on its cell or one it swapped
  // cells with; carrying drops the patches, otherwise a life is lost.
  if (n.invuln > 0) {
    n.invuln -= 1;
  } else {
    let onPlayer = false;
    for (const d of n.drifts) {
      if (d.x === nx && d.y === ny) {
        onPlayer = true;
        break;
      }
    }
    let swapped = false;
    if (driftsTurn) {
      for (let i = 0; i < n.drifts.length; i++) {
        const d = n.drifts[i];
        const p = prevPos[i];
        if (d.x === px && d.y === py && p.x === nx && p.y === ny) {
          swapped = true;
          break;
        }
      }
    }
    if (onPlayer || swapped) {
      if (n.carried.length > 0) {
        n.carried = [];
        n.invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        n.lives -= 1;
        events.push('hit');
        if (n.lives <= 0) {
          n.status = 'lost';
          events.push('lost');
        } else {
          n.player = { x: n.level.start.x, y: n.level.start.y };
          n.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns: at the period, while short of patches, one free spawn point
  // (none of a patch, a drift, or the player on it) gets a fresh patch.
  if (
    n.status === 'playing'
    && n.levelTicks % n.level.spawnEvery === 0
    && n.patches.length + n.carried.length < n.level.spawns.length
  ) {
    const free = [];
    for (const sp of n.level.spawns) {
      const patched = n.patches.some((p) => p.x === sp.x && p.y === sp.y);
      const dashed = n.drifts.some((d) => d.x === sp.x && d.y === sp.y);
      const stood = n.player.x === sp.x && n.player.y === sp.y;
      if (!patched && !dashed && !stood) free.push(sp);
    }
    if (free.length > 0) {
      const a = rngInt(n.seed, free.length);
      const spot = free[a.value];
      const b = rngInt(a.seed, COLORS);
      n.seed = b.seed;
      n.patches.push({ x: spot.x, y: spot.y, color: b.value });
      events.push('spawn');
    }
  }

  n.events = events;
  return n;
}
