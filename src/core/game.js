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
  PATCH_BASE,
  SAME_COLOR_BONUS,
  TIME_BONUS_PER_TICK,
  COLORS,
  DIRS,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

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

  // ---- §6 steps 10 to 13 (drift movement, drift collisions, hits,
  // spawns) belong here: insert them between this line and the assembly
  // below, reassigning the working values above (drifts, conflicts,
  // carried, patches, score, lives, invuln, status, seed, events, ...).
  // Reaching this point means the level did not end this step.

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
    status,
    events,
  };
}
