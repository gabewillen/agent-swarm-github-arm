// Quorum Run: the rules (DESIGN.md §5 to §7). The core is pure: step never
// changes the state it is given or the input object, and every state is
// plain JSON data. Randomness comes only from the state's seed.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS,
  DIRS, CLOCKWISE,
} from './constants.js';
import { parseLevel } from './level.js';
import { rngInt } from './rng.js';
import { LEVELS } from '../data/levels.js';

// Load a level into a state skeleton: sets the parsed level, the player at
// the level's start, one patch on every spawn with a fresh colour draw, and
// fresh per-level fields. It keeps whatever else is in state (score, lives,
// tick, status, paused, levels, seed), except levelIndex, which is set here.
function withLevel(state, levelIndex) {
  const level = parseLevel(state.levels[levelIndex]);
  let seed = state.seed;
  const patches = [];
  for (const spot of level.spawns) {
    const draw = rngInt(seed, COLORS);
    seed = draw.seed;
    patches.push({ x: spot.x, y: spot.y, color: draw.value });
  }
  return {
    ...state,
    level,
    levelIndex,
    player: { x: level.start.x, y: level.start.y },
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    carried: [],
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
    seed,
  };
}

export function init(seed, options = {}) {
  const levels = options.levels ?? LEVELS;
  const base = {
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex: options.level ?? 0,
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
  return withLevel(base, options.level ?? 0);
}

export function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined || x < 0) return '#';
  const ch = row[x];
  return ch === undefined ? '#' : ch;
}

// Terrain of the current level, walls outside; used while building a state.
const terrainAt = (level, x, y) => {
  const row = level.tiles[y];
  if (row === undefined || x < 0) return '#';
  const ch = row[x];
  return ch === undefined ? '#' : ch;
};

const conflictsOn = (conflicts, x, y) =>
  conflicts.some((c) => c.x === x && c.y === y);

// Passable to the player: not a wall, not a hold or the exit unless the
// level is open, and no conflict on it.
function playerPassable(level, conflicts, open, x, y) {
  const t = terrainAt(level, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !open) return false;
  if (conflictsOn(conflicts, x, y)) return false;
  return true;
}

// Passable to a drift: not a wall, not a hold, never the exit (open or not),
// and no conflict on it.
function driftPassable(level, conflicts, x, y) {
  const t = terrainAt(level, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  if (conflictsOn(conflicts, x, y)) return false;
  return true;
}

// Grow by one in CLOCKWISE order from dir and return the direction.
const nextClockwise = (dir) => CLOCKWISE[(CLOCKWISE.indexOf(dir) + 1) % 4];

const reverseDir = (dir) =>
  dir === 'up' ? 'down' : dir === 'down' ? 'up' : dir === 'left' ? 'right' : 'left';

export function step(state, input) {
  const body = input && typeof input === 'object' ? input : null;
  const move = body && (body.move ?? null);
  const wantsPause = Boolean(body && body.pause);

  // 1. A finished game no longer changes.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause input flips paused; nothing else changes.
  if (wantsPause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }

  // 3. While paused nothing moves and no tick passes.
  if (state.paused) return { ...state, events: [] };

  // 4. The step counts a tick.
  const tick = state.tick + 1;
  let levelTicks = state.levelTicks + 1;
  let player = { ...state.player };
  const playerBefore = { ...player };
  const level = state.level;

  // 5. Conflicts age.
  let conflicts = state.conflicts
    .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. The player moves onto a passable cell, else stays.
  if (move !== null && DIRS[move] !== undefined) {
    const [dx, dy] = DIRS[move];
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (playerPassable(level, conflicts, state.open, nx, ny)) player = { x: nx, y: ny };
  }

  const events = [];

  // 7. Pickup, in pickup order, while carrying fewer than CARRY_MAX.
  let patches = state.patches;
  let carried = state.carried;
  if (carried.length < CARRY_MAX) {
    for (let i = 0; i < patches.length; i++) {
      if (patches[i].x === player.x && patches[i].y === player.y) {
        carried = [...carried, patches[i].color];
        patches = patches.filter((_, j) => j !== i);
        events.push('pickup');
        break;
      }
    }
  }

  // 8. Merge on a pad.
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  if (terrainAt(level, player.x, player.y) === 'M' && carried.length > 0) {
    const n = carried.length;
    score += PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) {
      score += SAME_COLOR_BONUS * n;
    }
    merges += n;
    carried = [];
    events.push('merge');
    if (merges >= level.quorum && !open) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. An open exit ships the level: time bonus, then the next level or a win.
  if (open && terrainAt(level, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      const next = withLevel(state, state.levelIndex + 1);
      return { ...next, score, tick, events: ['level'] };
    }
    return {
      ...state, seed: state.seed, tick,
      player, patches, carried, conflicts,
      score, merges, open, events: [...events, 'won'], status: 'won',
    };
  }

  // 10. Drifts move on every driftPeriod-th tick.
  let drifts = state.drifts;
  let driftsMoved = false;
  if (tick % level.driftPeriod === 0) {
    driftsMoved = true;
    drifts = drifts.map((d) => {
      let dir = d.dir;
      for (let tries = 0; tries < 4; tries++) {
        const [dx, dy] = DIRS[dir];
        const nx = d.x + dx;
        const ny = d.y + dy;
        if (driftPassable(level, conflicts, nx, ny)) return { x: nx, y: ny, dir };
        dir = nextClockwise(dir);
      }
      return { x: d.x, y: d.y, dir: d.dir };
    });
  }

  // 11. Drift collisions: two or more drifts on one cell reverse and leave
  // a conflict, unless one is already there.
  if (driftsMoved) {
    const stack = new Map();
    drifts.forEach((d, i) => {
      const key = `${d.x},${d.y}`;
      const list = stack.get(key) ?? [];
      list.push(i);
      stack.set(key, list);
    });
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const indices = stack.get(`${x},${y}`);
        if (indices === undefined || indices.length < 2) continue;
        drifts = drifts.map((d, i) =>
          indices.includes(i) ? { ...d, dir: reverseDir(d.dir) } : d,
        );
        if (!conflictsOn(conflicts, x, y)) {
          conflicts = [...conflicts, { x, y, ttl: CONFLICT_TICKS }];
        }
        events.push('conflict');
      }
    }
  }

  // 12. Hits: an immunity tick passes with no hit; otherwise a drift on the
  // player's cell, or one that swapped cells with the player, hits.
  let invuln = state.invuln;
  let lives = state.lives;
  let status = 'playing';
  if (invuln > 0) {
    invuln -= 1;
  } else {
    let hit = drifts.some((d) => d.x === player.x && d.y === player.y);
    if (!hit && driftsMoved) {
      hit = drifts.some((d, i) =>
        d.x === playerBefore.x && d.y === playerBefore.y &&
        state.drifts[i].x === player.x && state.drifts[i].y === player.y,
      );
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
          player = { x: level.start.x, y: level.start.y };
          invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns: one patch, on a free spawn point, when they are due.
  let seed = state.seed;
  if (levelTicks % level.spawnEvery === 0 &&
      patches.length + carried.length < level.spawns.length) {
    const taken = new Set(patches.map((p) => `${p.x},${p.y}`));
    const free = level.spawns.filter((s) =>
      !taken.has(`${s.x},${s.y}`) &&
      !(s.x === player.x && s.y === player.y) &&
      !drifts.some((d) => d.x === s.x && d.y === s.y),
    );
    if (free.length > 0) {
      const spot = rngInt(seed, free.length);
      seed = spot.seed;
      const color = rngInt(seed, COLORS);
      seed = color.seed;
      patches = [...patches, { x: free[spot.value].x, y: free[spot.value].y, color: color.value }];
      events.push('spawn');
    }
  }

  return {
    ...state,
    seed,
    tick,
    levelTicks,
    player,
    patches,
    carried,
    conflicts,
    drifts,
    score,
    lives,
    merges,
    open,
    invuln,
    status,
    events,
  };
}
