// Quorum Run — the rules (DESIGN.md §5 state, §6 a step, §7 events).
//
// Pure core: no DOM, no Math.random, no Node APIs. Every random choice
// comes from the state's seed through rngInt (§3), and step() never
// changes the state or the input it is given: everything it returns is
// built from fresh objects and arrays.
import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { parseLevel } from './level.js';
import { rngInt } from './rng.js';
import { LEVELS } from '../data/levels.js';

// ---- terrain -----------------------------------------------------------

// The level's terrain character at a cell ('#' outside the map), from the
// parsed level's tiles.
function cellOf(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined) return '#';
  return x < 0 || x >= row.length ? '#' : row[x];
}

export function tileAt(state, x, y) {
  return cellOf(state.level, x, y);
}

// Passable to the player: not a wall, not a hold or the exit unless open,
// and no conflict on it (§6 step 6).
function passableToPlayer(level, open, conflicts, x, y) {
  const ch = cellOf(level, x, y);
  if (ch === '#') return false;
  if ((ch === 'H' || ch === 'X') && !open) return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// Passable to a drift: not a wall, not a hold, not the exit (open or not),
// and no conflict on it. Drifts ignore the player, patches, and each other
// while moving (§6 step 10).
function passableToDrift(level, conflicts, x, y) {
  const ch = cellOf(level, x, y);
  if (ch === '#' || ch === 'H' || ch === 'X') return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// ---- loading a level (§5) ----------------------------------------------

// The player, one patch per spawn point (colours drawn in reading order
// from the running seed), and fresh copies of the level's drifts.
function fixtures(level, seed) {
  const out = {
    player: { x: level.start.x, y: level.start.y },
    patches: [],
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    seed,
  };
  for (const spot of level.spawns) {
    const draw = rngInt(out.seed, COLORS);
    out.patches.push({ x: spot.x, y: spot.y, color: draw.value });
    out.seed = draw.seed;
  }
  return out;
}

// Load `level` into the state's per-level fields, keeping score, lives,
// tick, levelIndex, and the PRNG state (§5).
function loadLevel(state, level) {
  const fresh = fixtures(level, state.seed);
  state.level = level;
  state.player = fresh.player;
  state.patches = fresh.patches;
  state.drifts = fresh.drifts;
  state.seed = fresh.seed;
  state.carried = [];
  state.conflicts = [];
  state.merges = 0;
  state.open = false;
  state.invuln = 0;
  state.levelTicks = 0;
}

export function init(seed, options) {
  const levels = options && options.levels ? options.levels : LEVELS;
  const levelIndex = options && options.level != null ? options.level : 0;
  const level = parseLevel(levels[levelIndex]);
  const state = {
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level,
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
  };
  loadLevel(state, level);
  return state;
}

// ---- the step (§6) ------------------------------------------------------

const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// A missing or null input, or a missing field, means no move and no pause.
// An unknown move name is no move either.
function normalize(input) {
  if (input === null || typeof input !== 'object') return { move: null, pause: false };
  const move = typeof input.move === 'string' && DIRS[input.move] ? input.move : null;
  return { move, pause: input.pause === true };
}

export function step(state, input) {
  // 1. A game that is over no longer changes.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause flips `paused`; nothing else changes and no tick passes.
  const inp = normalize(input);
  if (inp.pause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // 3. While paused nothing moves and no tick passes.
  if (state.paused) return { ...state, events: [] };

  // 4. The clock runs.
  const next = { ...state, tick: state.tick + 1, levelTicks: state.levelTicks + 1, events: [] };
  const level = state.level;

  // 5. Conflicts age by one; those at 0 go.
  next.conflicts = state.conflicts
    .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. The player moves one cell when the target is passable.
  const before = { x: state.player.x, y: state.player.y };
  if (inp.move) {
    const [dx, dy] = DIRS[inp.move];
    const tx = before.x + dx;
    const ty = before.y + dy;
    if (passableToPlayer(level, state.open, next.conflicts, tx, ty)) {
      next.player = { x: tx, y: ty };
    }
  }
  const player = next.player;

  // 7. Pickup: a patch on the player's cell, with hands free.
  const here = state.patches.findIndex((p) => p.x === player.x && p.y === player.y);
  if (here !== -1 && state.carried.length < CARRY_MAX) {
    next.carried = [...state.carried, state.patches[here].color];
    next.patches = state.patches.filter((p, i) => i !== here);
    next.events.push('pickup');
  }

  // 8. Merge on a pad with something carried.
  if (cellOf(level, player.x, player.y) === 'M' && next.carried.length > 0) {
    const n = next.carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && next.carried.every((c) => c === next.carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    next.score = state.score + gain;
    next.merges = state.merges + n;
    next.carried = [];
    next.events.push('merge');
    if (!next.open && next.merges >= level.quorum) {
      next.open = true;
      next.events.push('quorum');
    }
  }

  // 9. The exit, if open, ends the step here: the time bonus, then either
  // the next level or the win.
  if (next.open && cellOf(level, player.x, player.y) === 'X') {
    next.score += Math.max(0, level.par - next.levelTicks) * TIME_BONUS_PER_TICK;
    if (next.levelIndex + 1 < next.levels.length) {
      // loadLevel keeps levelIndex, score, lives, tick, and the seed.
      loadLevel(next, parseLevel(next.levels[next.levelIndex + 1]));
      next.levelIndex += 1;
      next.events.push('level');
    } else {
      next.status = 'won';
      next.events.push('won');
    }
    return next;
  }

  // 10. Drifts move, when it is their tick: each tries its own direction
  // first, then clockwise, up to four.
  const moved = next.tick % level.driftPeriod === 0;
  if (moved) {
    next.drifts = state.drifts.map((d) => {
      const from = CLOCKWISE.indexOf(d.dir);
      for (let i = 0; i < 4; i++) {
        const dir = CLOCKWISE[(from + i) % 4];
        const [dx, dy] = DIRS[dir];
        const x = d.x + dx;
        const y = d.y + dy;
        if (passableToDrift(level, next.conflicts, x, y)) return { x, y, dir };
      }
      // Boxed in: stay and keep the direction.
      return { x: d.x, y: d.y, dir: d.dir };
    });
  }

  // 11. Drift collisions, only on a tick when drifts moved: per cell, in
  // reading order, every drift there reverses and a conflict stays.
  if (moved) {
    const stacks = new Map();
    for (const d of next.drifts) {
      const key = d.y + ':' + d.x;
      const list = stacks.get(key);
      if (list) list.push(d);
      else stacks.set(key, [d]);
    }
    const cells = [...stacks.keys()]
      .map((key) => {
        const at = key.split(':');
        return { x: +at[1], y: +at[0] };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);
    for (const { x, y } of cells) {
      const list = stacks.get(y + ':' + x);
      if (list.length < 2) continue;
      for (const d of list) d.dir = REVERSE[d.dir];
      if (!next.conflicts.some((c) => c.x === x && c.y === y)) {
        next.conflicts = [...next.conflicts, { x, y, ttl: CONFLICT_TICKS }];
      }
      next.events.push('conflict');
    }
  }

  // 12. Hits: invuln counts down and blocks them; otherwise a drift on the
  // player's cell, or one that swapped cells with the player this step,
  // costs dropped patches (or, empty-handed, a life).
  if (next.invuln > 0) {
    next.invuln -= 1;
  } else {
    let hit = next.drifts.some((d) => d.x === player.x && d.y === player.y);
    if (!hit && moved) {
      for (let i = 0; i < next.drifts.length; i++) {
        const d = next.drifts[i];
        const was = state.drifts[i];
        if (d.x === before.x && d.y === before.y && was.x === player.x && was.y === player.y) {
          hit = true;
          break;
        }
      }
    }
    if (hit) {
      if (next.carried.length > 0) {
        next.carried = [];
        next.invuln = INVULN_TICKS;
        next.events.push('drop');
      } else {
        next.lives = Math.max(0, next.lives - 1);
        next.events.push('hit');
        if (next.lives === 0) {
          next.status = 'lost';
          next.events.push('lost');
        } else {
          next.player = { x: level.start.x, y: level.start.y };
          next.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns: at most one patch per spawn tick, on a free spawn point.
  if (
    next.status === 'playing' &&
    next.levelTicks % level.spawnEvery === 0 &&
    next.patches.length + next.carried.length < level.spawns.length
  ) {
    const held = new Set(next.patches.map((p) => p.x + ':' + p.y));
    const free = level.spawns.filter(
      (spot) =>
        !held.has(spot.x + ':' + spot.y) &&
        !(spot.x === player.x && spot.y === player.y) &&
        !next.drifts.some((d) => d.x === spot.x && d.y === spot.y),
    );
    if (free.length > 0) {
      const spotDraw = rngInt(next.seed, free.length);
      const spot = free[spotDraw.value];
      const colorDraw = rngInt(spotDraw.seed, COLORS);
      next.seed = colorDraw.seed;
      next.patches = [...next.patches, { x: spot.x, y: spot.y, color: colorDraw.value }];
      next.events.push('spawn');
    }
  }

  return next;
}
