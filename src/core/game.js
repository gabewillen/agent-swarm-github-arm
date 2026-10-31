// The rules of Quorum Run (DESIGN.md §5, §6, §7).
//
// Pure: step returns a fresh state and never changes the one it is
// given, or the input; randomness comes only from the state's seed.

import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';
import { rngInt } from './rng.js';
import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';

const MOVES = ['up', 'right', 'down', 'left'];
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The terrain character of a cell, '#' outside the map.
export function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined) return '#';
  if (x < 0 || x >= row.length) return '#';
  return row[x];
}

function at(x, y) {
  return { x, y };
}

function on(list, x, y) {
  return list.some((e) => e.x === x && e.y === y);
}

// Loads a level into a state: fresh per-level fields, patches drawn from
// the running seed, one patch per spawn point in reading order. Keeps
// score, lives, tick, status, paused, events, and the PRNG seed.
function loadLevel(state, index) {
  const level = parseLevel(state.levels[index]);
  let seed = state.seed >>> 0;
  const patches = [];
  for (const spawn of level.spawns) {
    const draw = rngInt(seed, COLORS);
    patches.push({ x: spawn.x, y: spawn.y, color: draw.value });
    seed = draw.seed;
  }
  return {
    ...state,
    levelIndex: index,
    level,
    player: at(level.start.x, level.start.y),
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
  const levelIndex = options.level ?? 0;
  return loadLevel({
    levels,
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    score: 0,
    lives: START_LIVES,
    merges: 0,
    open: false,
    invuln: 0,
    status: 'playing',
    paused: false,
    events: [],
  }, levelIndex);
}

// Passable to the player: not a wall, not a hold or the exit unless
// open, and no conflict on it. Drifts do not block.
function playerPassable(level, x, y, open, conflicts) {
  const t = level.tiles[y]?.[x] ?? '#';
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !open) return false;
  return !on(conflicts, x, y);
}

// Passable to a drift: not a wall, hold, or exit (open or not), and no
// conflict on it. Pads, patches, and the player do not block.
function driftPassable(level, x, y, conflicts) {
  const t = level.tiles[y]?.[x] ?? '#';
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !on(conflicts, x, y);
}

export function step(state, input) {
  const given = input !== null && typeof input === 'object' ? input : {};
  const move = MOVES.includes(given.move) ? given.move : null;
  const pause = given.pause === true;

  // 1. A finished game does nothing but empty its events.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. Pause flips paused; nothing else changes.
  if (pause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }

  // 3. Paused steps are idle.
  if (state.paused) return { ...state, events: [] };

  // 4. A tick passes.
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;
  const level = state.level;
  const events = [];

  // 5. Conflicts age by one and the spent go.
  let conflicts = state.conflicts
    .map((c) => ({ ...c, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. The player moves one cell when the target is passable.
  const prevPlayer = state.player;
  let player = prevPlayer;
  if (move !== null) {
    const tx = prevPlayer.x + DIRS[move][0];
    const ty = prevPlayer.y + DIRS[move][1];
    if (playerPassable(level, tx, ty, state.open, conflicts)) player = at(tx, ty);
  }

  // 7. Pickup: the patch on the player's cell, fewer than CARRY_MAX held.
  let patches = state.patches;
  let carried = state.carried;
  if (carried.length < CARRY_MAX) {
    const i = patches.findIndex((p) => p.x === player.x && p.y === player.y);
    if (i >= 0) {
      const found = patches[i];
      patches = patches.slice(0, i).concat(patches.slice(i + 1));
      carried = carried.concat([found.color]);
      events.push('pickup');
    }
  }

  // 8. Merge on a merge pad.
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  if ((level.tiles[player.y]?.[player.x] ?? '#') === 'M' && carried.length > 0) {
    const n = carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    score += gain;
    merges += n;
    carried = [];
    events.push('merge');
    if (!open && merges >= level.quorum) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. The exit ships the level.
  if (open && (level.tiles[player.y]?.[player.x] ?? '#') === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    const base = {
      ...state,
      tick,
      score,
      merges,
      conflicts,
      patches,
      carried,
      player,
      open: true,
    };
    if (state.levelIndex + 1 < state.levels.length) {
      const next = loadLevel(base, state.levelIndex + 1);
      return { ...next, events: events.concat(['level']) };
    }
    return { ...base, status: 'won', events: events.concat(['won']) };
  }

  // 10. Drifts move on a movement tick, trying their direction first,
  // then clockwise, up to four.
  let drifts = state.drifts;
  let preDrifts = drifts;
  const movesThisTick = tick % level.driftPeriod === 0;
  if (movesThisTick) {
    preDrifts = drifts;
    drifts = drifts.map((d) => {
      const from = CLOCKWISE.indexOf(d.dir);
      for (let i = 0; i < 4; i++) {
        const cand = CLOCKWISE[(from + i) % 4];
        const tx = d.x + DIRS[cand][0];
        const ty = d.y + DIRS[cand][1];
        if (driftPassable(level, tx, ty, conflicts)) {
          return { x: tx, y: ty, dir: cand };
        }
      }
      return { x: d.x, y: d.y, dir: d.dir };
    });
  }

  // 11. Drift collisions, on a movement tick only. Reading order per
  // cell: every drift there reverses, one conflict and one event each.
  if (movesThisTick) {
    const groups = new Map();
    for (let i = 0; i < drifts.length; i++) {
      const d = drifts[i];
      const key = `${d.x},${d.y}`;
      const g = groups.get(key);
      if (g) g.ids.push(i);
      else groups.set(key, { x: d.x, y: d.y, ids: [i] });
    }
    const cells = Array.from(groups.values())
      .filter((g) => g.ids.length >= 2)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    if (cells.length > 0) {
      const reverse = new Set();
      for (const g of cells) {
        for (const id of g.ids) reverse.add(id);
        if (!on(conflicts, g.x, g.y)) {
          conflicts = conflicts.concat([{ x: g.x, y: g.y, ttl: CONFLICT_TICKS }]);
        }
        events.push('conflict');
      }
      drifts = drifts.map((d, i) => (reverse.has(i) ? { ...d, dir: OPPOSITE[d.dir] } : d));
    }
  }

  // 12. Hits: skip while invulnerable, then a drift on the player's
  // cell, or a drift and the player swapping cells.
  let lives = state.lives;
  let invuln = state.invuln;
  let status = state.status;
  if (invuln > 0) {
    invuln -= 1;
  } else {
    const hit = drifts.some((d, i) => {
      if (d.x === player.x && d.y === player.y) return true;
      return movesThisTick
        && d.x === prevPlayer.x && d.y === prevPlayer.y
        && preDrifts[i].x === player.x && preDrifts[i].y === player.y;
    });
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
          player = at(level.start.x, level.start.y);
          invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns: a movement-less new patch every spawnEvery level ticks,
  // when patches and hands together leave a spawn point free.
  let seed = state.seed;
  if (
    status === 'playing'
    && levelTicks % level.spawnEvery === 0
    && patches.length + carried.length < level.spawns.length
  ) {
    const free = level.spawns.filter((sp) =>
      !on(patches, sp.x, sp.y)
      && !(sp.x === player.x && sp.y === player.y)
      && !on(drifts, sp.x, sp.y));
    if (free.length > 0) {
      const spot = rngInt(seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      const sp = free[spot.value];
      patches = patches.concat([{ x: sp.x, y: sp.y, color: color.value }]);
      seed = color.seed;
      events.push('spawn');
    }
  }

  return {
    ...state,
    seed,
    tick,
    levelTicks,
    conflicts,
    drifts,
    patches,
    carried,
    player,
    score,
    merges,
    open,
    lives,
    invuln,
    status,
    events,
  };
}
