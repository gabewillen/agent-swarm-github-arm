// The rules of Quorum Run (§5-§7). Pure: every step returns a new plain
// state and never changes the one it is given; randomness comes only from
// the state's seed through the rng of §3.
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

// The level's terrain at a cell, `#` outside the map (§5).
function levelTile(level, x, y) {
  const tiles = level.tiles;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return '#';
  if (y < 0 || y >= tiles.length) return '#';
  const row = tiles[y];
  if (x < 0 || x >= row.length) return '#';
  return row[x];
}

export function tileAt(state, x, y) {
  return levelTile(state.level, x, y);
}

// Whether the player can stand on the cell: not a wall, not a hold or the
// exit unless open, and no conflict on it (§6 step 6).
function passableToPlayer(level, open, conflicts, x, y) {
  const tile = levelTile(level, x, y);
  if (tile === '#') return false;
  if ((tile === 'H' || tile === 'X') && !open) return false;
  if (tile !== '#' && conflicts.some((c) => c.x === x && c.y === y)) return false;
  return true;
}

// Whether a drift can move onto the cell: not a wall, hold, or exit, and
// no conflict on it (§6 step 10). Drifts ignore the exit even when open.
function passableToDrift(level, conflicts, x, y) {
  const tile = levelTile(level, x, y);
  if (tile === '#' || tile === 'H' || tile === 'X') return false;
  if (conflicts.some((c) => c.x === x && c.y === y)) return false;
  return true;
}

// Loading a level (§5): parse it, draw a colour for every spawn point in
// reading order from the current seed, and reset the per-level fields.
// Score, lives, tick, and the seed's continuation are kept.
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
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    carried: [],
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
  };
}

export function init(seed, options = {}) {
  const levels = options.levels ?? LEVELS;
  let levelIndex = options.level ?? 0;
  if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= levels.length) {
    levelIndex = 0;
  }
  const s = seed >>> 0;
  const base = {
    seed: s,
    tick: 0,
    levels,
    score: 0,
    lives: START_LIVES,
    status: 'playing',
    paused: false,
    events: [],
  };
  return { ...base, ...loadLevel(levels[levelIndex], levelIndex, s) };
}

// A drift tries its own direction, then each next direction clockwise, up
// to four (§6 step 10).
function tryMoveDrift(drift, level, conflicts) {
  const start = CLOCKWISE.indexOf(drift.dir);
  for (let i = 0; i < 4; i += 1) {
    const dir = CLOCKWISE[(start + i) % 4];
    const vec = DIRS[dir];
    const x = drift.x + vec[0];
    const y = drift.y + vec[1];
    if (passableToDrift(level, conflicts, x, y)) {
      return { x, y, dir };
    }
  }
  return { x: drift.x, y: drift.y, dir: drift.dir };
}

export function step(state, input) {
  /** 1 */ if (state.status !== 'playing') return { ...state, events: [] };

  const wantsPause = Boolean(input) && input.pause === true;
  /** 2 */ if (wantsPause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }
  /** 3 */ if (state.paused) return { ...state, events: [] };

  const move = Boolean(input) && (input.move ?? null);
  const vec = DIRS[move] ?? null;
  const level = state.level;
  const events = [];
  let seed = state.seed;

  /** 4 */ const tick = state.tick + 1;
  let levelTicks = state.levelTicks + 1;

  /** 5 */ let conflicts = state.conflicts
    .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  /** 6 */ let player = { x: state.player.x, y: state.player.y };
  const prePlayer = { x: player.x, y: player.y };
  if (vec) {
    const x = player.x + vec[0];
    const y = player.y + vec[1];
    if (passableToPlayer(level, state.open, state.conflicts, x, y)) {
      player = { x, y };
    }
  }

  /** 7 */ let carried = state.carried;
  let patches = state.patches;
  if (carried.length < CARRY_MAX) {
    const index = patches.findIndex((p) => p.x === player.x && p.y === player.y);
    if (index >= 0) {
      carried = [...carried, patches[index].color];
      patches = patches.filter((_, i) => i !== index);
      events.push('pickup');
    }
  }

  /** 8 */ let score = state.score;
  let merges = state.merges;
  let open = state.open;
  if (levelTile(level, player.x, player.y) === 'M' && carried.length > 0) {
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

  /** 9 */ if (open && levelTile(level, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      const loaded = loadLevel(state.levels[state.levelIndex + 1], state.levelIndex + 1, seed);
      return { ...state, tick, ...loaded, score, events: ['level'] };
    }
    return { ...state, tick, score, status: 'won', events: ['won'] };
  }
  const status = state.status; // stays 'playing' from here on

  /** 10 */ let drifts = state.drifts;
  let oldPositions = null;
  let movedMask = null;
  const driftTick = tick % level.driftPeriod === 0;
  if (driftTick) {
    oldPositions = drifts.map((d) => ({ x: d.x, y: d.y }));
    drifts = drifts.map((d) => tryMoveDrift(d, level, conflicts));
    movedMask = drifts.map((d, i) => d.x !== oldPositions[i].x || d.y !== oldPositions[i].y);
  }

  /** 11 */ if (driftTick) {
    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        const here = drifts.filter((d) => d.x === x && d.y === y);
        if (here.length < 2) continue;
        drifts = drifts.map((d) =>
          d.x === x && d.y === y ? { x: d.x, y: d.y, dir: REVERSE[d.dir] } : d);
        if (!conflicts.some((c) => c.x === x && c.y === y)) {
          conflicts = [...conflicts, { x, y, ttl: CONFLICT_TICKS }];
        }
        events.push('conflict');
      }
    }
  }

  /** 12 */ let invuln = state.invuln;
  let lives = state.lives;
  if (invuln > 0) {
    invuln -= 1;
  } else {
    const onPlayer = drifts.some((d) => d.x === player.x && d.y === player.y);
    const swapped = driftTick && drifts.some((d, i) =>
      movedMask[i] &&
      d.x === prePlayer.x && d.y === prePlayer.y &&
      oldPositions[i].x === player.x && oldPositions[i].y === player.y);
    if (onPlayer || swapped) {
      if (carried.length > 0) {
        carried = [];
        invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        lives -= 1;
        events.push('hit');
        if (lives <= 0) {
          events.push('lost');
          return {
            ...state, seed, tick, levelTicks, player, carried, patches,
            drifts, conflicts, score, merges, open, invuln,
            lives, status: 'lost', events,
          };
        }
        player = { x: level.start.x, y: level.start.y };
        invuln = INVULN_TICKS;
      }
    }
  }

  /** 13 */ if (levelTicks % level.spawnEvery === 0 &&
      patches.length + carried.length < level.spawns.length) {
    const held = new Set(patches.map((p) => `${p.x},${p.y}`));
    const taken = new Set(drifts.map((d) => `${d.x},${d.y}`));
    const free = level.spawns.filter((sp) =>
      !held.has(`${sp.x},${sp.y}`) &&
      !(sp.x === player.x && sp.y === player.y) &&
      !taken.has(`${sp.x},${sp.y}`));
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
    ...state, seed, tick, levelTicks, player, carried, patches, drifts,
    conflicts, score, merges, open, invuln, lives, status, events,
  };
}
