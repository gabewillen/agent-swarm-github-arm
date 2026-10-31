// Quorum Run's rules: the state (DESIGN.md §5), one step of the game
// (§6), and the events a step reports (§7). Pure core code: no DOM, no
// Math.random -- randomness comes only from the state's seed through the
// PRNG of src/core/rng.js.
//
// Ownership note: this module is shared. Steps 1 to 9 of §6 (this file's
// flow up to and including loading the next level or winning) are one
// owner's half; §6 steps 10 to 13 (drift movement, drift collisions,
// hits, spawns) slot into the clearly marked place inside `step`.

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

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// ---- loading (§5) -------------------------------------------------------

// One `{ x, y, color }` per spawn point, in reading order; colours drawn
// from the seed in that order, updating it with every draw.
function freshPatches(level, seed) {
  const patches = [];
  let nextSeed = seed;
  for (const spawn of level.spawns) {
    const draw = rngInt(nextSeed, COLORS);
    patches.push({ x: spawn.x, y: spawn.y, color: draw.value });
    nextSeed = draw.seed;
  }
  return { patches, seed: nextSeed };
}

// Everything loading a level sets or resets (§5). Score, lives, tick, and
// the PRNG state are the caller's business.
function loadLevel(def, seed) {
  const level = parseLevel(def);
  const { patches, seed: nextSeed } = freshPatches(level, seed);
  return {
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
    seed: nextSeed,
  };
}

export function init(seed, options) {
  const opts = options ?? {};
  const levels = opts.levels ?? LEVELS;
  const levelIndex = opts.level ?? 0;
  const first = loadLevel(levels[levelIndex], seed >>> 0);
  return {
    seed: first.seed,
    tick: 0,
    levelTicks: first.levelTicks,
    levels,
    levelIndex,
    level: first.level,
    player: first.player,
    carried: first.carried,
    patches: first.patches,
    drifts: first.drifts,
    conflicts: first.conflicts,
    score: 0,
    lives: START_LIVES,
    merges: first.merges,
    open: first.open,
    invuln: first.invuln,
    status: 'playing',
    paused: false,
    events: [],
  };
}

// ---- terrain and passability -------------------------------------------

// The level's terrain character at a cell, '#' outside the map (§5).
export function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined) return '#';
  const tile = row[x];
  return tile === undefined ? '#' : tile;
}

// A cell blocks the player when it is a wall, a hold or the exit (unless
// the level is open), per §6 step 6.
function blocksPlayer(tile, open) {
  if (tile === '#') return true;
  if (tile === 'H' || tile === 'X') return !open;
  return false;
}

function conflictAt(conflicts, x, y) {
  for (const c of conflicts) {
    if (c.x === x && c.y === y) return true;
  }
  return false;
}

export function playerCanEnter(state, conflicts, x, y, open) {
  return !blocksPlayer(tileAt(state, x, y), open) && !conflictAt(conflicts, x, y);
}

// A cell blocks a drift when it is a wall, a hold, or the exit (open or
// not), or holds a conflict; patches, pads, the player, and other drifts
// are ignored while a drift moves, per §6 step 10.
export function driftCanEnter(state, conflicts, x, y) {
  const tile = tileAt(state, x, y);
  if (tile === '#' || tile === 'H' || tile === 'X') return false;
  return !conflictAt(conflicts, x, y);
}

// ---- one step (§6) ------------------------------------------------------

function readInput(input) {
  if (input === null || typeof input !== 'object') return { move: null, pause: false };
  const move = DIRS[input.move] ? input.move : null;
  return { move, pause: input.pause === true };
}

// Conflicts age by one tick and conflicts at 0 go (§6 step 5).
function ageConflicts(conflicts) {
  const aged = [];
  for (const c of conflicts) {
    if (c.ttl > 1) aged.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }
  return aged;
}

export function step(state, input) {
  const { move, pause } = readInput(input);

  // 1. A step in a won or lost game changes nothing but the events.
  if (state.status !== 'playing') {
    return { ...state, events: [] };
  }
  // 2. A pause input flips paused; nothing else happens.
  if (pause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }
  // 3. While paused, nothing moves.
  if (state.paused) {
    return { ...state, events: [] };
  }

  // 4. The tick passes; the step's events start empty.
  const events = [];
  let seed = state.seed;
  let tick = state.tick + 1;
  let levelTicks = state.levelTicks + 1;
  let player = { x: state.player.x, y: state.player.y };
  let carried = state.carried;
  let patches = state.patches;
  let drifts = state.drifts;
  let conflicts = ageConflicts(state.conflicts);
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  let invuln = state.invuln;
  let status = state.status;

  // 5. Conflicts age.
  // 6. The player moves one cell when the target is passable.
  const dir = DIRS[move];
  if (dir && playerCanEnter(state, conflicts, player.x + dir[0], player.y + dir[1], open)) {
    player = { x: player.x + dir[0], y: player.y + dir[1] };
  }

  // 7. Pickup: the patch under the player joins the carried ones.
  if (carried.length < CARRY_MAX) {
    const index = patches.findIndex((p) => p.x === player.x && p.y === player.y);
    if (index !== -1) {
      carried = carried.concat([patches[index].color]);
      patches = patches.filter((_, i) => i !== index);
      events.push('pickup');
    }
  }

  // 8. Merge: everything carried lands on a merge pad.
  if (carried.length > 0 && tileAt(state, player.x, player.y) === 'M') {
    const n = carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    score += gain;
    merges += n;
    carried = [];
    events.push('merge');
    if (!open && merges >= state.level.quorum) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. Exit: an open exit under the player ships the level and ends the
  // step before the drifts move.
  if (open && tileAt(state, player.x, player.y) === 'X') {
    score += Math.max(0, state.level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      // Another level follows: load it, keeping score, lives, tick, and
      // the PRNG state (§5).
      const next = loadLevel(state.levels[state.levelIndex + 1], seed);
      events.push('level');
      return {
        ...state,
        seed: next.seed,
        tick,
        levelTicks: next.levelTicks,
        levelIndex: state.levelIndex + 1,
        level: next.level,
        player: next.player,
        carried: next.carried,
        patches: next.patches,
        drifts: next.drifts,
        conflicts: next.conflicts,
        score,
        merges: next.merges,
        open: next.open,
        invuln: next.invuln,
        status,
        events,
      };
    }
    // The last level is shipped: the game is won.
    status = 'won';
    events.push('won');
    return {
      ...state,
      seed,
      tick,
      levelTicks,
      player,
      carried,
      patches,
      conflicts,
      score,
      merges,
      open,
      status,
      events,
    };
  }

  // 10. Drifts move on the ticks their period divides, in array order:
  //     each tries its own direction, then the next ones clockwise, up to
  //     four; it turns to and moves one cell in the first passable target.
  //     With no passable direction it stays and keeps its direction.
  const driftsMoved = tick % state.level.driftPeriod === 0;
  const driftPre = [];
  const driftMoved = [];
  {
    const moved = [];
    for (const d of state.drifts) {
      driftPre.push(d);
      if (!driftsMoved) {
        moved.push({ x: d.x, y: d.y, dir: d.dir });
        driftMoved.push(false);
        continue;
      }
      const first = Math.max(0, CLOCKWISE.indexOf(d.dir));
      let made = null;
      for (let i = 0; i < CLOCKWISE.length; i++) {
        const dir = CLOCKWISE[(first + i) % CLOCKWISE.length];
        const dx = DIRS[dir][0];
        const dy = DIRS[dir][1];
        if (driftCanEnter(state, conflicts, d.x + dx, d.y + dy)) {
          made = { x: d.x + dx, y: d.y + dy, dir };
          break;
        }
      }
      moved.push(made || { x: d.x, y: d.y, dir: d.dir });
      driftMoved.push(made !== null);
    }
    drifts = moved;
  }

  // 11. Drift collisions, only on ticks when drifts moved: for each cell,
  //     in reading order, holding two or more drifts, every drift there
  //     reverses its direction, a conflict is added unless one is already
  //     on the cell, and one conflict event is added for the cell.
  if (driftsMoved) {
    const stacked = new Map();
    for (const d of drifts) {
      const key = d.x + ',' + d.y;
      const got = stacked.get(key);
      if (got) got.n += 1;
      else stacked.set(key, { x: d.x, y: d.y, n: 1 });
    }
    const cells = [];
    for (const c of stacked.values()) if (c.n >= 2) cells.push(c);
    cells.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const cell of cells) {
      for (const d of drifts) {
        if (d.x === cell.x && d.y === cell.y) d.dir = OPPOSITE[d.dir];
      }
      if (!conflictAt(conflicts, cell.x, cell.y)) {
        conflicts.push({ x: cell.x, y: cell.y, ttl: CONFLICT_TICKS });
      }
      events.push('conflict');
    }
  }

  // 12. Hits: none while invulnerable (which spends one tick of it);
  //     otherwise the player is hit when a drift is on the player's cell,
  //     or when a drift that moved this step swapped cells with the
  //     player. Carrying patches, the hit drops them instead of a life.
  let lives = state.lives;
  let hit = false;
  if (invuln > 0) {
    invuln -= 1;
  } else {
    for (let i = 0; i < drifts.length && !hit; i++) {
      const d = drifts[i];
      if (d.x === player.x && d.y === player.y) hit = true;
      else if (driftMoved[i] && d.x === state.player.x && d.y === state.player.y
        && driftPre[i].x === player.x && driftPre[i].y === player.y) hit = true;
    }
    if (hit) {
      if (carried.length > 0) {
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
          player = { x: state.level.start.x, y: state.level.start.y };
          invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns, while the game is still playing: one patch, on a free
  //     spawn point (no patch, not the player's cell, no drift), when the
  //     level's spawn period divides the level's ticks and a patch is
  //     missing overall. Spot draw first, then colour, both from the seed.
  if (status === 'playing' && state.level.spawnEvery > 0
    && levelTicks % state.level.spawnEvery === 0
    && patches.length + carried.length < state.level.spawns.length) {
    const free = [];
    for (const spot of state.level.spawns) {
      if (patches.some((p) => p.x === spot.x && p.y === spot.y)) continue;
      if (player.x === spot.x && player.y === spot.y) continue;
      if (drifts.some((d) => d.x === spot.x && d.y === spot.y)) continue;
      free.push(spot);
    }
    if (free.length > 0) {
      const drawSpot = rngInt(seed, free.length);
      seed = drawSpot.seed;
      const spot = free[drawSpot.value];
      const drawColor = rngInt(seed, COLORS);
      seed = drawColor.seed;
      patches = patches.concat([{ x: spot.x, y: spot.y, color: drawColor.value }]);
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
