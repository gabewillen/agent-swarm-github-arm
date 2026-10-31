// Quorum Run's rules: the state (DESIGN.md §5), one step of the game
// (§6), and the events a step reports (§7). Pure core code: no DOM, no
// clock, and no source of chance but the state's own seed, drawn through
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
// not), per §6 step 10; merge pads, patches, the player, and other
// drifts never block one.
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
  let lives = state.lives;
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

  // Reaching this point means the level did not end this step, so the
  // drifts get their say: §6 steps 10 to 13 (drift movement, drift
  // collisions, hits, spawns).

  // 10. On a drift tick (tick % driftPeriod === 0), each drift in array
  // order tries its own direction first, then each next direction
  // clockwise, and turns to and moves one cell in the first passable one;
  // with no passable direction it stays and keeps its direction.
  const driftsMove = tick % state.level.driftPeriod === 0;
  let driftMoved = null;
  if (driftsMove) {
    drifts = state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
    driftMoved = state.drifts.map(() => false);
    for (let i = 0; i < drifts.length; i++) {
      const d = drifts[i];
      const from = CLOCKWISE.indexOf(d.dir);
      for (let k = 0; k < CLOCKWISE.length; k++) {
        const nextDir = CLOCKWISE[(from + k) % CLOCKWISE.length];
        const [dx, dy] = DIRS[nextDir];
        const nx = d.x + dx;
        const ny = d.y + dy;
        if (driftCanEnter(state, conflicts, nx, ny)) {
          d.x = nx;
          d.y = ny;
          d.dir = nextDir;
          driftMoved[i] = true;
          break;
        }
      }
      // No passable direction: the drift stays and keeps its direction.
    }
  }

  // 11. On a tick when drifts moved, every cell holding two or more
  // drifts, in reading order, reverses each drift there and leaves a
  // conflict (one per cell, so an existing one is reused), with one
  // conflict event for the cell.
  if (driftsMove) {
    const stacked = new Map();
    for (const d of drifts) {
      const key = `${d.x},${d.y}`;
      stacked.set(key, (stacked.get(key) ?? 0) + 1);
    }
    const cells = [...stacked.entries()]
      .filter(([, n]) => n >= 2)
      .map(([key]) => {
        const sep = key.indexOf(',');
        return { x: Number(key.slice(0, sep)), y: Number(key.slice(sep + 1)) };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);
    for (const { x, y } of cells) {
      for (const d of drifts) {
        if (d.x === x && d.y === y) {
          d.dir = d.dir === 'up' ? 'down'
            : d.dir === 'down' ? 'up'
            : d.dir === 'left' ? 'right'
            : 'left';
        }
      }
      if (!conflictAt(conflicts, x, y)) {
        conflicts = conflicts.concat([{ x, y, ttl: CONFLICT_TICKS }]);
      }
      events.push('conflict');
    }
  }

  // 12. Hits: while invulnerable the timer falls by one and nothing
  // hits. Otherwise a drift on the player's cell, or a drift that moved
  // this step and swapped cells with the player (it is now where the
  // player was before step 6 and was where the player is now), hits:
  // carrying, the carried patches drop; empty-handed, a life is lost.
  if (invuln > 0) {
    invuln -= 1;
  } else {
    const onPlayer = drifts.some((d) => d.x === player.x && d.y === player.y);
    const swapped = driftsMove && drifts.some((d, i) =>
      driftMoved[i] &&
      d.x === state.player.x && d.y === state.player.y &&
      state.drifts[i].x === player.x && state.drifts[i].y === player.y);
    if (onPlayer || swapped) {
      if (carried.length > 0) {
        carried = [];
        invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        lives = Math.max(0, lives - 1);
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

  // 13. Spawns: on spawn ticks, while the game still plays and the
  // spawn points outnumber the patches in play, one patch appears on a
  // free spawn point (no patch, not the player's cell, no drift on it),
  // the spot drawn from the seed, then its colour.
  if (
    status === 'playing' &&
    levelTicks % state.level.spawnEvery === 0 &&
    patches.length + carried.length < state.level.spawns.length
  ) {
    const free = state.level.spawns.filter((sp) =>
      !patches.some((p) => p.x === sp.x && p.y === sp.y) &&
      !(player.x === sp.x && player.y === sp.y) &&
      !drifts.some((d) => d.x === sp.x && d.y === sp.y));
    if (free.length > 0) {
      const spotDraw = rngInt(seed, free.length);
      seed = spotDraw.seed;
      const spot = free[spotDraw.value];
      const colorDraw = rngInt(seed, COLORS);
      seed = colorDraw.seed;
      patches = patches.concat([{ x: spot.x, y: spot.y, color: colorDraw.value }]);
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
