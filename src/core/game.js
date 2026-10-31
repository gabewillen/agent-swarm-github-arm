// The rules of Quorum Run (DESIGN.md §5 to §7). init builds the first
// state, step returns the next state without changing the one it is
// given, and tileAt reads the terrain of a cell. Every state is plain
// JSON data and randomness comes only from the state's seed.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

const MOVES = ['up', 'right', 'down', 'left'];

// The terrain character of a cell, '#' outside the map.
function cellAt(level, x, y) {
  const row = level.tiles[y];
  return row === undefined ? '#' : (row[x] ?? '#');
}

// Passable to the player: not a wall, not a hold or the exit unless the
// level is open, and no conflict on it.
function freeForPlayer(level, open, conflicts, x, y) {
  const ch = cellAt(level, x, y);
  if (ch === '#' || ((ch === 'H' || ch === 'X') && !open)) return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// Passable to a drift: not a wall, hold, or exit (open or not), and no
// conflict on it. Drifts ignore the player, patches, and other drifts.
function freeForDrift(level, conflicts, x, y) {
  const ch = cellAt(level, x, y);
  if (ch === '#' || ch === 'H' || ch === 'X') return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// One patch per spawn point, in reading order, colours drawn in order.
function drawPatches(spawns, seed) {
  let s = seed;
  const patches = [];
  for (const sp of spawns) {
    const r = rngInt(s, COLORS);
    patches.push({ x: sp.x, y: sp.y, color: r.value });
    s = r.seed;
  }
  return { patches, seed: s };
}

export function init(seed, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const levels = opts.levels ?? LEVELS;
  const levelIndex = opts.level ?? 0;
  const level = parseLevel(levels[levelIndex]);
  const { patches, seed: drawn } = drawPatches(level.spawns, seed >>> 0);
  return {
    seed: drawn,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level,
    player: { x: level.start.x, y: level.start.y },
    carried: [],
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
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

export function tileAt(state, x, y) {
  return cellAt(state.level, x, y);
}

export function step(state, input) {
  const inp = input && typeof input === 'object' ? input : {};
  const move = MOVES.includes(inp.move) ? inp.move : null;
  const pause = inp.pause === true;

  // 1. A game that is over only clears its events.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause flips paused; nothing else happens.
  if (pause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // 3. While paused nothing ticks.
  if (state.paused) return { ...state, events: [] };

  const level = state.level;
  const levelIndex = state.levelIndex;
  const prevPlayer = state.player;
  const events = [];

  // 4. A playing step ticks.
  const tick = state.tick + 1;
  let levelTicks = state.levelTicks + 1;
  let seed = state.seed;

  // 5. Conflicts age by one and those at 0 go.
  let conflicts = [];
  for (const c of state.conflicts) {
    if (c.ttl - 1 > 0) conflicts.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }

  // 6. The player moves one cell when the target is passable.
  let player = state.player;
  if (move) {
    const [dx, dy] = DIRS[move];
    if (freeForPlayer(level, state.open, conflicts, player.x + dx, player.y + dy)) {
      player = { x: player.x + dx, y: player.y + dy };
    }
  }

  let carried = state.carried;
  let patches = state.patches;
  let merges = state.merges;
  let open = state.open;
  let score = state.score;

  // 7. Pickup: a patch on the player's cell is taken until CARRY_MAX.
  const at = patches.findIndex((p) => p.x === player.x && p.y === player.y);
  if (at >= 0 && carried.length < CARRY_MAX) {
    carried = [...carried, patches[at].color];
    patches = patches.filter((_, i) => i !== at);
    events.push('pickup');
  }

  // 8. Merge: patches carried onto a pad merge.
  if (cellAt(level, player.x, player.y) === 'M' && carried.length > 0) {
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

  // 9. Exit: an open exit ships the level and ends the step.
  if (open && cellAt(level, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (levelIndex + 1 < state.levels.length) {
      events.push('level');
      const next = parseLevel(state.levels[levelIndex + 1]);
      const drawn = drawPatches(next.spawns, seed);
      return {
        seed: drawn.seed,
        tick,
        levelTicks: 0,
        levels: state.levels,
        levelIndex: levelIndex + 1,
        level: next,
        player: { x: next.start.x, y: next.start.y },
        carried: [],
        patches: drawn.patches,
        drifts: next.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
        conflicts: [],
        score,
        lives: state.lives,
        merges: 0,
        open: false,
        invuln: 0,
        status: 'playing',
        paused: false,
        events,
      };
    }
    events.push('won');
    return {
      seed,
      tick,
      levelTicks,
      levels: state.levels,
      levelIndex,
      level,
      player,
      carried,
      patches,
      drifts: state.drifts,
      conflicts,
      score,
      lives: state.lives,
      merges,
      open,
      invuln: state.invuln,
      status: 'won',
      paused: false,
      events,
    };
  }

  // 10. Drifts move on their ticks: their own direction first, then each
  //     next direction clockwise, up to four.
  const moved = tick % level.driftPeriod === 0;
  let drifts = state.drifts;
  let prevDriftPos = null;
  if (moved) {
    prevDriftPos = state.drifts.map((d) => [d.x, d.y]);
    drifts = state.drifts.map((d) => {
      const from = CLOCKWISE.indexOf(d.dir);
      for (let i = 0; i < 4; i++) {
        const dir = CLOCKWISE[(from + i) % 4];
        const [dx, dy] = DIRS[dir];
        if (freeForDrift(level, conflicts, d.x + dx, d.y + dy)) {
          return { x: d.x + dx, y: d.y + dy, dir };
        }
      }
      return { x: d.x, y: d.y, dir: d.dir };
    });

    // 11. Collisions: every cell holding two or more drifts, in reading
    //     order, reverses its drifts and leaves a conflict.
    const stacks = new Map();
    for (const d of drifts) {
      const key = `${d.x},${d.y}`;
      const list = stacks.get(key);
      if (list) list.push(d);
      else stacks.set(key, [d]);
    }
    const cells = [...stacks.entries()]
      .filter(([, list]) => list.length >= 2)
      .map(([key]) => key.split(',').map(Number));
    cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    if (cells.length > 0) {
      const flipped = cells.map(([x, y]) => `${x},${y}`);
      const hitSet = new Set(flipped);
      const flip = (dir) => (dir === 'up' ? 'down' : dir === 'down' ? 'up' : dir === 'left' ? 'right' : 'left');
      drifts = drifts.map((d) => (hitSet.has(`${d.x},${d.y}`) ? { ...d, dir: flip(d.dir) } : d));
      for (let i = 0; i < cells.length; i++) {
        const [x, y] = cells[i];
        if (!conflicts.some((c) => c.x === x && c.y === y)) {
          conflicts = [...conflicts, { x, y, ttl: CONFLICT_TICKS }];
        }
        events.push('conflict');
      }
    }
  }

  // 12. Hits: immune while invuln lasts, else a drift on the player's
  //     cell or one that swapped cells with the player hits.
  let invuln = state.invuln;
  let lives = state.lives;
  let status = state.status;
  const hit = invuln <= 0 && (
    drifts.some((d) => d.x === player.x && d.y === player.y)
    || (moved !== null && moved && prevDriftPos !== null && drifts.some((d, i) =>
      d.x === prevPlayer.x && d.y === prevPlayer.y
      && prevDriftPos[i][0] === player.x && prevDriftPos[i][1] === player.y))
  );
  if (invuln > 0) {
    invuln -= 1;
  } else if (hit) {
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
        player = { x: level.start.x, y: level.start.y };
        invuln = INVULN_TICKS;
      }
    }
  }

  // 13. Spawns: at most one patch per spawn tick, point first, then colour.
  if (status === 'playing' && levelTicks % level.spawnEvery === 0
    && patches.length + carried.length < level.spawns.length) {
    const taken = (x, y) => patches.some((p) => p.x === x && p.y === y)
      || (player.x === x && player.y === y)
      || drifts.some((d) => d.x === x && d.y === y);
    const free = level.spawns.filter((sp) => !taken(sp.x, sp.y));
    if (free.length > 0) {
      const spot = rngInt(seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      seed = color.seed;
      patches = [...patches, { x: free[spot.value].x, y: free[spot.value].y, color: color.value }];
      events.push('spawn');
    }
  }

  return {
    seed,
    tick,
    levelTicks,
    levels: state.levels,
    levelIndex,
    level,
    player,
    carried,
    patches,
    drifts,
    conflicts,
    score,
    lives,
    merges,
    open,
    invuln,
    status,
    paused: state.paused,
    events,
  };
}
