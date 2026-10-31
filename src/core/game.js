// Quorum Run's rules (DESIGN.md §5 to §7): the state shape, loading,
// stepping, and terrain reads. Pure: a step never changes the state it is
// given, every returned state is plain JSON, and randomness comes only
// from the state's seed through the PRNG of §3.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

// The terrain character at a level cell, '#' outside the map.
function tileOf(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

export function tileAt(state, x, y) {
  return tileOf(state.level, x, y);
}

// Cells a player may stand on: not a wall, a hold or the exit only when
// open, and never a conflict.
function passableToPlayer(s, x, y) {
  const t = tileOf(s.level, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !s.open) return false;
  return !s.conflicts.some((c) => c.x === x && c.y === y);
}

// Cells a drift may enter: not a wall, never a hold or the exit (open or
// not), and never a conflict.
function passableToDrift(s, x, y) {
  const t = tileOf(s.level, x, y);
  if (t === '#') return false;
  if (t === 'H' || t === 'X') return false;
  return !s.conflicts.some((c) => c.x === x && c.y === y);
}

// Loads the level at state.levelIndex into state: level, player, drifts,
// and freshly coloured patches, resetting the per-level fields but keeping
// score, lives, tick, and the seed (§5).
function loadLevel(s) {
  const level = parseLevel(s.levels[s.levelIndex]);
  const next = {
    ...s,
    level,
    player: { x: level.start.x, y: level.start.y },
    carried: [],
    patches: [],
    drifts: level.drifts.map((d) => ({ ...d })),
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
  };
  const patches = [];
  let seed = next.seed;
  for (const sp of level.spawns) {
    const r = rngInt(seed, COLORS);
    patches.push({ x: sp.x, y: sp.y, color: r.value });
    seed = r.seed;
  }
  next.patches = patches;
  next.seed = seed;
  return next;
}

export function init(seed, options = {}) {
  const levels = options.levels ?? LEVELS;
  const levelIndex = options.level ?? 0;
  const base = {
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
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
  return loadLevel(base);
}

export function step(state, input) {
  const inp = input ?? {};
  const move = inp.move ?? null;
  const pause = Boolean(inp.pause);

  // 1. A finished game no longer changes.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. Pausing flips the flag and ends the step.
  if (pause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // 3. While paused nothing happens.
  if (state.paused) return { ...state, events: [] };

  // 4.
  let s = {
    ...state,
    events: [],
    tick: state.tick + 1,
    levelTicks: state.levelTicks + 1,
  };

  // 5. Conflicts age, then those at 0 go.
  s.conflicts = [];
  for (const c of state.conflicts) {
    const ttl = c.ttl - 1;
    if (ttl > 0) s.conflicts.push({ x: c.x, y: c.y, ttl });
  }

  // 6. The player moves onto a passable cell, else stays.
  const playerPrev = { x: state.player.x, y: state.player.y };
  s.player = { ...playerPrev };
  if (move && DIRS[move]) {
    const nx = playerPrev.x + DIRS[move][0];
    const ny = playerPrev.y + DIRS[move][1];
    if (passableToPlayer(s, nx, ny)) s.player = { x: nx, y: ny };
  }

  // 7. Pickup, in pickup order, up to CARRY_MAX.
  s.carried = [...state.carried];
  s.patches = [...state.patches];
  if (s.carried.length < CARRY_MAX) {
    const i = s.patches.findIndex((p) => p.x === s.player.x && p.y === s.player.y);
    if (i !== -1) {
      s.carried = [...s.carried, s.patches[i].color];
      s.patches = s.patches.filter((_, j) => j !== i);
      s.events.push('pickup');
    }
  }

  // 8. Merging on a pad scores and opens the level at quorum.
  if (s.carried.length > 0 && tileOf(s.level, s.player.x, s.player.y) === 'M') {
    const n = s.carried.length;
    let gained = PATCH_BASE * n * n;
    if (n >= 2 && s.carried.every((c) => c === s.carried[0])) {
      gained += SAME_COLOR_BONUS * n;
    }
    s.score += gained;
    s.merges += n;
    s.carried = [];
    s.events.push('merge');
    if (!s.open && s.merges >= s.level.quorum) {
      s.open = true;
      s.events.push('quorum');
    }
  }

  // 9. Shipping the level ends the step before anything moves.
  if (s.open && tileOf(s.level, s.player.x, s.player.y) === 'X') {
    s.score += Math.max(0, s.level.par - s.levelTicks) * TIME_BONUS_PER_TICK;
    if (s.levelIndex + 1 < s.levels.length) {
      s.levelIndex = s.levelIndex + 1;
      const next = loadLevel(s);
      next.events = [...s.events, 'level'];
      return next;
    }
    s.status = 'won';
    s.events = [...s.events, 'won'];
    return s;
  }

  // 10. Drifts move on their period, one cell, clockwise retries.
  const driftsMove = s.tick % s.level.driftPeriod === 0;
  const driftPrev = driftsMove
    ? s.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }))
    : null;
  if (driftsMove) {
    s.drifts = s.drifts.map((d) => {
      const from = CLOCKWISE.indexOf(d.dir);
      for (let i = 0; i < 4; i++) {
        const dir = CLOCKWISE[(from + i) % 4];
        const nx = d.x + DIRS[dir][0];
        const ny = d.y + DIRS[dir][1];
        if (passableToDrift(s, nx, ny)) return { x: nx, y: ny, dir };
      }
      return { x: d.x, y: d.y, dir: d.dir };
    });
  }

  // 11. Collisions, only on ticks when drifts moved: one cell at a time in
  // reading order, the drifts there reverse, one conflict and one event.
  if (driftsMove) {
    const count = new Map();
    for (const d of s.drifts) {
      const key = `${d.x},${d.y}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    const cells = [...count.entries()]
      .filter(([, n]) => n >= 2)
      .map(([key]) => {
        const [x, y] = key.split(',').map(Number);
        return { x, y };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const rev = { up: 'down', down: 'up', left: 'right', right: 'left' };
    for (const cell of cells) {
      s.drifts = s.drifts.map((d) => (d.x === cell.x && d.y === cell.y
        ? { x: d.x, y: d.y, dir: rev[d.dir] }
        : d));
      if (!s.conflicts.some((c) => c.x === cell.x && c.y === cell.y)) {
        s.conflicts.push({ x: cell.x, y: cell.y, ttl: CONFLICT_TICKS });
      }
      s.events.push('conflict');
    }
  }

  // 12. Hits: immunity counts down while it lasts, else a drift on the
  // player's cell, or a drift that swapped cells with the player this step.
  if (s.invuln > 0) {
    s.invuln = s.invuln - 1;
  } else {
    const touched = s.drifts.some((d) => d.x === s.player.x && d.y === s.player.y)
      || (driftsMove && s.drifts.some((d, i) => (d.x !== driftPrev[i].x || d.y !== driftPrev[i].y)
        && d.x === playerPrev.x && d.y === playerPrev.y
        && driftPrev[i].x === s.player.x && driftPrev[i].y === s.player.y));
    if (touched) {
      if (s.carried.length > 0) {
        s.carried = [];
        s.invuln = INVULN_TICKS;
        s.events.push('drop');
      } else {
        s.lives = s.lives - 1;
        s.events.push('hit');
        if (s.lives === 0) {
          s.status = 'lost';
          s.events.push('lost');
        } else {
          s.player = { x: s.level.start.x, y: s.level.start.y };
          s.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns come after hits, and only while still playing.
  if (s.status === 'playing'
    && s.levelTicks % s.level.spawnEvery === 0
    && s.patches.length + s.carried.length < s.level.spawns.length) {
    const occupied = new Set();
    for (const p of s.patches) occupied.add(`${p.x},${p.y}`);
    for (const d of s.drifts) occupied.add(`${d.x},${d.y}`);
    occupied.add(`${s.player.x},${s.player.y}`);
    const free = s.level.spawns.filter((sp) => !occupied.has(`${sp.x},${sp.y}`));
    if (free.length > 0) {
      const spot = rngInt(s.seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      s.patches = [...s.patches, { x: free[spot.value].x, y: free[spot.value].y, color: color.value }];
      s.seed = color.seed;
      s.events.push('spawn');
    }
  }

  return s;
}
