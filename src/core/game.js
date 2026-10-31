// Quorum Run's rules (DESIGN.md §5 to §7): the state, one step of play,
// and the terrain lookup. `step` never changes the state it is given: every
// array and object it touches is copied before it is changed. Randomness
// comes only from the state's seed through the PRNG of §3.

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
import { parseLevel } from './level.js';
import { rngInt } from './rng.js';
import { LEVELS } from '../data/levels.js';

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// Load a level (§5): parse its definition, draw fresh patch colours, copy
// the drifts, and reset every per-level field. Keeps score, lives, tick,
// and the PRNG state.
function loadLevel(state) {
  const def = state.levels[state.levelIndex];
  const level = parseLevel(def);
  let seed = state.seed;
  const patches = level.spawns.map((spawn) => {
    const draw = rngInt(seed, COLORS);
    seed = draw.seed;
    return { x: spawn.x, y: spawn.y, color: draw.value };
  });
  return {
    ...state,
    seed,
    level,
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

export function init(seed, options) {
  const opts = options ?? {};
  const start = {
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    levels: opts.levels ?? LEVELS,
    levelIndex: opts.level ?? 0,
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
  return { ...loadLevel(start) };
}

// The level's terrain character at a cell ('#', '.', 'M', 'X', or 'H'),
// and '#' outside the map.
export function tileAt(state, x, y) {
  const tiles = state.level.tiles;
  if (y < 0 || y >= tiles.length || x < 0 || x >= tiles[y].length) return '#';
  return tiles[y][x];
}

// The next state after one step of play with the given input. `input` is
// { move, pause }; a missing input, or a missing field, means no move and
// no pause.
export function step(state, input) {
  // 1. A game that is over only clears its events.
  if (state.status !== 'playing') return { ...state, events: [] };

  const pause = Boolean(input && input.pause);
  const move = input && DIRS[input.move] ? input.move : null;

  // 2. A pause input flips `paused` and ends the step; nothing ticks.
  if (pause) {
    return {
      ...state,
      paused: !state.paused,
      events: [state.paused ? 'resume' : 'pause'],
    };
  }

  // 3. While paused nothing changes and no tick passes.
  if (state.paused) return { ...state, events: [] };

  // 4. The tick counters grow; the rest is copied for per-step work.
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;
  const level = state.level;
  let seed = state.seed;
  let player = { x: state.player.x, y: state.player.y };
  const playerOld = player;
  let carried = state.carried.slice();
  let patches = state.patches.map((p) => ({ ...p }));
  let conflicts = state.conflicts.map((c) => ({ ...c }));
  let drifts = state.drifts.map((d) => ({ ...d }));
  const driftsBefore = drifts.map((d) => ({ x: d.x, y: d.y }));
  let score = state.score;
  let lives = state.lives;
  let merges = state.merges;
  let open = state.open;
  let invuln = state.invuln;
  let status = state.status;
  const events = [];

  const conflictOn = (x, y) => conflicts.some((c) => c.x === x && c.y === y);

  // 5. Conflicts age; the ones at 0 go.
  conflicts = conflicts
    .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. The player moves one cell when the target is passable to them.
  if (move) {
    const [dx, dy] = DIRS[move];
    const nx = player.x + dx;
    const ny = player.y + dy;
    const terrain = tileAt(state, nx, ny);
    const blocked =
      terrain === '#' ||
      ((terrain === 'H' || terrain === 'X') && !open) ||
      conflictOn(nx, ny);
    if (!blocked) player = { x: nx, y: ny };
  }

  // 7. Pickup: one patch on the player's cell when there is room.
  const patchIndex = patches.findIndex((p) => p.x === player.x && p.y === player.y);
  if (patchIndex >= 0 && carried.length < CARRY_MAX) {
    carried.push(patches[patchIndex].color);
    patches.splice(patchIndex, 1);
    events.push('pickup');
  }

  // 8. Merge: on a merge pad with patches carried.
  if (tileAt(state, player.x, player.y) === 'M' && carried.length > 0) {
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

  // 9. Exit: on the open exit the level ships; the step ends here, before
  // the drifts move.
  if (open && tileAt(state, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    const next = state.levelIndex + 1;
    const base = {
      seed,
      tick,
      score,
      lives,
      status: 'playing',
    };
    if (next < state.levels.length) {
      const loaded = loadLevel({ ...state, ...base, levelIndex: next, player });
      return { ...loaded, events: [...events, 'level'] };
    }
    return {
      ...state,
      ...base,
      player,
      carried,
      patches,
      drifts,
      conflicts,
      merges,
      open,
      invuln,
      levelTicks,
      status: 'won',
      events: [...events, 'won'],
    };
  }

  // 10. On ticks this step's number is a multiple of the drift period, the
  // drifts move; each tries its direction first, then clockwise.
  let driftsMoved = false;
  if (tick % level.driftPeriod === 0) {
    driftsMoved = true;
    for (const drift of drifts) {
      const first = CLOCKWISE.indexOf(drift.dir);
      for (let i = 0; i < CLOCKWISE.length; i++) {
        const dir = CLOCKWISE[(first + i) % CLOCKWISE.length];
        const [dx, dy] = DIRS[dir];
        const nx = drift.x + dx;
        const ny = drift.y + dy;
        const terrain = tileAt(state, nx, ny);
        if (
          terrain !== '#' &&
          terrain !== 'H' &&
          terrain !== 'X' &&
          !conflictOn(nx, ny)
        ) {
          drift.dir = dir;
          drift.x = nx;
          drift.y = ny;
          break;
        }
      }
    }
  }

  // 11. Only on a tick when the drifts moved, cells holding two or more
  // drifts (in reading order) leave a conflict and reverse every drift on
  // them.
  if (driftsMoved) {
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const stack = drifts.filter((d) => d.x === x && d.y === y);
        if (stack.length < 2) continue;
        for (const drift of stack) drift.dir = OPPOSITE[drift.dir];
        if (!conflictOn(x, y)) conflicts.push({ x, y, ttl: CONFLICT_TICKS });
        events.push('conflict');
      }
    }
  }

  // 12. Hits: while invulnerable nothing hits. Empty-handed, a hit costs a
  // life; carrying, it drops the patches instead.
  if (invuln > 0) {
    invuln -= 1;
  } else {
    let hit = drifts.some((d) => d.x === player.x && d.y === player.y);
    if (!hit && driftsMoved) {
      hit = drifts.some(
        (d, i) =>
          d.x === playerOld.x &&
          d.y === playerOld.y &&
          driftsBefore[i].x === player.x &&
          driftsBefore[i].y === player.y
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

  // 13. Spawns: one patch may enter on a tick this step's level-tick count
  // is a multiple of the level's spawn period.
  if (
    status === 'playing' &&
    levelTicks % level.spawnEvery === 0 &&
    patches.length + carried.length < level.spawns.length
  ) {
    const free = level.spawns.filter(
      (s) =>
        !patches.some((p) => p.x === s.x && p.y === s.y) &&
        !(player.x === s.x && player.y === s.y) &&
        !drifts.some((d) => d.x === s.x && d.y === s.y)
    );
    if (free.length > 0) {
      const spot = rngInt(seed, free.length);
      seed = spot.seed;
      const color = rngInt(seed, COLORS);
      seed = color.seed;
      patches.push({ x: free[spot.value].x, y: free[spot.value].y, color: color.value });
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
