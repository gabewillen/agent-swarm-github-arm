// DESIGN.md §5–§7: the rules of Quorum Run. `init` builds the first state,
// `step` takes one playing step, and `tileAt` reads terrain. The state and
// everything it holds is plain JSON data; `init` and `step` are pure and
// never change the state, the options, or anything reachable from them.
// Randomness comes only from `state.seed`, drawn through §3's `rngInt`.
import {
  CARRY_MAX,
  START_LIVES,
  INVULN_TICKS,
  CONFLICT_TICKS,
  PATCH_BASE,
  SAME_COLOR_BONUS,
  TIME_BONUS_PER_TICK,
  COLORS,
  DIRS,
  CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

const MOVES = ['up', 'right', 'down', 'left'];
const DIR_INDEX = { up: 0, right: 1, down: 2, left: 3 };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The level's terrain at a cell, '#' outside the map.
function tileOf(level, x, y) {
  if (y < 0 || y >= level.height || x < 0 || x >= level.width) return '#';
  return level.tiles[y][x];
}

// A cell passable to the player: never a wall; a hold or the exit only
// once the quorum is reached.
function passableToPlayer(tile, open) {
  if (tile === '#') return false;
  if (tile === 'H' || tile === 'X') return !!open;
  return true;
}

// A cell passable to a drift: never a wall, a hold, or the exit, open or
// not.
function passableToDrift(tile) {
  return tile !== '#' && tile !== 'H' && tile !== 'X';
}

function hasConflictAt(conflicts, x, y) {
  return conflicts.some((c) => c.x === x && c.y === y);
}

// Load the level at `levelIndex` into `base`: parse it, place the player,
// draw one patch colour per spawn point in reading order from the running
// seed, copy the drifts, and reset the per-level fields. Returns the state
// and the seed after the draws.
function loadLevel(base, levels, levelIndex, seed) {
  const level = parseLevel(levels[levelIndex]);
  let s = seed >>> 0;
  const patches = level.spawns.map((sp) => {
    const draw = rngInt(s, COLORS);
    s = draw.seed;
    return { x: sp.x, y: sp.y, color: draw.value };
  });
  return {
    ...base,
    seed: s,
    levelIndex,
    level,
    player: { x: level.start.x, y: level.start.y },
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    carried: [],
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
  };
}

// §5: the first state.
export function init(seed, options = {}) {
  const levels = options && options.levels ? options.levels : LEVELS;
  const levelIndex =
    options && options.level !== undefined && options.level !== null
      ? options.level
      : 0;
  const state = loadLevel({}, levels, levelIndex, seed);
  return {
    ...state,
    levels,
    tick: 0,
    score: 0,
    lives: START_LIVES,
    status: 'playing',
    paused: false,
    events: [],
  };
}

// The level's terrain at (x, y), '#' outside the map.
export function tileAt(state, x, y) {
  return tileOf(state.level, x, y);
}

// §6: one step.
export function step(state, input) {
  const move = input && MOVES.includes(input.move) ? input.move : null;
  const pause = !!(input && input.pause === true);

  // 1. A game that no longer plays never changes but its events.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause input flips the flag and nothing else.
  if (pause) {
    return {
      ...state,
      paused: !state.paused,
      events: [state.paused ? 'resume' : 'pause'],
    };
  }

  // 3. A paused game waits.
  if (state.paused) return { ...state, events: [] };

  // 4. The step ticks.
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;
  const events = [];
  const level = state.level;
  let seed = state.seed;
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  let lives = state.lives;
  let invuln = state.invuln;
  let status = state.status;

  // 5. Conflicts age: one tick of life off, those at 0 go.
  const conflicts = state.conflicts
    .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. The player moves one cell when the target is passable.
  const prevPlayer = state.player;
  const player = { x: state.player.x, y: state.player.y };
  if (move) {
    const nx = player.x + DIRS[move][0];
    const ny = player.y + DIRS[move][1];
    if (
      passableToPlayer(tileOf(level, nx, ny), open) &&
      !hasConflictAt(conflicts, nx, ny)
    ) {
      player.x = nx;
      player.y = ny;
    }
  }

  // 7. Pickup: a patch under the player joins the carry order.
  let carried = state.carried.slice();
  const patches = state.patches.slice();
  if (carried.length < CARRY_MAX) {
    const idx = patches.findIndex((p) => p.x === player.x && p.y === player.y);
    if (idx >= 0) {
      carried.push(patches[idx].color);
      patches.splice(idx, 1);
      events.push('pickup');
    }
  }

  // 8. Merge on a pad.
  const hand = carried.length;
  if (hand > 0 && tileOf(level, player.x, player.y) === 'M') {
    let gain = PATCH_BASE * hand * hand;
    if (hand >= 2 && carried.every((c) => c === carried[0])) {
      gain += SAME_COLOR_BONUS * hand;
    }
    score += gain;
    merges += hand;
    carried = [];
    events.push('merge');
    if (merges >= level.quorum && !open) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. The exit, once open, ships the level: the step ends here.
  if (open && tileOf(level, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      events.push('level');
      const next = loadLevel(state, state.levels, state.levelIndex + 1, seed);
      return {
        ...next,
        tick,
        levels: state.levels,
        score,
        lives,
        status: 'playing',
        paused: state.paused,
        events,
      };
    }
    events.push('won');
    return {
      ...state,
      seed,
      tick,
      levelTicks,
      player: { x: player.x, y: player.y },
      carried,
      patches,
      conflicts,
      score,
      merges,
      open,
      invuln,
      status: 'won',
      events,
    };
  }

  // 10 and 11. Drifts move on their phase of tick; merges of movers leave
  // conflicts, in reading order.
  const drifts = state.drifts.map((d) => ({
    x: d.x,
    y: d.y,
    dir: d.dir,
    prev: null,
    moved: false,
  }));
  if (tick % level.driftPeriod === 0) {
    for (const d of drifts) {
      const start = DIR_INDEX[d.dir] || 0;
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(start + k) % 4];
        const nx = d.x + DIRS[dir][0];
        const ny = d.y + DIRS[dir][1];
        if (
          passableToDrift(tileOf(level, nx, ny)) &&
          !hasConflictAt(conflicts, nx, ny)
        ) {
          d.prev = { x: d.x, y: d.y };
          d.dir = dir;
          d.x = nx;
          d.y = ny;
          d.moved = true;
          break;
        }
      }
    }
    for (let cy = 0; cy < level.height; cy++) {
      for (let cx = 0; cx < level.width; cx++) {
        const here = drifts.filter((d) => d.x === cx && d.y === cy);
        if (here.length < 2) continue;
        for (const d of here) d.dir = OPPOSITE[d.dir];
        if (!hasConflictAt(conflicts, cx, cy)) {
          conflicts.push({ x: cx, y: cy, ttl: CONFLICT_TICKS });
        }
        events.push('conflict');
      }
    }
  }

  // 12. Hits.
  if (invuln > 0) {
    invuln -= 1;
  } else {
    const hitNow = drifts.some((d) => d.x === player.x && d.y === player.y);
    let swapped = false;
    if (!hitNow) {
      for (const d of drifts) {
        if (!d.moved || !d.prev) continue;
        if (
          d.x === prevPlayer.x &&
          d.y === prevPlayer.y &&
          d.prev.x === player.x &&
          d.prev.y === player.y
        ) {
          swapped = true;
          break;
        }
      }
    }
    if (hitNow || swapped) {
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
          player.x = level.start.x;
          player.y = level.start.y;
          invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns, one per tick when the level's spawn phase is up.
  if (status === 'playing') {
    if (levelTicks % level.spawnEvery === 0) {
      if (patches.length + carried.length < level.spawns.length) {
        const free = [];
        for (const sp of level.spawns) {
          const taken =
            patches.some((p) => p.x === sp.x && p.y === sp.y) ||
            (player.x === sp.x && player.y === sp.y) ||
            drifts.some((d) => d.x === sp.x && d.y === sp.y);
          if (!taken) free.push(sp);
        }
        if (free.length > 0) {
          const spotDraw = rngInt(seed, free.length);
          const spot = free[spotDraw.value];
          const colorDraw = rngInt(spotDraw.seed, COLORS);
          patches.push({ x: spot.x, y: spot.y, color: colorDraw.value });
          events.push('spawn');
          seed = colorDraw.seed;
        }
      }
    }
  }

  return {
    ...state,
    seed,
    tick,
    levelTicks,
    player: { x: player.x, y: player.y },
    carried,
    patches,
    drifts: drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    conflicts,
    score,
    lives,
    merges,
    open,
    invuln,
    status,
    events,
  };
}
