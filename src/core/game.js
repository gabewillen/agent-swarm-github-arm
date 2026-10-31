// Quorum Run: the rules (DESIGN.md §5, §6, §7).
//
// step() returns the next state and never changes the state it gets, nor
// anything in it; every state is plain JSON data. Nothing here touches the
// DOM or Math.random: randomness comes only from the state's seed through
// the PRNG of §3. A step runs, in order, the thirteen numbered movements of
// §6; state.events collects, in order, what happened in it (§7).

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

// up and down swap, left and right swap (§6 step 11).
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The level's terrain at a cell; walls outside the map (§5 tileAt).
function terrainOf(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

// tileAt reads the state's level (§5); the renderer and others call it.
export function tileAt(state, x, y) {
  return terrainOf(state.level, x, y);
}

// A cell the player may enter: not a wall, not a hold or the exit unless
// open, and no conflict on it (§6 step 6). Drifts do not block the player.
function passableForPlayer(level, open, conflicts, x, y) {
  const terrain = terrainOf(level, x, y);
  if (terrain === '#') return false;
  if ((terrain === 'H' || terrain === 'X') && !open) return false;
  for (const conflict of conflicts) {
    if (conflict.x === x && conflict.y === y) return false;
  }
  return true;
}

// A cell a drift may enter: not a wall, not a hold, never the exit (open
// or not), and no conflict on it; it ignores patches, pads, and the player
// (§6 step 10).
function passableForDrift(level, conflicts, x, y) {
  const terrain = terrainOf(level, x, y);
  if (terrain === '#' || terrain === 'H' || terrain === 'X') return false;
  for (const conflict of conflicts) {
    if (conflict.x === x && conflict.y === y) return false;
  }
  return true;
}

// One patch per spawn point, in reading order, each colour drawn in that
// order from the running seed (§5).
function drawPatches(spawns, firstSeed) {
  let seed = firstSeed;
  const patches = [];
  for (const spawn of spawns) {
    const draw = rngInt(seed, COLORS);
    seed = draw.seed;
    patches.push({ x: spawn.x, y: spawn.y, color: draw.value });
  }
  return { patches, seed };
}

// Loading a level (at init and on reaching an open exit; §5): sets level,
// player, patches with fresh colour draws, and copies of the drifts, and
// resets carried, conflicts, merges, open, invuln, and levelTicks. The
// caller keeps score, lives, tick, and the PRNG state.
function loadLevel(levels, levelIndex, firstSeed) {
  const level = parseLevel(levels[levelIndex]);
  const { patches, seed } = drawPatches(level.spawns, firstSeed);
  return {
    level,
    player: { x: level.start.x, y: level.start.y },
    patches,
    drifts: level.drifts.map((drift) => ({ x: drift.x, y: drift.y, dir: drift.dir })),
    carried: [],
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
    seed,
  };
}

// init returns the first state (§5). options.levels defaults to the shipped
// LEVELS of src/data/levels.js; options.level is the starting level index,
// default 0. The seed is taken >>> 0 before the patch-colour draws.
export function init(seed, options) {
  const levels = options && options.levels !== undefined ? options.levels : LEVELS;
  const levelIndex = options && options.level !== undefined ? options.level : 0;
  const loaded = loadLevel(levels, levelIndex, seed >>> 0);
  return {
    seed: loaded.seed,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level: loaded.level,
    player: loaded.player,
    carried: loaded.carried,
    patches: loaded.patches,
    drifts: loaded.drifts,
    conflicts: [],
    score: 0,
    lives: START_LIVES,
    merges: 0,
    open: false,
    invuln: 0,
    status: 'playing',
    paused: false,
    events: [],
  };
}

// step advances one tick (§6) and returns the next state.
export function step(state, input) {
  // 1. A game that is won or lost only empties its events.
  if (state.status !== 'playing') {
    return { ...state, events: [] };
  }

  // 2. Pause flips paused; nothing else changes, not even ticks.
  if (input !== null && input !== undefined && input.pause === true) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // 3. A paused step does nothing.
  if (state.paused) {
    return { ...state, events: [] };
  }

  const level = state.level;
  const events = [];

  // 4. Time passes while playing.
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;

  // 5. Conflicts age: each ttl drops by one, conflicts at 0 go.
  const conflicts = [];
  for (const conflict of state.conflicts) {
    const ttl = conflict.ttl - 1;
    if (ttl > 0) conflicts.push({ x: conflict.x, y: conflict.y, ttl });
  }

  // 6. The player moves one cell when the target is passable.
  const from = { x: state.player.x, y: state.player.y };
  let player = from;
  const move = input !== null && input !== undefined ? input.move : null;
  const offset = move !== null && move !== undefined ? DIRS[move] : undefined;
  if (offset !== undefined) {
    const x = from.x + offset[0];
    const y = from.y + offset[1];
    if (passableForPlayer(level, state.open, conflicts, x, y)) {
      player = { x, y };
    }
  }

  // 7. Pickup: the patch on the player's cell leaves the floor and its
  // colour joins the carried colours, in pickup order.
  let patches = state.patches;
  let carried = state.carried;
  const onCell = patches.findIndex((patch) => patch.x === player.x && patch.y === player.y);
  if (onCell >= 0 && carried.length < CARRY_MAX) {
    const patch = patches[onCell];
    patches = patches
      .filter((_, i) => i !== onCell)
      .map((p) => ({ x: p.x, y: p.y, color: p.color }));
    carried = carried.concat([patch.color]);
    events.push('pickup');
  }

  const next = { ...state, tick, levelTicks, player, patches, carried, conflicts, events };

  // 8. Merge: on a merge pad with n > 0 carried, all carried merge.
  if (terrainOf(level, player.x, player.y) === 'M' && next.carried.length > 0) {
    const n = next.carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && next.carried.every((color) => color === next.carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    events.push('merge');
    next.score = state.score + gain;
    next.merges = state.merges + n;
    next.carried = [];
    // Reaching the quorum opens the holds and the exit.
    if (!state.open && next.merges >= level.quorum) {
      next.open = true;
      events.push('quorum');
    }
  }

  // 9. Exit: on the exit of an open level the score takes the time bonus,
  // and the step ends here — the next level loads, or the game is won.
  if (next.open && terrainOf(level, player.x, player.y) === 'X') {
    next.score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      const loaded = loadLevel(state.levels, state.levelIndex + 1, state.seed);
      next.levelIndex = state.levelIndex + 1;
      next.level = loaded.level;
      next.player = loaded.player;
      next.patches = loaded.patches;
      next.drifts = loaded.drifts;
      next.carried = loaded.carried;
      next.conflicts = loaded.conflicts;
      next.merges = loaded.merges;
      next.open = loaded.open;
      next.invuln = loaded.invuln;
      next.levelTicks = loaded.levelTicks;
      next.seed = loaded.seed;
      events.push('level');
    } else {
      next.status = 'won';
      events.push('won');
    }
    return next;
  }

  // 10. Drifts move on their tick, in array order, each trying its own
  // direction then the clockwise next ones, and turning to the first
  // passable target. With none, a drift stays and keeps its direction.
  const driftsMove = tick % level.driftPeriod === 0;
  let drifts = state.drifts;
  let driftFroms = null;
  if (driftsMove) {
    driftFroms = [];
    drifts = [];
    for (const drift of state.drifts) {
      driftFroms.push({ x: drift.x, y: drift.y });
      const turned = { x: drift.x, y: drift.y, dir: drift.dir };
      const first = CLOCKWISE.indexOf(drift.dir);
      for (let attempt = 0; attempt < 4; attempt++) {
        const dir = CLOCKWISE[(first + attempt) % 4];
        const x = drift.x + DIRS[dir][0];
        const y = drift.y + DIRS[dir][1];
        if (passableForDrift(level, conflicts, x, y)) {
          turned.x = x;
          turned.y = y;
          turned.dir = dir;
          break;
        }
      }
      drifts.push(turned);
    }
    next.drifts = drifts;

    // 11. Collisions, only when the drifts moved: for each cell in
    // reading order holding two or more drifts, every drift there
    // reverses its direction, a conflict is added unless the cell
    // already holds one, and the event is added once for the cell.
    const crowd = new Map();
    for (let i = 0; i < drifts.length; i++) {
      const key = drifts[i].y + ',' + drifts[i].x;
      if (crowd.has(key)) crowd.get(key).push(i);
      else crowd.set(key, [i]);
    }
    const cells = Array.from(crowd.keys()).sort(compareCells);
    for (const key of cells) {
      const there = crowd.get(key);
      if (there.length < 2) continue;
      for (const i of there) {
        drifts[i] = { ...drifts[i], dir: REVERSE[drifts[i].dir] };
      }
      const comma = key.indexOf(',');
      const x = Number(key.slice(comma + 1));
      const y = Number(key.slice(0, comma));
      let already = false;
      for (const conflict of conflicts) {
        if (conflict.x === x && conflict.y === y) already = true;
      }
      if (!already) conflicts.push({ x, y, ttl: CONFLICT_TICKS });
      events.push('conflict');
    }
  }

  // 12. Hits: while invuln lasts it counts down and nothing hits.
  if (next.invuln > 0) {
    next.invuln = next.invuln - 1;
  } else {
    let hit = false;
    for (let i = 0; i < drifts.length; i++) {
      const drift = drifts[i];
      // A drift on the player's cell hits.
      if (drift.x === player.x && drift.y === player.y) {
        hit = true;
        break;
      }
      // A drift that moved this step and swapped cells with the player.
      const was = driftFroms !== null ? driftFroms[i] : null;
      if (
        was !== null &&
        drift.x === from.x && drift.y === from.y &&
        was.x === player.x && was.y === player.y
      ) {
        hit = true;
        break;
      }
    }
    if (hit) {
      if (next.carried.length > 0) {
        // Carrying, a hit only drops the carried patches.
        next.carried = [];
        next.invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        next.lives = state.lives - 1;
        events.push('hit');
        if (next.lives <= 0) {
          next.status = 'lost';
          events.push('lost');
        } else {
          next.player = { x: level.start.x, y: level.start.y };
          next.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns: when the level ticks to a spawn and the spawn points
  // outnumber the lying and carried patches, at most one patch spawns on
  // a free point, drawn point first, then its colour.
  if (
    next.status === 'playing' &&
    next.levelTicks % level.spawnEvery === 0 &&
    patches.length + next.carried.length < level.spawns.length
  ) {
    const free = [];
    for (const spawn of level.spawns) {
      let taken = false;
      for (const patch of patches) {
        if (patch.x === spawn.x && patch.y === spawn.y) taken = true;
      }
      if (spawn.x === player.x && spawn.y === player.y) taken = true;
      for (const drift of drifts) {
        if (drift.x === spawn.x && drift.y === spawn.y) taken = true;
      }
      if (!taken) free.push(spawn);
    }
    if (free.length > 0) {
      const spot = rngInt(next.seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      next.seed = color.seed;
      const patch = { x: free[spot.value].x, y: free[spot.value].y, color: color.value };
      next.patches = patches.concat([patch]);
      events.push('spawn');
    }
  }

  return next;
}

// Reading order of cells: row by row, left to right.
function compareCells(a, b) {
  const ay = Number(a.slice(0, a.indexOf(',')));
  const ax = Number(a.slice(a.indexOf(',') + 1));
  const by = Number(b.slice(0, b.indexOf(',')));
  const bx = Number(b.slice(b.indexOf(',') + 1));
  if (ay !== by) return ay - by;
  return ax - bx;
}
