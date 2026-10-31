// The rules of Quorum Run (DESIGN.md §5 to §7). `init` builds the first
// state, `step` plays one input, and `tileAt` reads the terrain. Both are
// pure: they never change the state or input they are given, and every
// state they return is plain JSON data.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// Loading a level (§5, at init and on reaching an open exit): the parsed
// level, the player at its start, one patch per spawn point in reading
// order with fresh colour draws, copies of its drifts, and the per-level
// fields reset. Score, lives, tick, and the PRNG state stay as they are.
function loadLevel(def, seed, levelIndex) {
  const level = parseLevel(def);
  let s = seed >>> 0;
  const patches = [];
  for (const sp of level.spawns) {
    const r = rngInt(s, COLORS);
    patches.push({ x: sp.x, y: sp.y, color: r.value });
    s = r.seed;
  }
  return {
    seed: s,
    level,
    levelIndex,
    player: { x: level.start.x, y: level.start.y },
    carried: [],
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
  };
}

export function init(seed, options = {}) {
  const levels = options.levels ?? LEVELS;
  const levelIndex = options.level ?? 0;
  return {
    ...loadLevel(levels[levelIndex], seed, levelIndex),
    levels,
    tick: 0,
    score: 0,
    lives: START_LIVES,
    status: 'playing',
    paused: false,
    events: [],
  };
}

export function tileAt(state, x, y) {
  const tiles = state.level.tiles;
  const row = tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

// A cell is passable to the player when it is on the map, is not a wall,
// is a hold or the exit only when `open`, and holds no conflict.
function playerPassable(level, open, x, y, conflicts) {
  const ch = tileAt({ level }, x, y);
  if (ch === '#') return false;
  if (ch === 'H' || ch === 'X') return open;
  if (conflicts.some((c) => c.x === x && c.y === y)) return false;
  return true;
}

// A cell is passable to a drift when it is on the map and a floor cell or
// a merge pad: holds and the exit are walls to a drift, open or not.
function driftPassable(level, x, y, conflicts) {
  const ch = tileAt({ level }, x, y);
  if (ch !== '.' && ch !== 'M') return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// The step's input: a missing or null input, or a missing field, means no
// move and no pause (§6 preamble).
function inputOf(input) {
  const ok = input !== null && typeof input === 'object';
  return {
    move: ok && typeof input.move === 'string' ? input.move : null,
    pause: ok && input.pause === true,
  };
}

function conflictAt(conflicts, x, y) {
  return conflicts.some((c) => c.x === x && c.y === y);
}

export function step(state, input) {
  // 1. A finished game stands still.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. Pause flips the flag, nothing else moves.
  const { move, pause } = inputOf(input);
  if (pause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }

  // 3. A paused game stands still.
  if (state.paused) return { ...state, events: [] };

  const events = [];
  const level = state.level;
  const next = {
    ...state,
    tick: state.tick + 1,
    levelTicks: state.levelTicks + 1,
    events,
  };

  // 5. Conflicts age; at 0 they are gone.
  const conflicts = [];
  for (const c of state.conflicts ?? []) {
    const ttl = c.ttl - 1;
    if (ttl > 0) conflicts.push({ x: c.x, y: c.y, ttl });
  }
  next.conflicts = conflicts;

  // 6. The player moves one cell, when the target cell allows it.
  const player = state.player;
  const before = { x: player.x, y: player.y };
  let px = player.x;
  let py = player.y;
  if (move && DIRS[move]) {
    const [dx, dy] = DIRS[move];
    if (playerPassable(level, state.open, px + dx, py + dy, conflicts)) {
      px += dx;
      py += dy;
    }
  }
  next.player = { x: px, y: py };

  next.patches = [...state.patches];
  next.carried = [...state.carried];

  // 7. Pickup: a lying patch on the player's cell, with a hand free.
  if (next.carried.length < CARRY_MAX) {
    const i = next.patches.findIndex((p) => p.x === px && p.y === py);
    if (i !== -1) {
      next.carried = [...next.carried, next.patches[i].color];
      next.patches = next.patches.filter((p, j) => j !== i);
      events.push('pickup');
    }
  }

  // 8. Merge on a pad: the carried patches in one go.
  const n = next.carried.length;
  if (n > 0 && tileAt({ level }, px, py) === 'M') {
    const same = next.carried.every((c) => c === next.carried[0]);
    next.score = next.score + PATCH_BASE * n * n + (n >= 2 && same ? SAME_COLOR_BONUS * n : 0);
    next.merges += n;
    next.carried = [];
    events.push('merge');
    if (!next.open && next.merges >= level.quorum) {
      next.open = true;
      events.push('quorum');
    }
  }

  // 9. An open exit ships the level: time bonus, next level, or the win.
  if (next.open && tileAt({ level }, px, py) === 'X') {
    next.score += Math.max(0, level.par - next.levelTicks) * TIME_BONUS_PER_TICK;
    if (next.levelIndex + 1 < next.levels.length) {
      const loaded = loadLevel(next.levels[next.levelIndex + 1], next.seed, next.levelIndex + 1);
      Object.assign(next, loaded);
      events.push('level');
    } else {
      next.status = 'won';
      events.push('won');
    }
    return next; // the step ends here, before the drifts move
  }

  // 10. Drifts move on their period, each turning clockwise from its own
  // direction to the first passable target.
  const driftsMoved = next.tick % level.driftPeriod === 0;
  let drifts = state.drifts;
  const driftBefore = [];
  const driftMovedFlag = [];
  if (driftsMoved) {
    drifts = state.drifts.map((d, i) => {
      const copy = { x: d.x, y: d.y, dir: d.dir };
      driftBefore[i] = { x: d.x, y: d.y };
      driftMovedFlag[i] = false;
      const from = CLOCKWISE.indexOf(d.dir);
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(from + k) % 4];
        const [dx, dy] = DIRS[dir];
        if (driftPassable(level, copy.x + dx, copy.y + dy, conflicts)) {
          copy.dir = dir;
          copy.x += dx;
          copy.y += dy;
          driftMovedFlag[i] = true;
          break;
        }
      }
      return copy;
    });
    next.drifts = drifts;

    // 11. Two or more drifts on one cell reverse, and leave a conflict
    // there unless one already is, once per cell, in reading order.
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const here = drifts.filter((d) => d.x === x && d.y === y);
        if (here.length >= 2) {
          for (const d of here) d.dir = OPPOSITE[d.dir] ?? d.dir;
          if (!conflictAt(conflicts, x, y)) conflicts.push({ x, y, ttl: CONFLICT_TICKS });
          events.push('conflict');
        }
      }
    }
  }

  // 12. Hits: none while invulnerable; a drift on the player's cell, or
  // one that swapped cells with it, drops carried patches or a life.
  if (next.invuln > 0) {
    next.invuln -= 1;
  } else {
    let hit = drifts.some((d) => d.x === px && d.y === py);
    if (!hit && driftsMoved) {
      for (let i = 0; i < drifts.length; i++) {
        if (driftMovedFlag[i] && drifts[i].x === before.x && drifts[i].y === before.y
          && driftBefore[i].x === px && driftBefore[i].y === py) {
          hit = true;
          break;
        }
      }
    }
    if (hit) {
      if (next.carried.length > 0) {
        next.carried = [];
        next.invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        next.lives -= 1;
        events.push('hit');
        if (next.lives <= 0) {
          next.lives = 0;
          next.status = 'lost';
          events.push('lost');
        } else {
          next.player = { x: level.start.x, y: level.start.y };
          next.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns: one patch on a free spawn point, position drawn first,
  // then its colour.
  if (next.status === 'playing'
    && next.levelTicks % level.spawnEvery === 0
    && next.patches.length + next.carried.length < level.spawns.length) {
    const free = level.spawns.filter((sp) => !conflictAt(next.patches, sp.x, sp.y)
      && !(sp.x === next.player.x && sp.y === next.player.y)
      && !drifts.some((d) => d.x === sp.x && d.y === sp.y));
    if (free.length > 0) {
      const spot = rngInt(next.seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      next.patches = [...next.patches, { x: free[spot.value].x, y: free[spot.value].y, color: color.value }];
      next.seed = color.seed;
      events.push('spawn');
    }
  }

  return next;
}
