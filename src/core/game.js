// Quorum Run: the rules (DESIGN.md §5 to §7).
// Pure: init, step, and tileAt never change their arguments, never touch
// the DOM, and draw randomness only from the state's seed (§3).

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK,
  COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';

// The shipped levels (§10). Loaded leniently so the game still runs while
// src/data/levels.js is not on the disk; everything until then passes its
// own levels, and init falls back to an empty list rather than failing to
// load.
let DEFAULT_LEVELS = [];
try {
  const data = await import('../data/levels.js');
  if (Array.isArray(data.LEVELS)) DEFAULT_LEVELS = data.LEVELS;
} catch {
  DEFAULT_LEVELS = [];
}

// A drift's directions, tried own direction first, then clockwise (§6.10).
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The terrain character of a tiles row, '#' outside the map.
function tileChar(tiles, x, y) {
  if (y < 0 || y >= tiles.length) return '#';
  const row = tiles[y];
  if (x < 0 || x >= row.length) return '#';
  return row[x];
}

// Cells a player may enter: no wall, no hold or closed exit, no conflict.
// The player may walk onto a drift's cell (§6.12 decides the hit).
function passableForPlayer(tiles, conflicts, open, x, y) {
  const ch = tileChar(tiles, x, y);
  if (ch === '#') return false;
  if ((ch === 'H' || ch === 'X') && !open) return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// Cells a drift may enter: no wall, never a hold nor the exit, and no
// conflict. The player, patches, and other drifts do not block (§6.10).
function passableForDrift(tiles, conflicts, x, y) {
  const ch = tileChar(tiles, x, y);
  if (ch === '#' || ch === 'H' || ch === 'X') return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// Load a level (§5): the parsed level, one patch per spawn point with
// fresh colour draws in reading order, copies of its drifts, and the
// player at the start. Keeps the seed running through the draws.
function loadLevel(def, seedIn) {
  const level = parseLevel(def);
  const patches = [];
  let seed = seedIn;
  for (const sp of level.spawns) {
    const r = rngInt(seed, COLORS);
    seed = r.seed;
    patches.push({ x: sp.x, y: sp.y, color: r.value });
  }
  return {
    level,
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    player: { x: level.start.x, y: level.start.y },
    seed,
  };
}

// init(seed, options) returns the first state (§5).
export function init(seed, options) {
  const opts = options ?? {};
  const levels = opts.levels ?? DEFAULT_LEVELS;
  const levelIndex = opts.level ?? 0;
  const { level, patches, drifts, player, seed: nextSeed } =
    loadLevel(levels[levelIndex], seed >>> 0);
  return {
    seed: nextSeed,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level,
    player,
    carried: [],
    patches,
    drifts,
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

// tileAt(state, x, y) reads the level's terrain (§5).
export function tileAt(state, x, y) {
  return tileChar(state.level.tiles, x, y);
}

// step(state, input) returns the next state and changes nothing (§6).
export function step(state, input) {
  // A missing or null input, or a missing field, means no move and no pause.
  const given = input ?? {};
  const move = given.move ?? null;

  // 1. A game that is over no longer changes.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause flips paused and nothing else happens. Pause wins over a
  //    move, so a step with both is only a pause.
  if (given.pause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }
  // 3. While paused, nothing moves and no tick passes.
  if (state.paused) return { ...state, events: [] };

  const level = state.level;
  const events = [];
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;
  let seed = state.seed;

  // 5. Conflicts age by one and the ones at 0 go.
  let conflicts = [];
  for (const c of state.conflicts) {
    if (c.ttl > 1) conflicts.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }

  // 6. The player moves one cell when the target is passable.
  const oldPlayer = state.player;
  let player = oldPlayer;
  const to = move ? DIRS[move] : undefined;
  if (to) {
    const nx = oldPlayer.x + to[0];
    const ny = oldPlayer.y + to[1];
    if (passableForPlayer(level.tiles, conflicts, state.open, nx, ny)) {
      player = { x: nx, y: ny };
    }
  }

  // 7. Pickup: a patch on the player's cell (even without a move) while
  //    there is room for it.
  let carried = state.carried;
  let patches = state.patches;
  const found = patches.findIndex((p) => p.x === player.x && p.y === player.y);
  if (found !== -1 && carried.length < CARRY_MAX) {
    carried = [...carried, patches[found].color];
    patches = patches.filter((_, i) => i !== found);
    events.push('pickup');
  }

  // 8. Merge on a merge pad with patches in hand.
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  if (tileChar(level.tiles, player.x, player.y) === 'M' && carried.length > 0) {
    const n = carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && carried.every((color) => color === carried[0])) {
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

  // 9. The exit ends the step; drifts do not move this step.
  if (open && tileChar(level.tiles, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    const nextIndex = state.levelIndex + 1;
    if (nextIndex < state.levels.length) {
      // Another level follows: load it, keeping score, lives, tick, and
      // the PRNG state.
      const next = loadLevel(state.levels[nextIndex], seed);
      return {
        ...state,
        score,
        seed: next.seed,
        tick,
        levelIndex: nextIndex,
        level: next.level,
        player: next.player,
        carried: [],
        patches: next.patches,
        drifts: next.drifts,
        conflicts: [],
        merges: 0,
        open: false,
        invuln: 0,
        levelTicks: 0,
        paused: false,
        events: ['level'],
      };
    }
    events.push('won');
    return {
      ...state,
      tick,
      levelTicks,
      player,
      carried,
      patches,
      conflicts,
      score,
      merges,
      open,
      status: 'won',
      events: [...events],
    };
  }

  // 10. Drifts move on ticks their period divides, each in array order,
  //     trying its direction first, then clockwise, up to four.
  const driftsMoved = tick % level.driftPeriod === 0;
  let drifts = state.drifts;
  let from = null;
  if (driftsMoved) {
    from = drifts.map((d) => ({ x: d.x, y: d.y }));
    drifts = drifts.map((drift) => {
      const startAt = CLOCKWISE.indexOf(drift.dir);
      for (let i = 0; i < 4; i++) {
        const dir = CLOCKWISE[(startAt + i) % 4];
        const nx = drift.x + DIRS[dir][0];
        const ny = drift.y + DIRS[dir][1];
        if (passableForDrift(level.tiles, conflicts, nx, ny)) {
          return { x: nx, y: ny, dir };
        }
      }
      return { x: drift.x, y: drift.y, dir: drift.dir };
    });
  }

  // 11. Collisions, only on a tick when drifts moved: each cell, in
  //     reading order, holding two or more drifts reverses them, adds at
  //     most one conflict, and one event.
  if (driftsMoved && drifts.length > 0) {
    const byCell = new Map();
    for (let i = 0; i < drifts.length; i++) {
      const d = drifts[i];
      const key = `${d.x},${d.y}`;
      const list = byCell.get(key);
      if (list) list.push(i);
      else byCell.set(key, [i]);
    }
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const list = byCell.get(`${x},${y}`);
        if (!list || list.length < 2) continue;
        drifts = drifts.map((d, i) =>
          list.includes(i) ? { ...d, dir: OPPOSITE[d.dir] } : d);
        if (!conflicts.some((c) => c.x === x && c.y === y)) {
          conflicts = [...conflicts, { x, y, ttl: CONFLICT_TICKS }];
        }
        events.push('conflict');
      }
    }
  }

  // 12. Hits: spent invuln ticks down and blocks; otherwise a drift on
  //     the player's cell, or one that swapped cells with the player's
  //     move, hits once.
  let lives = state.lives;
  let invuln = state.invuln;
  let status = state.status;
  if (invuln > 0) {
    invuln -= 1;
  } else {
    let hit = false;
    for (let i = 0; i < drifts.length && !hit; i++) {
      const d = drifts[i];
      if (d.x === player.x && d.y === player.y) {
        hit = true;
      } else if (from !== null &&
        d.x === oldPlayer.x && d.y === oldPlayer.y &&
        from[i].x === player.x && from[i].y === player.y) {
        hit = true;
      }
    }
    if (hit) {
      if (carried.length > 0) {
        // Carrying, a hit drops the carried patches where the player is.
        carried = [];
        invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        lives -= 1;
        events.push('hit');
        if (lives === 0) {
          status = 'lost';
          events.push('lost');
        } else {
          player = { x: level.start.x, y: level.start.y };
          invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns: one patch, on a free spawn point the seed picks.
  if (status === 'playing' &&
    levelTicks % level.spawnEvery === 0 &&
    patches.length + carried.length < level.spawns.length) {
    const free = [];
    for (const sp of level.spawns) {
      if (patches.some((p) => p.x === sp.x && p.y === sp.y)) continue;
      if (sp.x === player.x && sp.y === player.y) continue;
      if (drifts.some((d) => d.x === sp.x && d.y === sp.y)) continue;
      free.push(sp);
    }
    if (free.length > 0) {
      const at = rngInt(seed, free.length);
      seed = at.seed;
      const spot = free[at.value];
      const color = rngInt(seed, COLORS);
      seed = color.seed;
      patches = [...patches, { x: spot.x, y: spot.y, color: color.value }];
      events.push('spawn');
    }
  }

  return {
    ...state,
    seed,
    tick,
    levelTicks,
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
