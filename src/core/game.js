// The rules (DESIGN.md §5 to §7). init(seed, options) returns the first
// state; step(state, input) returns the next state and never changes the
// state it is given. tileAt(state, x, y) reads the level's terrain.
// Randomness comes only from the state's seed; every state is plain JSON.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

const CLOCKWISE_NEXT = { up: 'right', right: 'down', down: 'left', left: 'up' };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The level's terrain character at a cell, '#' outside the map.
export function tileAt(state, x, y) {
  const tiles = state.level.tiles;
  if (y < 0 || y >= tiles.length || x < 0 || x >= tiles[y].length) return '#';
  return tiles[y][x];
}

const conflictAt = (conflicts, x, y) =>
  conflicts.some((c) => c.x === x && c.y === y);

// Loads a level: parsing, fresh patch colours drawn from the running seed,
// per-level fields reset, and score, lives, and tick carried over.
function loadLevel(levels, levelIndex, seed, carriedOver) {
  const level = parseLevel(levels[levelIndex]);
  let s = seed;
  const patches = level.spawns.map((sp) => {
    const r = rngInt(s, COLORS);
    s = r.seed;
    return { x: sp.x, y: sp.y, color: r.value };
  });
  return {
    seed: s,
    tick: carriedOver.tick,
    levelTicks: 0,
    levels,
    levelIndex,
    level,
    player: { x: level.start.x, y: level.start.y },
    carried: [],
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    conflicts: [],
    score: carriedOver.score,
    lives: carriedOver.lives,
    merges: 0,
    open: false,
    invuln: 0,
    status: 'playing',
    paused: false,
    events: [],
  };
}

export function init(seed, options = {}) {
  const levels = options.levels ?? LEVELS;
  const levelIndex = options.level ?? 0;
  return loadLevel(levels, levelIndex, seed >>> 0, {
    tick: 0, score: 0, lives: START_LIVES,
  });
}

export function step(state, input) {
  // §6 step 1: a finished game changes nothing except its events.
  if (state.status !== 'playing') return { ...state, events: [] };

  const raw = input === null || typeof input !== 'object' ? {} : input;
  const move = typeof raw.move === 'string' && raw.move in DIRS ? raw.move : null;
  const pause = raw.pause === true;

  // §6 step 2: a pause flips paused and stops there.
  if (pause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // §6 step 3: a paused game does nothing.
  if (state.paused) return { ...state, events: [] };

  // §6 step 4: the clock runs and events start empty.
  const events = [];
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;
  const oldPlayer = { x: state.player.x, y: state.player.y };
  const level = state.level;

  // §6 step 5: conflicts age; those at 0 go.
  let conflicts = state.conflicts
    .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // §6 step 6: the player moves when the target cell is passable: not a
  // wall, not a hold or the exit unless open, and no conflict on it.
  let player = oldPlayer;
  if (move) {
    const [dx, dy] = DIRS[move];
    const nx = oldPlayer.x + dx;
    const ny = oldPlayer.y + dy;
    const ch = tileAt(state, nx, ny);
    const blocking = ch === '#' ||
      ((ch === 'H' || ch === 'X') && !state.open) ||
      conflictAt(conflicts, nx, ny);
    if (!blocking) player = { x: nx, y: ny };
  }

  // §6 step 7: pickup, in pickup order, while hands have room.
  let carried = state.carried.slice();
  let patches = state.patches.slice();
  const patchIndex = patches.findIndex((p) => p.x === player.x && p.y === player.y);
  if (patchIndex >= 0 && carried.length < CARRY_MAX) {
    const patch = patches[patchIndex];
    patches.splice(patchIndex, 1);
    carried.push(patch.color);
    events.push('pickup');
  }

  // §6 step 8: merge on a merge pad with patches in hand.
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  if (tileAt(state, player.x, player.y) === 'M' && carried.length > 0) {
    const n = carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) gain += SAME_COLOR_BONUS * n;
    score += gain;
    merges += n;
    carried = [];
    events.push('merge');
    if (merges >= level.quorum && !open) {
      open = true;
      events.push('quorum');
    }
  }

  // §6 step 9: the exit ships the level and ends the step before it runs.
  if (open && tileAt(state, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      const next = loadLevel(state.levels, state.levelIndex + 1, state.seed, {
        tick, score, lives: state.lives,
      });
      events.push('level');
      next.events = events;
      return next;
    }
    events.push('won');
    return {
      ...state, seed: state.seed, tick, levelTicks, player, carried, patches,
      conflicts, score, merges, open, invuln: state.invuln, status: 'won', events,
    };
  }

  // §6 step 10: drifts move on ticks of their period, each trying its own
  // direction first, then clockwise, up to four. They ignore the player,
  // patches, and each other; holds, the exit (open or not), walls, and
  // conflicts block them.
  const driftsMoved = tick % level.driftPeriod === 0;
  const drifts = state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  const driftWas = drifts.map((d) => ({ x: d.x, y: d.y }));
  if (driftsMoved) {
    for (const drift of drifts) {
      let dir = drift.dir;
      for (let tries = 0; tries < 4; tries++) {
        const [dx, dy] = DIRS[dir];
        const ch = tileAt(state, drift.x + dx, drift.y + dy);
        if (ch !== '#' && ch !== 'H' && ch !== 'X' &&
            !conflictAt(conflicts, drift.x + dx, drift.y + dy)) {
          drift.x += dx;
          drift.y += dy;
          drift.dir = dir;
          break;
        }
        dir = CLOCKWISE_NEXT[dir];
      }
    }
  }

  // §6 step 11: collisions, only on ticks when drifts moved. Reading
  // order per cell: every drift there reverses, a conflict adds unless
  // one already sits on the cell, and one conflict event per cell.
  if (driftsMoved) {
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const here = drifts.filter((d) => d.x === x && d.y === y);
        if (here.length < 2) continue;
        for (const drift of here) drift.dir = OPPOSITE[drift.dir];
        if (!conflictAt(conflicts, x, y)) conflicts.push({ x, y, ttl: CONFLICT_TICKS });
        events.push('conflict');
      }
    }
  }

  // §6 step 12: hits. Immunity just counts down; otherwise a drift on the
  // player's cell or one that swapped cells with the player acts.
  let lives = state.lives;
  let invuln = state.invuln;
  let status = state.status;
  if (invuln > 0) {
    invuln -= 1;
  } else {
    const swapped = (d, i) =>
      d.x === oldPlayer.x && d.y === oldPlayer.y &&
      driftWas[i].x === player.x && driftWas[i].y === player.y;
    const hit = drifts.some((d) => d.x === player.x && d.y === player.y) ||
      drifts.some(swapped);
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

  // §6 step 13: spawns, while the game is still being played.
  if (status === 'playing' && levelTicks % level.spawnEvery === 0 &&
      patches.length + carried.length < level.spawns.length) {
    const free = level.spawns.filter((sp) =>
      !patches.some((p) => p.x === sp.x && p.y === sp.y) &&
      !(player.x === sp.x && player.y === sp.y) &&
      !drifts.some((d) => d.x === sp.x && d.y === sp.y));
    if (free.length > 0) {
      const spot = rngInt(state.seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      patches.push({ x: free[spot.value].x, y: free[spot.value].y, color: color.value });
      events.push('spawn');
      return {
        ...state, seed: color.seed, tick, levelTicks, player, carried, patches,
        drifts, conflicts, score, lives, merges, open, invuln, status, events,
      };
    }
  }

  return {
    ...state, seed: state.seed, tick, levelTicks, player, carried, patches,
    drifts, conflicts, score, lives, merges, open, invuln, status, events,
  };
}
