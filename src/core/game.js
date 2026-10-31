// The rules of Quorum Run (DESIGN.md §5 to §7).
//
// `init(seed, options)` builds the first state, `step(state, input)` plays
// one tick of the thirteen steps of §6, and `tileAt(state, x, y)` reads a
// terrain character. `step` never changes its state: every field it
// touches comes back fresh, and every state is plain JSON.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS,
  DIRS, CLOCKWISE,
} from './constants.js';
import { parseLevel } from './level.js';
import { rngInt } from './rng.js';
import { LEVELS } from '../data/levels.js';

// A drift that loses a collision turns halfway around.
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The terrain character at a cell, or '#' anywhere off the map.
function terrain(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

// Cells the player may stand on: floor, a merge pad, and a hold or the
// exit once the level is open, but never a wall or a conflict.
function passableToPlayer(level, open, conflicts, x, y) {
  const t = terrain(level, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !open) return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// Cells a drift may enter: holds and the exit block even when open.
function passableToDrift(level, conflicts, x, y) {
  const t = terrain(level, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// One drift's direction-then-clockwise try: the first passable turn wins.
// A drift boxed in everywhere stays and keeps its direction.
function moveDrift(d, level, conflicts) {
  const start = CLOCKWISE.indexOf(d.dir);
  for (let k = 0; k < 4; k++) {
    const dir = CLOCKWISE[(start + k) % 4];
    const tx = d.x + DIRS[dir][0];
    const ty = d.y + DIRS[dir][1];
    if (passableToDrift(level, conflicts, tx, ty)) return { x: tx, y: ty, dir };
  }
  return d;
}

// Build the state of one level: everything per-level resets, the carryover
// is kept, and one fresh colour is drawn for every spawn point in reading
// order. Used by `init` and by the exit that ships a level.
function loadLevel(levels, levelIndex, seed, carry) {
  const level = parseLevel(levels[levelIndex]);
  const s = {
    seed: seed >>> 0,
    tick: carry.tick,
    levelTicks: 0,
    levels,
    levelIndex,
    level,
    player: { x: level.start.x, y: level.start.y },
    carried: [],
    patches: [],
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    conflicts: [],
    score: carry.score,
    lives: carry.lives,
    merges: 0,
    open: false,
    invuln: 0,
    status: carry.status,
    paused: carry.paused,
    events: [],
  };
  for (const spawn of level.spawns) {
    const draw = rngInt(s.seed, COLORS);
    s.seed = draw.seed;
    s.patches.push({ x: spawn.x, y: spawn.y, color: draw.value });
  }
  return s;
}

export function init(seed, options) {
  const opts = options || {};
  const levels = opts.levels === undefined ? LEVELS : opts.levels;
  const levelIndex = opts.level === undefined ? 0 : opts.level;
  return loadLevel(levels, levelIndex, seed, {
    tick: 0, score: 0, lives: START_LIVES, status: 'playing', paused: false,
  });
}

export function tileAt(state, x, y) {
  return terrain(state.level, x, y);
}

export function step(state, input) {
  // The input contract: a missing or null input, or a missing field,
  // means no move and no pause; an unknown move is no move.
  const move = input !== null && input !== undefined && DIRS[input.move] ? input.move : null;
  const pause = !!(input !== null && input !== undefined && input.pause === true);

  // 1. A finished game freezes, except its event list empties.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause input flips the pause and ticks nothing.
  if (pause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }

  // 3. While paused, the world waits.
  if (state.paused) return { ...state, events: [] };

  const level = state.level;
  const events = [];

  // 4. The tick passes.
  const tick = state.tick + 1;
  let levelTicks = state.levelTicks + 1;

  // 5. Conflicts age; an empty conflict cell frees up.
  const conflicts = state.conflicts
    .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. The player moves when the target cell lets the player through;
  //    the previous cell is remembered for the swap check of step 12.
  const prevX = state.player.x;
  const prevY = state.player.y;
  let player = { x: prevX, y: prevY };
  if (move) {
    const tx = player.x + DIRS[move][0];
    const ty = player.y + DIRS[move][1];
    if (passableToPlayer(level, state.open, conflicts, tx, ty)) player = { x: tx, y: ty };
  }

  // 7. Pickup: a patch under the player joins the carried stack, in
  //    pickup order, while there is room.
  let patches = state.patches.map((p) => ({ x: p.x, y: p.y, color: p.color }));
  let carried = [...state.carried];
  const hand = patches.findIndex((p) => p.x === player.x && p.y === player.y);
  if (hand !== -1 && carried.length < CARRY_MAX) {
    carried.push(patches[hand].color);
    patches.splice(hand, 1);
    events.push('pickup');
  }

  // 8. Merge on a merge pad: points per patch squared, a full-house bonus,
  //    and the quorum event once per level.
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  if (terrain(level, player.x, player.y) === 'M' && carried.length > 0) {
    const n = carried.length;
    score += PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) score += SAME_COLOR_BONUS * n;
    merges += n;
    carried = [];
    events.push('merge');
    if (!open && merges >= level.quorum) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. Exit: an open exit pays the time bonus, then ships the level or
  //    wins the game. Either way the step ends here, before the drifts.
  if (open && terrain(level, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      const next = loadLevel(state.levels, state.levelIndex + 1, state.seed, {
        tick, score, lives: state.lives, status: 'playing', paused: false,
      });
      return { ...next, events: ['level'] };
    }
    return {
      seed: state.seed, tick, levelTicks, levels: state.levels, levelIndex: state.levelIndex,
      level, player, carried, patches, drifts: state.drifts.map((d) => ({ ...d })), conflicts,
      score, lives: state.lives, merges, open, invuln: state.invuln,
      status: 'won', paused: state.paused, events: ['won'],
    };
  }

  // 10 and 11 run only on a patrol tick; 12 and 13 run every tick.
  const patrol = tick % level.driftPeriod === 0;
  let drifts = state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  if (patrol) {
    // 10. The drifts patrol, each trying its way then clockwise.
    drifts = drifts.map((d) => moveDrift(d, level, conflicts));

    // 11. Pile-ups: every cell holding two or more drifts reverses them,
    //     leaves at most one conflict behind, and reports the collision
    //     once, cells in reading order.
    for (let cy = 0; cy < level.height; cy++) {
      for (let cx = 0; cx < level.width; cx++) {
        let crowd = 0;
        for (const d of drifts) if (d.x === cx && d.y === cy) crowd++;
        if (crowd < 2) continue;
        for (const d of drifts) if (d.x === cx && d.y === cy) d.dir = OPPOSITE[d.dir];
        if (!conflicts.some((c) => c.x === cx && c.y === cy)) {
          conflicts.push({ x: cx, y: cy, ttl: CONFLICT_TICKS });
        }
        events.push('conflict');
      }
    }
  }

  // 12. Hits: immunity first, then a drift standing on the player, or a
  //     drift that just swapped cells with the moving player.
  let invuln = state.invuln;
  let lives = state.lives;
  let status = state.status;
  if (invuln > 0) {
    invuln -= 1;
  } else {
    let hit = false;
    for (let i = 0; i < drifts.length && !hit; i++) {
      const d = drifts[i];
      const before = state.drifts[i];
      hit = (d.x === player.x && d.y === player.y)
        || (patrol && d.x === prevX && d.y === prevY
          && before.x === player.x && before.y === player.y);
    }
    if (hit) {
      if (carried.length > 0) {
        // Carrying: the patches are lost instead of a life.
        carried = [];
        invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        lives -= 1;
        events.push('hit');
        if (lives === 0) {
          status = 'lost';
          events.push('lost');
        } else {
          player = { x: level.start.x, y: level.start.y };
          invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns: one fresh patch per spawnEvery level ticks, drawn from the
  //     running seed on a spawn point no patch, drift, or player holds.
  let seed = state.seed;
  if (status === 'playing' && levelTicks % level.spawnEvery === 0
    && patches.length + carried.length < level.spawns.length) {
    const booked = new Set(patches.map((p) => `${p.x},${p.y}`));
    booked.add(`${player.x},${player.y}`);
    for (const d of drifts) booked.add(`${d.x},${d.y}`);
    const free = level.spawns.filter((sp) => !booked.has(`${sp.x},${sp.y}`));
    if (free.length > 0) {
      const spot = rngInt(seed, free.length);
      const colour = rngInt(spot.seed, COLORS);
      patches.push({ x: free[spot.value].x, y: free[spot.value].y, color: colour.value });
      seed = colour.seed;
      events.push('spawn');
    }
  }

  return {
    seed, tick, levelTicks, levels: state.levels, levelIndex: state.levelIndex, level,
    player, carried, patches, drifts, conflicts, score, lives, merges, open, invuln,
    status, paused: state.paused, events,
  };
}
