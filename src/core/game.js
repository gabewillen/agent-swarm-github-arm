// Quorum Run's rules: the state (§5), a step (§6), and the events (§7).
// Pure: no DOM, no clock, no Math.random — randomness comes only from the
// state's seed (§3). Every returned state is fresh plain data; the state
// given to step is never changed, not even deeply.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

const MOVES = new Set(['up', 'right', 'down', 'left']);
const NEXT_DIR = { up: 'right', right: 'down', down: 'left', left: 'up' };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// Draws `count` patch colours from the seed, in spawn-point reading order.
function drawPatches(spawns, seed) {
  let s = seed >>> 0;
  const patches = spawns.map((sp) => {
    const d = rngInt(s, COLORS);
    s = d.seed;
    return { x: sp.x, y: sp.y, color: d.value };
  });
  return { patches, seed: s >>> 0 };
}

// Loading a level (§5): parses it and gives every spawn a fresh colour.
function loadLevel(def, seed) {
  const level = parseLevel(def);
  const drawn = drawPatches(level.spawns, seed);
  return { level, patches: drawn.patches, seed: drawn.seed };
}

export function init(seed, options = {}) {
  const levels = options.levels ?? LEVELS;
  const want = typeof options.level === 'number' ? options.level : 0;
  const levelIndex = Math.max(0, Math.min(levels.length - 1, Math.floor(want)));
  const loaded = loadLevel(levels[levelIndex], seed === undefined || seed === null ? 0 : seed);
  return {
    seed: loaded.seed,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level: loaded.level,
    player: { x: loaded.level.start.x, y: loaded.level.start.y },
    carried: [],
    patches: loaded.patches,
    drifts: loaded.level.drifts.map((d) => ({ ...d })),
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
  const level = state.level;
  const row = y >= 0 && y < level.height ? level.tiles[y] : undefined;
  return x >= 0 && row !== undefined && x < row.length ? row[x] : '#';
}

function reversed(dir) {
  return OPPOSITE[dir] ?? dir;
}

export function step(state, input) {
  // 1. A game that is over changes nothing but its events.
  if (state.status !== 'playing') {
    return { ...state, events: [] };
  }
  const raw = input !== null && typeof input === 'object' ? input : {};
  // 2. Pause flips the flag and returns before anything else; nothing ticks.
  if (raw.pause === true) {
    return { ...state, events: [state.paused ? 'resume' : 'pause'], paused: !state.paused };
  }
  // 3. While paused, nothing happens.
  if (state.paused) {
    return { ...state, events: [] };
  }
  const move = typeof raw.move === 'string' && MOVES.has(raw.move) ? raw.move : null;

  const level = state.level;
  const tiles = level.tiles;
  const width = level.width;
  const height = level.height;
  const terrain = (x, y) =>
    y >= 0 && y < height && x >= 0 && x < (tiles[y] ? tiles[y].length : 0) ? tiles[y][x] : '#';

  // 4. One tick while playing.
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;
  const events = [];

  // 5. Conflicts age; the aged set is what the rest of the step sees.
  const conflicts = [];
  for (const c of state.conflicts) {
    if (c.ttl - 1 > 0) conflicts.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }
  const conflictOn = (x, y) => conflicts.some((c) => c.x === x && c.y === y);

  // 6. The player's move, against the board as it stands before merges.
  const from = { ...state.player };
  let player = from;
  if (move) {
    const d = DIRS[move];
    const tx = from.x + d[0];
    const ty = from.y + d[1];
    const t = terrain(tx, ty);
    const gated = (t === 'H' || t === 'X') && !state.open;
    if (t !== '#' && !gated && !conflictOn(tx, ty)) {
      player = { x: tx, y: ty };
    }
  }

  // 7. Pickup: one patch under the player's feet, hands permitting.
  let patches = state.patches.map((p) => ({ ...p }));
  let carried = state.carried.slice();
  const on = patches.findIndex((p) => p.x === player.x && p.y === player.y);
  if (on >= 0 && carried.length < CARRY_MAX) {
    carried.push(patches[on].color);
    patches.splice(on, 1);
    events.push('pickup');
  }

  // 8. Merge on a pad; may open the level when the quorum lands.
  let open = state.open;
  let score = state.score;
  let merges = state.merges;
  if (terrain(player.x, player.y) === 'M' && carried.length > 0) {
    const n = carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) gain += SAME_COLOR_BONUS * n;
    score += gain;
    merges += n;
    carried = [];
    events.push('merge');
    if (!open && merges >= level.quorum) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. The exit, once open: a time bonus, then the next level or a win.
  //    Either way the step ends here, before the drifts move.
  if (open && terrain(player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      const loaded = loadLevel(state.levels[state.levelIndex + 1], state.seed);
      return {
        ...state,
        seed: loaded.seed,
        tick,
        levelTicks: 0,
        levelIndex: state.levelIndex + 1,
        level: loaded.level,
        player: { x: loaded.level.start.x, y: loaded.level.start.y },
        carried: [],
        patches: loaded.patches,
        drifts: loaded.level.drifts.map((d) => ({ ...d })),
        conflicts: [],
        score,
        merges: 0,
        open: false,
        invuln: 0,
        events: [...events, 'level'],
      };
    }
    return {
      ...state,
      tick,
      score,
      status: 'won',
      events: [...events, 'won'],
    };
  }

  // 10. Drifts move when the tick is their turn, each clockwise-first.
  let drifts = state.drifts.map((d) => ({ ...d }));
  let driftsMoved = tick % level.driftPeriod === 0;
  if (driftsMoved) {
    const moved = [];
    for (const d of state.drifts) {
      let placed = false;
      let dir = d.dir;
      for (let tries = 0; tries < 4; tries += 1) {
        const nd = DIRS[dir];
        const tx = d.x + nd[0];
        const ty = d.y + nd[1];
        const t = terrain(tx, ty);
        if (t !== '#' && t !== 'H' && t !== 'X' && !conflictOn(tx, ty)) {
          moved.push({ x: tx, y: ty, dir });
          placed = true;
          break;
        }
        dir = NEXT_DIR[dir];
      }
      if (!placed) moved.push({ x: d.x, y: d.y, dir: d.dir });
    }
    drifts = moved;
  }

  // 11. Collisions, only on a moving tick: two or more drifts on a cell
  //     reverse it in, mark the cell (once), and speak once per cell.
  if (driftsMoved) {
    const cells = new Map();
    for (let i = 0; i < drifts.length; i += 1) {
      const key = `${drifts[i].x},${drifts[i].y}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(i);
    }
    const spots = [...cells.keys()]
      .map((k) => k.split(',').map(Number))
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [x, y] of spots) {
      const there = cells.get(`${x},${y}`);
      if (there.length < 2) continue;
      for (const i of there) drifts[i].dir = reversed(drifts[i].dir);
      if (!conflictOn(x, y)) conflicts.push({ x, y, ttl: CONFLICT_TICKS });
      events.push('conflict');
    }
  }

  // 12. Hits: immune ticks count down untouched; the drift, the swap.
  let lives = state.lives;
  let invuln = state.invuln;
  let status = 'playing';
  let landed = player;
  if (invuln > 0) {
    invuln -= 1;
  } else {
    let hit = drifts.some((d) => d.x === player.x && d.y === player.y);
    if (!hit) {
      hit = drifts.some((d, i) =>
        d.x === from.x && d.y === from.y &&
        state.drifts[i].x === player.x && state.drifts[i].y === player.y);
    }
    if (hit) {
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
          landed = { x: level.start.x, y: level.start.y };
          invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns, while the game is still being played: one free point.
  let seed = state.seed;
  if (status === 'playing' && levelTicks % level.spawnEvery === 0 &&
      patches.length + carried.length < level.spawns.length) {
    const free = level.spawns.filter((sp) =>
      !patches.some((p) => p.x === sp.x && p.y === sp.y) &&
      !(player.x === sp.x && player.y === sp.y) &&
      !drifts.some((d) => d.x === sp.x && d.y === sp.y));
    if (free.length > 0) {
      const which = rngInt(seed, free.length);
      seed = which.seed;
      const color = rngInt(seed, COLORS);
      seed = color.seed;
      const spot = free[which.value];
      patches = [...patches, { x: spot.x, y: spot.y, color: color.value }];
      events.push('spawn');
    }
  }

  return {
    ...state,
    seed: seed >>> 0,
    tick,
    levelTicks,
    player: landed,
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
