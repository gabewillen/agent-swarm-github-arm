// The rules of Quorum Run (DESIGN.md §5 to §7): the state at init, the
// tiles, and one step of play. `step` never changes the state it is given;
// every draw of the PRNG replaces `seed`, so play replays from one number.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

// A drift's reverse: up and down, left and right.
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// Parse a definition and place the level's pieces: the player at the
// start, a patch of a fresh colour on every spawn point, and copies of the
// drifts. Only `score`, `lives`, `tick`, and `seed` survive a load.
function loadLevel(levels, levelIndex, seed) {
  const level = parseLevel(levels[levelIndex]);
  let s = seed;
  const patches = [];
  for (const sp of level.spawns) {
    const draw = rngInt(s, COLORS);
    s = draw.seed;
    patches.push({ x: sp.x, y: sp.y, color: draw.value });
  }
  return {
    level,
    seed: s,
    player: { x: level.start.x, y: level.start.y },
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
  };
}

export function init(seed, options) {
  const opts = options === null || options === undefined ? {} : options;
  const levels = opts.levels === undefined ? LEVELS : opts.levels;
  const levelIndex = opts.level === undefined ? 0 : opts.level;
  const state = {
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level: null,
    player: null,
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
  };
  const loaded = loadLevel(levels, levelIndex, state.seed);
  state.level = loaded.level;
  state.player = loaded.player;
  state.patches = loaded.patches;
  state.drifts = loaded.drifts;
  state.seed = loaded.seed;
  return state;
}

export function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined || !Number.isInteger(x) || x < 0 || x >= row.length) return '#';
  return row[x];
}

function conflictOn(list, x, y) {
  return list.some((c) => c.x === x && c.y === y);
}

// Cells the player may enter: not a wall, not a hold or the exit unless
// the quorum is open, and no conflict on them.
function playerCanEnter(s, x, y) {
  const t = tileAt(s, x, y);
  if (t === '#') return false;
  if (t === 'H' || t === 'X') return s.open === true;
  return !conflictOn(s.conflicts, x, y);
}

// Cells a drift may enter: not a wall, not a hold, not the exit (open or
// not), and no conflict. Drifts and patches mean nothing to a drift.
function driftCanEnter(s, x, y) {
  const t = tileAt(s, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !conflictOn(s.conflicts, x, y);
}

export function step(state, input) {
  const raw = input === null || input === undefined ? {} : input;
  const pause = raw.pause === true;
  let move = null;
  if (typeof raw.move === 'string' && DIRS[raw.move] !== undefined) move = raw.move;

  // 1. A game that is won or lost no longer changes.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause flips paused and ends the step.
  if (pause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }

  // 3. While paused nothing happens.
  if (state.paused) return { ...state, events: [] };

  const events = [];

  // 4. Time passes.
  const next = { ...state, tick: state.tick + 1, levelTicks: state.levelTicks + 1, events };

  // 5. Conflicts age; those at 0 go.
  next.conflicts = [];
  for (const c of state.conflicts) {
    if (c.ttl > 1) next.conflicts.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }

  // 6. The player moves when the target cell lets them.
  const pre = { x: state.player.x, y: state.player.y };
  if (move !== null) {
    const nx = pre.x + DIRS[move][0];
    const ny = pre.y + DIRS[move][1];
    if (playerCanEnter(next, nx, ny)) next.player = { x: nx, y: ny };
  }

  // 7. Pickup: a patch on the player's cell, when their hands are not full.
  next.patches = state.patches;
  next.carried = state.carried;
  const grab = state.patches.findIndex((p) => p.x === next.player.x && p.y === next.player.y);
  if (grab >= 0 && state.carried.length < CARRY_MAX) {
    next.carried = [...state.carried, state.patches[grab].color];
    next.patches = state.patches.filter((_, i) => i !== grab);
    events.push('pickup');
  }

  // 8. Merge on a pad.
  next.score = state.score;
  next.merges = state.merges;
  next.open = state.open;
  if (tileAt(next, next.player.x, next.player.y) === 'M' && next.carried.length > 0) {
    const n = next.carried.length;
    let points = PATCH_BASE * n * n;
    if (n >= 2) {
      let same = true;
      for (const c of next.carried) {
        if (c !== next.carried[0]) {
          same = false;
          break;
        }
      }
      if (same) points += SAME_COLOR_BONUS * n;
    }
    next.score = state.score + points;
    next.merges = state.merges + n;
    next.carried = [];
    events.push('merge');
    if (next.merges >= state.level.quorum && !state.open) {
      next.open = true;
      events.push('quorum');
    }
  }

  // 9. Exit: ship the level when it is open; the step ends here.
  if (next.open && tileAt(next, next.player.x, next.player.y) === 'X') {
    next.score += Math.max(0, state.level.par - next.levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      const loaded = loadLevel(state.levels, state.levelIndex + 1, next.seed);
      next.levelIndex = state.levelIndex + 1;
      next.level = loaded.level;
      next.player = loaded.player;
      next.patches = loaded.patches;
      next.drifts = loaded.drifts;
      next.seed = loaded.seed;
      next.carried = [];
      next.conflicts = [];
      next.merges = 0;
      next.open = false;
      next.invuln = 0;
      next.levelTicks = 0;
      events.push('level');
    } else {
      next.status = 'won';
      events.push('won');
    }
    return next;
  }

  // 10. Drifts move on their period, in array order, turning clockwise
  // when blocked. `from` holds each drift's cell before the move, for the
  // swap check of step 12.
  let driftsAfter = state.drifts;
  let driftsFrom = null;
  if (next.tick % state.level.driftPeriod === 0) {
    driftsAfter = [];
    driftsFrom = [];
    for (const d of state.drifts) {
      const face = CLOCKWISE.indexOf(d.dir);
      let placed = false;
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(face + k) % 4];
        const nx = d.x + DIRS[dir][0];
        const ny = d.y + DIRS[dir][1];
        if (driftCanEnter(next, nx, ny)) {
          driftsAfter.push({ x: nx, y: ny, dir });
          driftsFrom.push({ x: d.x, y: d.y });
          placed = true;
          break;
        }
      }
      if (!placed) {
        driftsAfter.push({ x: d.x, y: d.y, dir: d.dir });
        driftsFrom.push({ x: d.x, y: d.y });
      }
    }

    // 11. Drift collisions, cell by cell in reading order: two or more
    // drifts on a cell reverse and mark a conflict once for that cell.
    for (let cy = 0; cy < state.level.height; cy++) {
      for (let cx = 0; cx < state.level.width; cx++) {
        const involved = [];
        for (const d of driftsAfter) {
          if (d.x === cx && d.y === cy) involved.push(d);
        }
        if (involved.length >= 2) {
          for (const d of involved) d.dir = OPPOSITE[d.dir];
          if (!conflictOn(next.conflicts, cx, cy)) {
            next.conflicts.push({ x: cx, y: cy, ttl: CONFLICT_TICKS });
          }
          events.push('conflict');
        }
      }
    }
    next.drifts = driftsAfter;
  }

  // 12. Hits: with invulnerability ticking, nothing hits. Otherwise the
  // player is hit by a drift on their cell, or by one that swapped cells
  // with them while both were moving.
  if (next.invuln > 0) {
    next.invuln = next.invuln - 1;
  } else {
    const onPlayer = driftsAfter.some((d) => d.x === next.player.x && d.y === next.player.y);
    let swapped = false;
    if (driftsFrom !== null) {
      for (let i = 0; i < driftsAfter.length; i++) {
        const d = driftsAfter[i];
        const f = driftsFrom[i];
        if (d.x === pre.x && d.y === pre.y && f.x === next.player.x && f.y === next.player.y) {
          swapped = true;
          break;
        }
      }
    }
    if (onPlayer || swapped) {
      if (next.carried.length > 0) {
        // A hit while carrying drops the patches; the player stays put.
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
          next.player = { x: state.level.start.x, y: state.level.start.y };
          next.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns: one patch on a free spawn point, once every spawnEvery.
  if (
    next.status === 'playing'
    && next.levelTicks % state.level.spawnEvery === 0
    && next.patches.length + next.carried.length < state.level.spawns.length
  ) {
    const free = state.level.spawns.filter((sp) =>
      !next.patches.some((p) => p.x === sp.x && p.y === sp.y)
      && !(next.player.x === sp.x && next.player.y === sp.y)
      && !next.drifts.some((d) => d.x === sp.x && d.y === sp.y));
    if (free.length > 0) {
      const spot = rngInt(next.seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      next.seed = color.seed;
      next.patches = [...next.patches, { x: free[spot.value].x, y: free[spot.value].y, color: color.value }];
      events.push('spawn');
    }
  }

  return next;
}
