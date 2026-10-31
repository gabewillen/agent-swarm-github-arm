// Quorum Run rules (DESIGN.md §5, §6, §7): the state, one step at a time.
// Pure: no DOM, no clock, no Math.random. Randomness comes only from the
// state's seed through the PRNG of §3, and every draw replaces it.

import {
  START_LIVES,
  INVULN_TICKS,
  CONFLICT_TICKS,
  PATCH_BASE,
  SAME_COLOR_BONUS,
  TIME_BONUS_PER_TICK,
  COLORS,
  DIRS,
  CARRY_MAX,
  CLOCKWISE,
} from './constants.js';
import { parseLevel } from './level.js';
import { rngInt } from './rng.js';
import { LEVELS } from '../data/levels.js';

const MOVES = new Set(CLOCKWISE); // 'up', 'right', 'down', 'left'
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// Load a level: parse it, draw a colour per spawn point in reading order,
// and set the per-level fields. Returns everything fresh plus the seed
// after the draws.
function loadLevel(levels, index, seed) {
  const level = parseLevel(levels[index]);
  const patches = [];
  for (const spot of level.spawns) {
    const r = rngInt(seed, COLORS);
    patches.push({ x: spot.x, y: spot.y, color: r.value });
    seed = r.seed;
  }
  return {
    level,
    patches,
    player: { x: level.start.x, y: level.start.y },
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    seed,
  };
}

export function init(seed, options) {
  const levels = options && options.levels ? options.levels : LEVELS;
  const levelIndex = options && options.level ? options.level : 0;
  const fresh = loadLevel(levels, levelIndex, seed >>> 0);
  return {
    seed: fresh.seed,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level: fresh.level,
    player: fresh.player,
    carried: [],
    patches: fresh.patches,
    drifts: fresh.drifts,
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
  if (y < 0 || y >= level.height || x < 0 || x >= level.width) return '#';
  return level.tiles[y][x];
}

// A cell a drift can enter: not a wall, not a hold, not the exit, and no
// conflict on it.
function driftSeesTile(t) {
  return t !== '#' && t !== 'H' && t !== 'X';
}
function conflictOn(list, x, y) {
  return list.some((c) => c.x === x && c.y === y);
}

export function step(state, input) {
  // 1. A won or lost game changes nothing.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2-3. Pause requests flip paused; pauses stop everything.
  const pause = Boolean(input && input.pause);
  if (pause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }
  if (state.paused) return { ...state, events: [] };

  const move = input && MOVES.has(input.move) ? input.move : null;

  // 4. Time passes. 5. Conflicts age.
  let seed = state.seed;
  let conflicts = state.conflicts
    .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);
  const events = [];

  // 6. The player moves one cell, when the target lets them.
  const dir = move ? DIRS[move] : null;
  const playerWas = { x: state.player.x, y: state.player.y };
  let player = playerWas;
  if (dir) {
    const tx = playerWas.x + dir[0];
    const ty = playerWas.y + dir[1];
    const t = tileAt(state, tx, ty);
    const gated = (t === 'H' || t === 'X') && !state.open;
    if (t !== '#' && !gated && !conflictOn(conflicts, tx, ty)) {
      player = { x: tx, y: ty };
    }
  }

  // 7. Pickup: one patch lies here and there is room to carry it.
  let carried = state.carried;
  let patches = state.patches;
  const lying = patches.findIndex((p) => p.x === player.x && p.y === player.y);
  if (lying >= 0 && carried.length < CARRY_MAX) {
    carried = carried.concat(patches[lying].color);
    patches = patches.filter((p, i) => i !== lying);
    events.push('pickup');
  }

  // 8. Merge on a pad.
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  if (tileAt(state, player.x, player.y) === 'M' && carried.length > 0) {
    const n = carried.length;
    score += PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) score += SAME_COLOR_BONUS * n;
    merges += n;
    carried = [];
    events.push('merge');
    if (!open && merges >= state.level.quorum) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. Exit: ship the level. Ends the step here, before drifts move.
  if (open && tileAt(state, player.x, player.y) === 'X') {
    score += Math.max(0, state.level.par - (state.levelTicks + 1)) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      const fresh = loadLevel(state.levels, state.levelIndex + 1, seed);
      return {
        ...state,
        seed: fresh.seed,
        score,
        tick: state.tick + 1,
        levelTicks: 0,
        levelIndex: state.levelIndex + 1,
        level: fresh.level,
        player: fresh.player,
        patches: fresh.patches,
        drifts: fresh.drifts,
        carried: [],
        conflicts: [],
        merges: 0,
        open: false,
        invuln: 0,
        events: events.concat('level'),
      };
    }
    return {
      ...state,
      seed,
      score,
      tick: state.tick + 1,
      levelTicks: state.levelTicks + 1,
      player,
      status: 'won',
      open: true,
      events: events.concat('won'),
    };
  }

  // 10. Drifts march on their ticks: their own direction first, then the
  // next ones clockwise, and into the first cell that will have them.
  const driftTick = (state.tick + 1) % state.level.driftPeriod === 0;
  const driftsPre = state.drifts.map((d) => ({ x: d.x, y: d.y }));
  let drifts = state.drifts;
  if (driftTick) {
    drifts = state.drifts.map((d) => {
      const from = CLOCKWISE.indexOf(d.dir) >= 0 ? CLOCKWISE.indexOf(d.dir) : 0;
      for (let i = 0; i < 4; i++) {
        const dir2 = CLOCKWISE[(from + i) % 4];
        const tx = d.x + DIRS[dir2][0];
        const ty = d.y + DIRS[dir2][1];
        if (driftSeesTile(tileAt(state, tx, ty)) && !conflictOn(conflicts, tx, ty)) {
          return { x: tx, y: ty, dir: dir2 };
        }
      }
      return { x: d.x, y: d.y, dir: d.dir };
    });

    // 11. Two or more drifts on one cell leave a conflict and turn back.
    for (let cy = 0; cy < state.level.height; cy++) {
      for (let cx = 0; cx < state.level.width; cx++) {
        const here = drifts.filter((d) => d.x === cx && d.y === cy);
        if (here.length >= 2) {
          for (const d of here) d.dir = REVERSE[d.dir];
          if (!conflictOn(conflicts, cx, cy)) conflicts.push({ x: cx, y: cy, ttl: CONFLICT_TICKS });
          events.push('conflict');
        }
      }
    }
  }

  // 12. Hits: a drift underfoot, or one that swapped cells with the
  // player on the way through.
  let lives = state.lives;
  let invuln = state.invuln;
  let status = 'playing';
  if (invuln > 0) {
    invuln -= 1;
  } else {
    const underfoot = drifts.some((d) => d.x === player.x && d.y === player.y);
    const swapped = drifts.some(
      (d, i) =>
        d.x === playerWas.x && d.y === playerWas.y &&
        driftsPre[i].x === player.x && driftsPre[i].y === player.y,
    );
    if (underfoot || swapped) {
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
          player = { x: state.level.start.x, y: state.level.start.y };
          invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns: every spawnEvery level ticks one missing patch returns.
  if (
    status === 'playing' &&
    (state.levelTicks + 1) % state.level.spawnEvery === 0 &&
    patches.length + carried.length < state.level.spawns.length
  ) {
    const free = state.level.spawns.filter(
      (s) =>
        !patches.some((p) => p.x === s.x && p.y === s.y) &&
        !(s.x === player.x && s.y === player.y) &&
        !drifts.some((d) => d.x === s.x && d.y === s.y),
    );
    if (free.length > 0) {
      const spot = rngInt(seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      seed = color.seed;
      patches = patches.concat({ x: free[spot.value].x, y: free[spot.value].y, color: color.value });
      events.push('spawn');
    }
  }

  return {
    ...state,
    seed,
    tick: state.tick + 1,
    levelTicks: state.levelTicks + 1,
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
    events,
  };
}
