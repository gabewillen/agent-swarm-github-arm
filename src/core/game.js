// Quorum Run — the rules (DESIGN.md §5 to §7). Pure: no DOM, no
// Math.random; every random draw comes from the state's seed via rngInt.
// step() never changes the state or anything inside it; every state it
// returns is plain JSON data.
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

// The shipped levels are init's default for options.levels. They are
// imported lazily (with a fallback) so the core keeps loading before
// src/data/levels.js has landed; init(seed, { levels }) is unaffected.
let LEVELS = [];
try {
  ({ LEVELS } = await import('../data/levels.js'));
} catch {
  // src/data/levels.js is not there yet; the default stays empty until it
  // is merged. Every caller that passes its own options.levels is unaffected.
}

const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The terrain tile of the current level at a cell; '#' off the map.
function tileOf(level, x, y) {
  if (x < 0 || y < 0 || y >= level.height || x >= level.width) return '#';
  return level.tiles[y][x];
}

// A conflict sitting on a cell?
function conflictedAt(conflicts, x, y) {
  return conflicts.some((c) => c.x === x && c.y === y);
}

// Build the state of entering a level: at init and on reaching an open
// exit (§5). Keeps score, lives, tick, and the PRNG state; resets the rest.
function enterLevel(def, levelIndex, seed, keep) {
  const level = parseLevel(def);
  let s = seed >>> 0;
  const patches = [];
  for (const sp of level.spawns) {
    const r = rngInt(s, COLORS);
    patches.push({ x: sp.x, y: sp.y, color: r.value });
    s = r.seed;
  }
  return {
    seed: s,
    tick: keep.tick,
    levelTicks: 0,
    levels: keep.levels,
    levelIndex,
    level,
    player: { x: level.start.x, y: level.start.y },
    carried: [],
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    conflicts: [],
    score: keep.score,
    lives: keep.lives,
    merges: 0,
    open: false,
    invuln: 0,
    status: 'playing',
    paused: false,
    events: [],
  };
}

// init(seed, options) returns the first state (§5).
export function init(seed, options = {}) {
  const levels = options.levels ?? LEVELS;
  const levelIndex = options.level ?? 0;
  return enterLevel(levels[levelIndex], levelIndex, seed, {
    levels,
    tick: 0,
    score: 0,
    lives: START_LIVES,
  });
}

// tileAt(state, x, y) reads the level's terrain ('#', '.', 'M', 'X', 'H'),
// and '#' outside the map.
export function tileAt(state, x, y) {
  return tileOf(state.level, x, y);
}

// step(state, input) returns the next state, in the order of §6.
export function step(state, input) {
  const inp = input && typeof input === 'object' ? input : null;
  const move = inp && typeof inp.move === 'string' ? inp.move : null;
  const pause = !!(inp && inp.pause === true);

  // 1. A finished game no longer changes.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. Pause flips paused and nothing else changes.
  if (pause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }

  // 3. A paused game does nothing.
  if (state.paused) return { ...state, events: [] };

  // 4. The clock moves and events start empty.
  const events = [];
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;

  // 5. Conflicts age.
  const conflicts = state.conflicts
    .map((c) => ({ ...c, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // Everything the steps from 6 on may rewrite, as a fresh object/array.
  const next = {
    ...state,
    tick,
    levelTicks,
    conflicts,
    player: { ...state.player },
    carried: state.carried.slice(),
    patches: state.patches.slice(),
    events,
  };

  // 6. The player moves when the target is passable to a player.
  const prevPlayer = { x: state.player.x, y: state.player.y };
  if (move && DIRS[move]) {
    const [dx, dy] = DIRS[move];
    const nx = next.player.x + dx;
    const ny = next.player.y + dy;
    const tile = tileOf(state.level, nx, ny);
    const door = tile === 'H' || tile === 'X';
    if (
      tile !== '#' &&
      (!door || next.open) &&
      !conflictedAt(conflicts, nx, ny)
    ) {
      next.player = { x: nx, y: ny };
    }
  }

  // 7. Pickup.
  const pi = next.patches.findIndex((p) => p.x === next.player.x && p.y === next.player.y);
  if (pi !== -1 && next.carried.length < CARRY_MAX) {
    const [patch] = next.patches.splice(pi, 1);
    next.carried.push(patch.color);
    events.push('pickup');
  }

  // 8. Merge.
  if (tileOf(state.level, next.player.x, next.player.y) === 'M' && next.carried.length > 0) {
    const n = next.carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && next.carried.every((c) => c === next.carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    next.score += gain;
    next.merges += n;
    next.carried = [];
    events.push('merge');
    if (!next.open && next.merges >= state.level.quorum) {
      next.open = true;
      events.push('quorum');
    }
  }

  // 9. Exit: ship the level or win the game, and end the step here.
  if (next.open && tileOf(state.level, next.player.x, next.player.y) === 'X') {
    next.score += Math.max(0, state.level.par - levelTicks) * TIME_BONUS_PER_TICK;
    const nextIndex = state.levelIndex + 1;
    if (nextIndex < state.levels.length) {
      const loaded = enterLevel(state.levels[nextIndex], nextIndex, next.seed, {
        levels: state.levels,
        tick,
        score: next.score,
        lives: state.lives,
      });
      loaded.events = events.concat(['level']);
      return loaded;
    }
    next.status = 'won';
    next.events = events.concat(['won']);
    return next;
  }

  // 10. Drifts move on their period.
  const driftsMoved = tick % state.level.driftPeriod === 0;
  if (driftsMoved) {
    next.drifts = state.drifts.map((d) => {
      const start = CLOCKWISE.indexOf(d.dir);
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(start + k) % 4];
        const [dx, dy] = DIRS[dir];
        const nx = d.x + dx;
        const ny = d.y + dy;
        const tile = tileOf(state.level, nx, ny);
        if (tile !== '#' && tile !== 'H' && tile !== 'X' && !conflictedAt(conflicts, nx, ny)) {
          return { x: nx, y: ny, dir };
        }
      }
      return { x: d.x, y: d.y, dir: d.dir };
    });

    // 11. Two or more drifts on one cell: reverse each, mark a conflict.
    const cells = [];
    for (let i = 0; i < next.drifts.length; i++) {
      for (let j = i + 1; j < next.drifts.length; j++) {
        const a = next.drifts[i];
        const b = next.drifts[j];
        if (a.x === b.x && a.y === b.y && !cells.some((c) => c.x === a.x && c.y === a.y)) {
          cells.push({ x: a.x, y: a.y });
        }
      }
    }
    cells.sort((a, b) => a.y - b.y || a.x - b.x); // reading order
    for (const cell of cells) {
      for (const d of next.drifts) {
        if (d.x === cell.x && d.y === cell.y) d.dir = REVERSE[d.dir];
      }
      events.push('conflict');
      if (!conflictedAt(next.conflicts, cell.x, cell.y)) {
        next.conflicts = next.conflicts.concat({ x: cell.x, y: cell.y, ttl: CONFLICT_TICKS });
      }
    }
  }

  // 12. Hits, while invulnerable none. Reading the drifts that moved.
  if (next.invuln > 0) {
    next.invuln -= 1;
  } else {
    const onPlayer = next.drifts.some((d) => d.x === next.player.x && d.y === next.player.y);
    const swapped =
      driftsMoved &&
      state.drifts.some((d, i) => {
        const nd = next.drifts[i];
        return (
          nd.x === prevPlayer.x &&
          nd.y === prevPlayer.y &&
          d.x === next.player.x &&
          d.y === next.player.y
        );
      });
    if (onPlayer || swapped) {
      if (next.carried.length > 0) {
        next.carried = [];
        next.invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        next.lives -= 1;
        events.push('hit');
        if (next.lives <= 0) {
          next.status = 'lost';
          events.push('lost');
        } else {
          next.player = { x: state.level.start.x, y: state.level.start.y };
          next.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns.
  if (next.status === 'playing' && levelTicks % state.level.spawnEvery === 0) {
    const spots = state.level.spawns;
    if (next.patches.length + next.carried.length < spots.length) {
      const taken = new Set(next.patches.map((p) => p.x + ':' + p.y));
      const held = new Set(next.drifts.map((d) => d.x + ':' + d.y));
      const free = spots.filter(
        (sp) =>
          !taken.has(sp.x + ':' + sp.y) &&
          !held.has(sp.x + ':' + sp.y) &&
          !(sp.x === next.player.x && sp.y === next.player.y),
      );
      if (free.length > 0) {
        const a = rngInt(next.seed, free.length);
        const b = rngInt(a.seed, COLORS);
        const sp = free[a.value];
        next.patches = next.patches.concat({ x: sp.x, y: sp.y, color: b.value });
        next.seed = b.seed;
        events.push('spawn');
      }
    }
  }

  return next;
}
