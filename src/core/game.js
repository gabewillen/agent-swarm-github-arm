// Quorum Run rules (DESIGN.md §5 to §7): the state at init, one step of
// the game in its §6 order, and the events of §7. Pure: a step never
// changes the state (or the input, or anything nested in either), and
// every state it returns is plain JSON data.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS,
  DIRS, CLOCKWISE,
} from './constants.js';
import { parseLevel } from './level.js';
import { rngInt } from './rng.js';
import { LEVELS } from '../data/levels.js';

// A drift that turns around (a collision's reversal).
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// Load a level definition: parse it and lay out what a level starts
// with, drawing one patch colour from the running seed per spawn point
// in reading order. Keeps the seed (advanced by the draws) with it.
function loadLevel(def, levelIndex, seed) {
  const level = parseLevel(def);
  let s = seed >>> 0;
  const patches = level.spawns.map((spawn) => {
    const drawn = rngInt(s, COLORS);
    s = drawn.seed;
    return { x: spawn.x, y: spawn.y, color: drawn.value };
  });
  return {
    level,
    levelIndex,
    seed: s,
    player: { x: level.start.x, y: level.start.y },
    patches,
    drifts: level.drifts.map((drift) => ({ x: drift.x, y: drift.y, dir: drift.dir })),
  };
}

export function init(seed, options) {
  const opts = options ?? {};
  const levels = opts.levels ?? LEVELS;
  const levelIndex = opts.level ?? 0;
  const loaded = loadLevel(levels[levelIndex], levelIndex, seed >>> 0);
  return {
    seed: loaded.seed,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex: loaded.levelIndex,
    level: loaded.level,
    player: loaded.player,
    carried: [],
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

// The level's terrain character at a cell, '#' outside the map.
export function tileAt(state, x, y) {
  const level = state.level;
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) return '#';
  return level.tiles[y].charAt(x);
}

// Is a conflict blocking this cell?
function conflictsAt(conflicts, x, y) {
  for (const conflict of conflicts) {
    if (conflict.x === x && conflict.y === y) return true;
  }
  return false;
}

// Passable to the player: not a wall, not a hold or the exit unless the
// level is open, and no conflict on it.
function playerPassable(state, open, conflicts, x, y) {
  const tile = tileAt(state, x, y);
  if (tile === '#') return false;
  if (!open && (tile === 'H' || tile === 'X')) return false;
  return !conflictsAt(conflicts, x, y);
}

// Passable to a drift: not a wall, not a hold, not the exit (open or
// not), and no conflict on it. Drifts ignore the player and patches.
function driftPassable(state, conflicts, x, y) {
  const tile = tileAt(state, x, y);
  if (tile === '#' || tile === 'H' || tile === 'X') return false;
  return !conflictsAt(conflicts, x, y);
}

export function step(state, input) {
  const source = input ?? null;
  const move = source && source.move !== undefined && source.move !== null && DIRS[source.move] ? source.move : null;
  const pause = Boolean(source && source.pause);

  // 1. A game that is over stays over, with empty events.
  if (state.status !== 'playing') {
    return { ...state, events: [] };
  }
  // 2. A pause flips paused and does nothing else.
  if (pause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }
  // 3. While paused, nothing moves and nothing ages.
  if (state.paused) {
    return { ...state, events: [] };
  }

  // 4. One tick passes.
  const next = { ...state };
  next.tick = state.tick + 1;
  next.levelTicks = state.levelTicks + 1;
  const events = [];

  // 5. Conflicts age by one; those that reach 0 go.
  const aged = [];
  for (const conflict of state.conflicts) {
    const ttl = conflict.ttl - 1;
    if (ttl > 0) aged.push({ x: conflict.x, y: conflict.y, ttl });
  }
  next.conflicts = aged;

  // 6. The player moves when the target cell is passable.
  const from = { x: state.player.x, y: state.player.y };
  let px = from.x;
  let py = from.y;
  if (move !== null && playerPassable(state, state.open, aged, px + DIRS[move][0], py + DIRS[move][1])) {
    px += DIRS[move][0];
    py += DIRS[move][1];
  }
  next.player = { x: px, y: py };

  // 7. Pickup, one patch, while there is room to carry it.
  next.carried = state.carried.slice();
  next.patches = state.patches;
  if (next.carried.length < CARRY_MAX) {
    const index = state.patches.findIndex((patch) => patch.x === px && patch.y === py);
    if (index >= 0) {
      next.carried.push(state.patches[index].color);
      next.patches = state.patches.filter((patch, i) => i !== index);
      events.push('pickup');
    }
  }

  // 8. Merge on a merge pad.
  if (tileAt(state, px, py) === 'M' && next.carried.length > 0) {
    const n = next.carried.length;
    let gained = PATCH_BASE * n * n;
    if (n >= 2 && next.carried.every((color) => color === next.carried[0])) {
      gained += SAME_COLOR_BONUS * n;
    }
    next.score += gained;
    next.merges += n;
    next.carried = [];
    events.push('merge');
    if (!next.open && next.merges >= next.level.quorum) {
      next.open = true;
      events.push('quorum');
    }
  }

  // 9. The open exit ends the step: time bonus, then the next level or
  // the win; drifts never move on a step that ends here.
  if (next.open && tileAt(state, px, py) === 'X') {
    next.score += Math.max(0, next.level.par - next.levelTicks) * TIME_BONUS_PER_TICK;
    if (next.levelIndex + 1 < next.levels.length) {
      const fresh = loadLevel(next.levels[next.levelIndex + 1], next.levelIndex + 1, next.seed);
      next.level = fresh.level;
      next.levelIndex = fresh.levelIndex;
      next.seed = fresh.seed;
      next.player = fresh.player;
      next.patches = fresh.patches;
      next.drifts = fresh.drifts;
      next.carried = [];
      next.conflicts = [];
      next.merges = 0;
      next.open = false;
      next.invuln = 0;
      next.levelTicks = 0;
      events.push('level');
      next.events = events;
      return next;
    }
    next.status = 'won';
    events.push('won');
    next.events = events;
    return next;
  }

  // 10. Drifts move on their period's ticks, and each tries its own
  // direction first, then clockwise; a turn happens by moving.
  const moves = next.tick % next.level.driftPeriod === 0;
  const before = state.drifts;
  const conflicts = next.conflicts;
  next.drifts = before.map((drift) => {
    if (!moves) return { x: drift.x, y: drift.y, dir: drift.dir };
    const start = CLOCKWISE.indexOf(drift.dir);
    for (let k = 0; k < 4; k++) {
      const dir = CLOCKWISE[(((start + k) % 4) + 4) % 4];
      const tx = drift.x + DIRS[dir][0];
      const ty = drift.y + DIRS[dir][1];
      if (driftPassable(state, conflicts, tx, ty)) {
        return { x: tx, y: ty, dir };
      }
    }
    return { x: drift.x, y: drift.y, dir: drift.dir };
  });

  // 11. Drift collisions, only on ticks when drifts moved: every drift
  // on a twice-occupied cell reverses, one conflict joins the cell
  // unless one is already there, and the cell gets one event.
  if (moves) {
    const width = next.level.width;
    const height = next.level.height;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const here = [];
        for (let i = 0; i < next.drifts.length; i++) {
          if (next.drifts[i].x === x && next.drifts[i].y === y) here.push(i);
        }
        if (here.length < 2) continue;
        for (const i of here) next.drifts[i] = { ...next.drifts[i], dir: REVERSE[next.drifts[i].dir] ?? next.drifts[i].dir };
        if (!conflictsAt(next.conflicts, x, y)) {
          next.conflicts = next.conflicts.concat([{ x, y, ttl: CONFLICT_TICKS }]);
        }
        events.push('conflict');
      }
    }
  }

  // 12. Hits, unless a recent one left the player immune: the immunity
  // counts down and nothing touches them meanwhile.
  if (next.invuln > 0) {
    next.invuln -= 1;
  } else {
    const overlapped = next.drifts.some((drift) => drift.x === px && drift.y === py);
    let swapped = false;
    for (let i = 0; i < next.drifts.length; i++) {
      const drift = next.drifts[i];
      const was = before[i];
      if ((drift.x !== was.x || drift.y !== was.y)
        && drift.x === from.x && drift.y === from.y
        && was.x === px && was.y === py) {
        swapped = true;
        break;
      }
    }
    if (overlapped || swapped) {
      if (next.carried.length > 0) {
        // Carrying, a hit only spills the load: the patches are gone.
        next.carried = [];
        next.invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        next.lives = Math.max(0, next.lives - 1);
        events.push('hit');
        if (next.lives === 0) {
          next.status = 'lost';
          events.push('lost');
        } else {
          next.player = { x: state.level.start.x, y: state.level.start.y };
          next.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns: on a spawn tick, while the level misses patches, pick a
  // free spawn point and its colour from the seed.
  if (next.status === 'playing'
    && next.levelTicks % next.level.spawnEvery === 0
    && next.patches.length + next.carried.length < next.level.spawns.length) {
    const free = next.level.spawns.filter((spawn) =>
      !next.patches.some((patch) => patch.x === spawn.x && patch.y === spawn.y)
      && !(next.player.x === spawn.x && next.player.y === spawn.y)
      && !next.drifts.some((drift) => drift.x === spawn.x && drift.y === spawn.y));
    if (free.length > 0) {
      const spotDraw = rngInt(next.seed, free.length);
      const spot = free[spotDraw.value];
      const colorDraw = rngInt(spotDraw.seed, COLORS);
      next.patches = next.patches.concat([{ x: spot.x, y: spot.y, color: colorDraw.value }]);
      next.seed = colorDraw.seed;
      events.push('spawn');
    }
  }

  next.events = events;
  return next;
}
