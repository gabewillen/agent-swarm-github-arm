// The rules of Quorum Run (DESIGN.md §5 to §7): the state, `init`,
// `step`, and `tileAt`. Everything here is pure: a step never changes the
// state it is given, and randomness comes only from the state's seed
// through `rngInt`, so a run replays from one number.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

// Where a drift goes when it reverses: the pair across the cell.
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The terrain character at a cell of the level, '#' off the map.
function terrainAt(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

function conflictOn(conflicts, x, y) {
  return conflicts.some((c) => c.x === x && c.y === y);
}

// Build a state and load the level at `levelIndex` into it: §5's loading,
// used at `init` and at every open exit that has another level after it.
// It draws fresh patch colours from the running seed, in reading order,
// and resets the per-level fields while keeping score, lives, tick, seed,
// and everything the caller set (levels, levelIndex, events, ...).
function loadLevel(s) {
  const level = parseLevel(s.levels[s.levelIndex]);
  let seed = s.seed;
  const patches = [];
  for (const sp of level.spawns) {
    const r = rngInt(seed, COLORS);
    patches.push({ x: sp.x, y: sp.y, color: r.value });
    seed = r.seed;
  }
  return {
    ...s,
    seed,
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
  };
}

export function init(seed, options) {
  const opts = options ?? {};
  return loadLevel({
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    levels: opts.levels ?? LEVELS,
    levelIndex: opts.level ?? 0,
    player: { x: 0, y: 0 },
    carried: [],
    patches: [],
    drifts: [],
    conflicts: [],
    score: 0,
    lives: START_LIVES,
    merges: 0,
    open: false,
    invuln: 0,
    status: 'playing',
    paused: false,
    events: [],
  });
}

// The level's terrain character at a cell ('#', '.', 'M', 'X', or 'H'),
// and '#' outside the map.
export function tileAt(state, x, y) {
  return terrainAt(state.level, x, y);
}

export function step(state, input) {
  const inp = input ?? null;
  const move = inp !== null && inp.move != null ? inp.move : null;
  const pause = inp !== null && inp.pause === true;

  // 1. A settled game stays settled; only its events clear.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause flip changes nothing else.
  if (pause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }

  // 3. Paused: time does not pass.
  if (state.paused) return { ...state, events: [] };

  const level = state.level;
  const events = [];

  // 4. The clock moves.
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;
  let seed = state.seed;

  // 5. Conflicts age; the ones with no life left go.
  const conflicts = [];
  for (const c of state.conflicts) {
    const ttl = c.ttl - 1;
    if (ttl > 0) conflicts.push({ x: c.x, y: c.y, ttl });
  }

  // 6. The player moves one cell when the target is passable: not a wall,
  // not a hold or the exit unless open, and no conflict on it.
  let player = state.player;
  const dir = move !== null ? DIRS[move] : undefined;
  if (dir) {
    const nx = player.x + dir[0];
    const ny = player.y + dir[1];
    const t = terrainAt(level, nx, ny);
    const blocked = t === '#'
      || ((t === 'H' || t === 'X') && !state.open)
      || conflictOn(conflicts, nx, ny);
    if (!blocked) player = { x: nx, y: ny };
  }

  // 7. Pickup: a patch on the player's cell, with hands free enough.
  let carried = state.carried;
  let patches = state.patches;
  if (carried.length < CARRY_MAX) {
    const i = patches.findIndex((p) => p.x === player.x && p.y === player.y);
    if (i >= 0) {
      carried = [...carried, patches[i].color];
      patches = patches.filter((_, k) => k !== i);
      events.push('pickup');
    }
  }

  // 8. Merge: patches merged on a merge pad score, and enough of them
  // open the level's doors.
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  const n = carried.length;
  if (n > 0 && terrainAt(level, player.x, player.y) === 'M') {
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) gain += SAME_COLOR_BONUS * n;
    score += gain;
    merges += n;
    carried = [];
    events.push('merge');
    if (merges >= level.quorum && !open) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. Exit: an open exit under the player ships the level — bonus, next
  // level or the win — and ends the step here.
  if (open && terrainAt(level, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      events.push('level');
      return loadLevel({ ...state, seed, tick, score, levelIndex: state.levelIndex + 1, events });
    }
    return {
      ...state, seed, tick, levelTicks, player, carried, patches, conflicts,
      score, merges, open,
      events: [...events, 'won'], status: 'won',
    };
  }

  // 10. Drifts move on their period's ticks, in array order, first
  // direction that is passable, turning clockwise through four tries.
  let drifts = state.drifts;
  const moved = tick % level.driftPeriod === 0;
  if (moved) {
    drifts = state.drifts.map((d) => {
      let { x, y, dir: facing } = d;
      const from = CLOCKWISE.indexOf(facing);
      for (let i = 0; i < 4; i++) {
        const cand = CLOCKWISE[(from + i) % 4];
        const dd = DIRS[cand];
        const nx = x + dd[0];
        const ny = y + dd[1];
        const t = terrainAt(level, nx, ny);
        if (t !== '#' && t !== 'H' && t !== 'X' && !conflictOn(conflicts, nx, ny)) {
          x = nx;
          y = ny;
          facing = cand;
          break;
        }
      }
      return { x, y, dir: facing };
    });
  }

  // 11. On a move tick, cells holding two or more drifts reverse them and
  // leave a conflict, in reading order.
  if (moved) {
    const cells = [];
    const cellAt = new Map();
    for (let i = 0; i < drifts.length; i++) {
      const key = drifts[i].x + ',' + drifts[i].y;
      if (!cellAt.has(key)) {
        cellAt.set(key, cells.length);
        cells.push({ x: drifts[i].x, y: drifts[i].y, ids: [] });
      }
      cells[cellAt.get(key)].ids.push(i);
    }
    cells.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    for (const cell of cells) {
      if (cell.ids.length < 2) continue;
      for (const i of cell.ids) {
        drifts[i] = { ...drifts[i], dir: REVERSE[drifts[i].dir] ?? drifts[i].dir };
      }
      if (!conflictOn(conflicts, cell.x, cell.y)) {
        conflicts.push({ x: cell.x, y: cell.y, ttl: CONFLICT_TICKS });
      }
      events.push('conflict');
    }
  }

  // 12. Hits: a drift on the player, or a drift that swapped cells with
  // the player this step. A hit drops carried patches; empty-handed it
  // costs a life, and the last one loses the game.
  let invuln = state.invuln;
  let lives = state.lives;
  let status = 'playing';
  if (invuln > 0) {
    invuln -= 1;
  } else {
    let hit = drifts.some((d) => d.x === player.x && d.y === player.y);
    if (!hit && moved) {
      for (let i = 0; i < drifts.length && !hit; i++) {
        const d = drifts[i];
        const o = state.drifts[i];
        if (o === undefined) continue;
        const didMove = o.x !== d.x || o.y !== d.y;
        const swapped = didMove
          && o.x === player.x && o.y === player.y
          && d.x === state.player.x && d.y === state.player.y;
        if (swapped) hit = true;
      }
    }
    if (hit) {
      if (carried.length > 0) {
        carried = [];
        invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        lives -= 1;
        events.push('hit');
        if (lives <= 0) {
          status = 'lost';
          events.push('lost');
        } else {
          player = { x: level.start.x, y: level.start.y };
          invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns: one patch per period on a free spawn point, point drawn
  // first, colour second, until the map holds as many as it ever had.
  if (status === 'playing'
    && levelTicks % level.spawnEvery === 0
    && patches.length + carried.length < level.spawns.length) {
    const free = [];
    for (const sp of level.spawns) {
      if (patches.some((p) => p.x === sp.x && p.y === sp.y)) continue;
      if (player.x === sp.x && player.y === sp.y) continue;
      if (drifts.some((d) => d.x === sp.x && d.y === sp.y)) continue;
      free.push(sp);
    }
    if (free.length > 0) {
      const spot = rngInt(seed, free.length);
      const sp = free[spot.value];
      const color = rngInt(spot.seed, COLORS);
      patches = [...patches, { x: sp.x, y: sp.y, color: color.value }];
      seed = color.seed;
      events.push('spawn');
    }
  }

  return {
    ...state,
    seed,
    tick,
    levelTicks,
    player,
    carried,
    patches,
    drifts,
    conflicts,
    score,
    merges,
    open,
    invuln,
    lives,
    status,
    events,
  };
}
