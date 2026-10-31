// Quorum Run's rules (DESIGN.md §5, §6, §7): the state at init, one step
// of the game, and the terrain lookup. The core is pure: a step never
// changes the state it is given, and every random draw runs through the
// state's seed.

import {
  CARRY_MAX,
  CLOCKWISE,
  COLORS,
  CONFLICT_TICKS,
  DIRS,
  INVULN_TICKS,
  PATCH_BASE,
  SAME_COLOR_BONUS,
  START_LIVES,
  TIME_BONUS_PER_TICK,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

// A drift hit head-on turns around.
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

const at = (x, y) => `${x},${y}`;

function sameCell(a, x, y) {
  return a.x === x && a.y === y;
}

// The terrain character at a cell, or '#' outside the map.
function terrain(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined) return '#';
  return row[x] ?? '#';
}

function conflictAt(conflicts, x, y) {
  return conflicts.some((c) => c.x === x && c.y === y);
}

function driftBlocked(tile) {
  return tile === '#' || tile === 'H' || tile === 'X';
}

// Draws one patch colour per spawn point, in reading order.
function drawPatches(spawns, seed0) {
  let seed = seed0;
  const patches = spawns.map((sp) => {
    const draw = rngInt(seed, COLORS);
    seed = draw.seed;
    return { x: sp.x, y: sp.y, color: draw.value };
  });
  return { patches, seed };
}

// Loads a level: everything per level is set fresh; score, lives, tick,
// and the PRNG state (continued by the fresh colour draws) ride along in
// `base`.
function loadLevel(base, def, index) {
  if (def === undefined) throw new Error('invalid level');
  const level = parseLevel(def);
  const { patches, seed } = drawPatches(level.spawns, base.seed);
  return {
    ...base,
    seed,
    levelIndex: index,
    level,
    player: { x: level.start.x, y: level.start.y },
    carried: [],
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
  };
}

export function init(seed, options) {
  const opts = options ?? {};
  const levels = opts.levels ?? LEVELS;
  const levelIndex = opts.level ?? 0;
  return loadLevel(
    {
      seed: seed >>> 0,
      tick: 0,
      levelTicks: 0,
      levels,
      levelIndex,
      score: 0,
      lives: START_LIVES,
      status: 'playing',
      paused: false,
      events: [],
    },
    levels[levelIndex],
    levelIndex,
  );
}

export function tileAt(state, x, y) {
  return terrain(state.level, x, y);
}

export function step(state, input) {
  // A missing or null input, or a missing field, means no move and no pause.
  const request = input ?? null;
  const move = request !== null && DIRS[request.move] ? request.move : null;
  const pause = request !== null && request.pause === true;

  // 1. A game that is over no longer changes.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. Pausing flips the flag and touches nothing else.
  if (pause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // 3. A paused game ignores moves and ticks.
  if (state.paused) return { ...state, events: [] };

  // 4. The step counts.
  const tick = state.tick + 1;
  const events = [];

  // 5. Conflicts age, and those at 0 go.
  let conflicts = [];
  for (const c of state.conflicts) {
    if (c.ttl - 1 > 0) conflicts.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }

  // 6. The player moves one cell when the target is passable.
  const level = state.level;
  let player = state.player;
  if (move !== null) {
    const [dx, dy] = DIRS[move];
    const tx = player.x + dx;
    const ty = player.y + dy;
    const tile = terrain(level, tx, ty);
    const wall = tile === '#' || ((tile === 'H' || tile === 'X') && !state.open);
    if (!wall && !conflictAt(conflicts, tx, ty)) player = { x: tx, y: ty };
  }

  // 7. A patch under the player is picked up, up to CARRY_MAX.
  let patches = state.patches;
  let carried = state.carried;
  const under = patches.findIndex((p) => p.x === player.x && p.y === player.y);
  if (under !== -1 && carried.length < CARRY_MAX) {
    const colour = patches[under].color;
    patches = patches.slice(0, under).concat(patches.slice(under + 1));
    carried = carried.concat([colour]);
    events.push('pickup');
  }

  // 8. Merging on a pad scores the patches and empties the hands.
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  if (terrain(level, player.x, player.y) === 'M' && carried.length > 0) {
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

  // 9. An open exit ships the level: the next one loads, or the game is won.
  if (open && terrain(level, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - (state.levelTicks + 1)) * TIME_BONUS_PER_TICK;
    const next = state.levelIndex + 1;
    if (next < state.levels.length) {
      events.push('level');
      return loadLevel(
        { ...state, tick, score, events: events.slice() },
        state.levels[next],
        next,
      );
    }
    events.push('won');
    return {
      ...state,
      tick,
      player,
      carried: [],
      patches,
      conflicts,
      score,
      merges,
      open,
      levelTicks: state.levelTicks + 1,
      status: 'won',
      events,
    };
  }

  // 10. The drifts patrol on their period's ticks, turning clockwise when
  // blocked, ignoring the player, patches, and each other.
  const before = state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  let drifts = state.drifts;
  let movedDrifts = false;
  if (tick % level.driftPeriod === 0) {
    movedDrifts = true;
    drifts = state.drifts.map((d) => {
      const start = Math.max(0, CLOCKWISE.indexOf(d.dir));
      for (let turn = 0; turn < CLOCKWISE.length; turn++) {
        const dir = CLOCKWISE[(start + turn) % CLOCKWISE.length];
        const [dx, dy] = DIRS[dir];
        const nx = d.x + dx;
        const ny = d.y + dy;
        if (!driftBlocked(terrain(level, nx, ny)) && !conflictAt(conflicts, nx, ny)) {
          return { x: nx, y: ny, dir };
        }
      }
      return { x: d.x, y: d.y, dir: d.dir };
    });
  }

  // 11. Cells where two or more drifts ended up reverse every drift there
  // and leave a conflict, in reading order.
  if (movedDrifts) {
    const byCell = new Map();
    drifts.forEach((d, i) => {
      const k = at(d.x, d.y);
      if (!byCell.has(k)) byCell.set(k, []);
      byCell.get(k).push(i);
    });
    const cells = [...byCell.entries()].filter(([, idxs]) => idxs.length >= 2);
    cells.sort((a, b) => {
      const [ax, ay] = a[0].split(',').map(Number);
      const [bx, by] = b[0].split(',').map(Number);
      return ay - by || ax - bx;
    });
    for (const [k, idxs] of cells) {
      const [cx, cy] = k.split(',').map(Number);
      for (const i of idxs) {
        drifts[i] = { x: drifts[i].x, y: drifts[i].y, dir: OPPOSITE[drifts[i].dir] ?? drifts[i].dir };
      }
      if (!conflictAt(conflicts, cx, cy)) {
        conflicts = conflicts.concat([{ x: cx, y: cy, ttl: CONFLICT_TICKS }]);
      }
      events.push('conflict');
    }
  }

  // 12. A hit costs the carried patches, or a life, unless immune.
  const prevPlayer = state.player;
  let invuln = state.invuln;
  let lives = state.lives;
  let status = state.status;
  if (invuln > 0) {
    invuln -= 1;
  } else {
    const onPlayer = drifts.some((d) => d.x === player.x && d.y === player.y);
    const swapped = movedDrifts && before.some((d0, i) => {
      const dNow = drifts[i];
      return d0.x === player.x && d0.y === player.y && dNow.x === prevPlayer.x && dNow.y === prevPlayer.y;
    });
    if (onPlayer || swapped) {
      if (carried.length > 0) {
        carried = []; // dropped patches are gone, not put back
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

  // 13. One patch per spawn period, on a free spawn point drawn from the seed.
  let seed = state.seed;
  if (status === 'playing' && (state.levelTicks + 1) % level.spawnEvery === 0
    && patches.length + carried.length < level.spawns.length) {
    const taken = new Set(patches.map((p) => at(p.x, p.y)));
    const driftCells = new Set(drifts.map((d) => at(d.x, d.y)));
    const free = level.spawns.filter((sp) =>
      !taken.has(at(sp.x, sp.y)) && !driftCells.has(at(sp.x, sp.y)) && !sameCell(player, sp.x, sp.y));
    if (free.length > 0) {
      const spot = rngInt(seed, free.length);
      const colour = rngInt(spot.seed, COLORS);
      seed = colour.seed;
      patches = patches.concat([{ x: free[spot.value].x, y: free[spot.value].y, color: colour.value }]);
      events.push('spawn');
    }
  }

  return {
    ...state,
    seed,
    tick,
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
