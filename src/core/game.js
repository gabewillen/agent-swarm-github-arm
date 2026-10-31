// DESIGN.md §5–§7: the rules. Pure: no DOM, no random but the state's seed,
// and every step returns plain JSON data without touching what it is given.

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

const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

function tileOf(level, x, y) {
  if (y < 0 || y >= level.tiles.length) return '#';
  const row = level.tiles[y];
  if (x < 0 || x >= row.length) return '#';
  return row[x];
}

function conflictOn(conflicts, x, y) {
  return conflicts.some((c) => c.x === x && c.y === y);
}

// Passable to the player (§6 step 6).
function playerPassable(level, open, conflicts, x, y) {
  const t = tileOf(level, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !open) return false;
  return !conflictOn(conflicts, x, y);
}

// Passable to a drift (§6 step 10): holds and the exit are always walls.
function driftPassable(level, conflicts, x, y) {
  const t = tileOf(level, x, y);
  if (t === '#') return false;
  if (t === 'H' || t === 'X') return false;
  return !conflictOn(conflicts, x, y);
}

// One drift's move: its direction first, then clockwise; it turns to and
// moves into the first passable target, else stays and keeps its direction.
function driftMove(level, drift, conflicts) {
  const from = CLOCKWISE.indexOf(drift.dir);
  for (let i = 0; i < 4; i++) {
    const dir = CLOCKWISE[(from + i) % 4];
    const dx = DIRS[dir][0];
    const dy = DIRS[dir][1];
    const nx = drift.x + dx;
    const ny = drift.y + dy;
    if (driftPassable(level, conflicts, nx, ny)) return { x: nx, y: ny, dir };
  }
  return { x: drift.x, y: drift.y, dir: drift.dir };
}

// Loading a level (at init and on reaching an open exit): level, player,
// patches (fresh colour draws in spawn order), and drifts are set; carried,
// conflicts, merges, open, invuln, and levelTicks reset. score, lives, tick,
// and the PRNG state are kept (§5).
function loadLevelInto(state) {
  state.level = parseLevel(state.levels[state.levelIndex]);
  state.player = { x: state.level.start.x, y: state.level.start.y };
  state.patches = state.level.spawns.map((spot) => {
    const draw = rngInt(state.seed, COLORS);
    state.seed = draw.seed;
    return { x: spot.x, y: spot.y, color: draw.value };
  });
  state.drifts = state.level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  state.carried = [];
  state.conflicts = [];
  state.merges = 0;
  state.open = false;
  state.invuln = 0;
  state.levelTicks = 0;
}

export function init(seed, options) {
  const opts = options ?? {};
  const state = {
    seed: (seed ?? 0) >>> 0,
    tick: 0,
    levelTicks: 0,
    levels: opts.levels ?? LEVELS,
    levelIndex: opts.level ?? 0,
    level: null,
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
  loadLevelInto(state);
  return state;
}

export function tileAt(state, x, y) {
  return tileOf(state.level, x, y);
}

export function step(state, input) {
  const move = input && typeof input.move === 'string' && DIRS[input.move] ? input.move : null;
  const pause = !!(input && input.pause);

  // 1. A game that is over keeps the state but the events.
  if (state.status !== 'playing') {
    return { ...state, events: [] };
  }

  // 2. Pause input flips paused; nothing else happens.
  if (pause) {
    return {
      ...state,
      paused: !state.paused,
      events: [state.paused ? 'resume' : 'pause'],
    };
  }

  // 3. Paused games tick nothing.
  if (state.paused) {
    return { ...state, events: [] };
  }

  // 4. A playing step: fresh copies of everything the step may change.
  const next = {
    ...state,
    player: { x: state.player.x, y: state.player.y },
    carried: [...state.carried],
    patches: state.patches.map((p) => ({ x: p.x, y: p.y, color: p.color })),
    drifts: state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    conflicts: state.conflicts.map((c) => ({ x: c.x, y: c.y, ttl: c.ttl })),
    events: [],
  };
  next.tick = state.tick + 1;
  next.levelTicks = state.levelTicks + 1;

  // 5. Conflicts age; conflicts at 0 go.
  next.conflicts = next.conflicts
    .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);
  const level = next.level;

  // 6. The player moves one cell when the target is passable.
  const playerWas = next.player;
  if (move) {
    const nx = playerWas.x + DIRS[move][0];
    const ny = playerWas.y + DIRS[move][1];
    if (playerPassable(level, next.open, next.conflicts, nx, ny)) {
      next.player = { x: nx, y: ny };
    }
  }

  // 7. Pickup.
  if (next.carried.length < CARRY_MAX) {
    const at = next.patches.findIndex((p) => p.x === next.player.x && p.y === next.player.y);
    if (at !== -1) {
      next.carried.push(next.patches[at].color);
      next.patches.splice(at, 1);
      next.events.push('pickup');
    }
  }

  // 8. Merge.
  if (tileOf(level, next.player.x, next.player.y) === 'M' && next.carried.length > 0) {
    const n = next.carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && next.carried.every((c) => c === next.carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    next.score += gain;
    next.merges += n;
    next.carried = [];
    next.events.push('merge');
    if (!next.open && next.merges >= level.quorum) {
      next.open = true;
      next.events.push('quorum');
    }
  }

  // 9. Exit: the step ends here.
  if (next.open && tileOf(level, next.player.x, next.player.y) === 'X') {
    next.score += Math.max(0, level.par - next.levelTicks) * TIME_BONUS_PER_TICK;
    if (next.levelIndex + 1 < next.levels.length) {
      next.levelIndex = state.levelIndex + 1;
      loadLevelInto(next);
      next.events.push('level');
    } else {
      next.status = 'won';
      next.events.push('won');
    }
    return next;
  }

  // 10. Drifts move on their tick.
  const driftsMoved = next.tick % level.driftPeriod === 0;
  const driftsBefore = next.drifts;
  if (driftsMoved) {
    next.drifts = next.drifts.map((d) => driftMove(level, d, next.conflicts));
  }

  // 11. Collisions, only on a tick when drifts moved.
  if (driftsMoved) {
    const stacked = new Map();
    for (const d of next.drifts) {
      const key = d.x + ',' + d.y;
      stacked.set(key, (stacked.get(key) ?? 0) + 1);
    }
    const cells = [...stacked.entries()]
      .filter(([, n]) => n >= 2)
      .map(([key]) => key.split(',').map(Number))
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [cx, cy] of cells) {
      for (const d of next.drifts) {
        if (d.x === cx && d.y === cy) d.dir = REVERSE[d.dir];
      }
      if (!conflictOn(next.conflicts, cx, cy)) {
        next.conflicts.push({ x: cx, y: cy, ttl: CONFLICT_TICKS });
      }
      next.events.push('conflict');
    }
  }

  // 12. Hits: immune steps only spend the immunity.
  if (next.invuln > 0) {
    next.invuln = next.invuln - 1;
  } else if (
    next.drifts.some((d) => d.x === next.player.x && d.y === next.player.y) ||
    (driftsMoved &&
      // A drift that swapped cells with the player: it is now where the
      // player was before step 6, and was where the player is now.
      next.drifts.some(
        (d, i) =>
          d.x === playerWas.x && d.y === playerWas.y &&
          driftsBefore[i].x === next.player.x && driftsBefore[i].y === next.player.y
      ))
  ) {
    if (next.carried.length > 0) {
      next.carried = [];
      next.invuln = INVULN_TICKS;
      next.events.push('drop');
    } else {
      next.lives = next.lives - 1;
      next.events.push('hit');
      if (next.lives <= 0) {
        next.status = 'lost';
        next.events.push('lost');
      } else {
        next.player = { x: level.start.x, y: level.start.y };
        next.invuln = INVULN_TICKS;
      }
    }
  }

  // 13. Spawns on their tick while still playing.
  if (
    next.status === 'playing' &&
    next.levelTicks % level.spawnEvery === 0 &&
    next.patches.length + next.carried.length < level.spawns.length
  ) {
    const free = level.spawns.filter(
      (spot) =>
        !next.patches.some((p) => p.x === spot.x && p.y === spot.y) &&
        !(spot.x === next.player.x && spot.y === next.player.y) &&
        !next.drifts.some((d) => d.x === spot.x && d.y === spot.y)
    );
    if (free.length > 0) {
      const where = rngInt(next.seed, free.length);
      next.seed = where.seed;
      const which = rngInt(next.seed, COLORS);
      next.seed = which.seed;
      next.patches.push({ x: free[where.value].x, y: free[where.value].y, color: which.value });
      next.events.push('spawn');
    }
  }

  return next;
}
