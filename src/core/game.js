// Soil helpers for the drift half of the step (§6 steps 10 to 13).

// §6 step 10: a drift's first passable direction, its own first and then
// clockwise. A direction is passable to a drift when its target is not a
// wall, not a hold, not the exit (open or not), and has no conflict on it.
function driftTurn(drift, state, tile, conflicts) {
  const from = CLOCKWISE.indexOf(drift.dir);
  for (let i = 0; i < CLOCKWISE.length; i++) {
    const dir = CLOCKWISE[(from + i) % CLOCKWISE.length];
    const [dx, dy] = DIRS[dir];
    const x = drift.x + dx;
    const y = drift.y + dy;
    const t = tile(x, y);
    if (t === '#') continue;
    if (t === 'H' || t === 'X') continue;
    if (conflictAt(conflicts, x, y)) continue;
    return { x, y, dir };
  }
  return drift; // boxed in: it stays and keeps its direction
}

// §6 step 11: the cells holding two or more drifts, in reading order.
function collisionCells(drifts) {
  const byCell = new Map();
  for (const d of drifts) {
    const key = d.x + ',' + d.y;
    const cell = byCell.get(key) ?? { x: d.x, y: d.y, drifts: [] };
    cell.drifts.push(d);
    byCell.set(key, cell);
  }
  return [...byCell.values()].filter((c) => c.drifts.length >= 2)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x)) // reading order
    .map((c) => ({ x: c.x, y: c.y }));
}

// §6 step 11: reversing a drift, up and down and left and right swap.
function reversed(dir) {
  return CLOCKWISE[(CLOCKWISE.indexOf(dir) + 2) % CLOCKWISE.length];
}

// §6 steps 10 to 12 on the draft in place: drifts move (only on a tick
// when they move), collisions form, and hits land. Returns nothing; the
// caller's draft carries the new drifts, conflicts, and events.
function driftsAndHits(draft, state, before) {
  // 10. Drifts move when this step's tick divides by the drift period.
  const moved = draft.tick % state.level.driftPeriod === 0;
  const terrainAt = (x, y) => tileAt(state, x, y);
  if (moved) {
    draft.drifts = state.drifts.map((d) => driftTurn(d, state, terrainAt, draft.conflicts));

    // 11. Collisions, in reading order: every drift on a shared cell
    // reverses; a conflict sits on the cell unless one is already there;
    // one event per cell either way.
    for (const c of collisionCells(draft.drifts)) {
      for (const d of draft.drifts) {
        if (d.x === c.x && d.y === c.y) d.dir = reversed(d.dir);
      }
      if (!conflictAt(draft.conflicts, c.x, c.y)) draft.conflicts.push({ x: c.x, y: c.y, ttl: CONFLICT_TICKS });
      draft.events.push('conflict');
    }
  }

  // 12. Hits, unless the player is still immune, whose immunity then drops
  // by one. The player is hit by a drift now on their cell (every tick),
  // or by a drift that swapped cells with them on a tick when drifts
  // moved.
  if (draft.invuln > 0) {
    draft.invuln = state.invuln - 1;
    return;
  }
  let hit = draft.drifts.some((d) => d.x === draft.player.x && d.y === draft.player.y);
  if (!hit && moved) {
    for (let i = 0; !hit && i < draft.drifts.length; i++) {
      const now = draft.drifts[i];
      const was = state.drifts[i];
      hit = now.x === before.x && now.y === before.y
        && was.x === draft.player.x && was.y === draft.player.y;
    }
  }
  if (!hit) return;
  if (draft.carried.length > 0) {
    // A hit while carrying drops everything, without costing a life.
    draft.carried = [];
    draft.invuln = INVULN_TICKS;
    draft.events.push('drop');
    return;
  }
  draft.events.push('hit');
  const lives = state.lives - 1;
  if (lives === 0) {
    draft.lives = 0;
    draft.status = 'lost';
    draft.events.push('lost');
    return;
  }
  draft.lives = lives;
  draft.player = { x: state.level.start.x, y: state.level.start.y };
  draft.invuln = INVULN_TICKS;
}

// The rules of Quorum Run (DESIGN.md §5 to §7): the state, the step, and
// the terrain lookup. Pure: every state in and out is plain JSON data, no
// DOM, no Math.random — randomness comes only from the state's seed
// through src/core/rng.js.

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

// The shipped campaign (§10) is the default for init's options.levels. It
// is imported softly: until src/data/levels.js exists (another area of the
// swarm owns it) this module still loads, and init demands options.levels
// with a clear error instead of failing every importer.
let shippedLevels = [];
try {
  shippedLevels = (await import('../data/levels.js')).LEVELS;
} catch {
  shippedLevels = [];
}

const NO_INPUT = { move: null, pause: false };

// §6: a missing or null input, or a missing field, means no move and no
// pause; unknown moves are no move; a pause wins over a move.
function readInput(input) {
  if (input === null || typeof input !== 'object') return NO_INPUT;
  const move = typeof input.move === 'string' && DIRS[input.move] ? input.move : null;
  if (input.pause === true) return { move: null, pause: true };
  return { move, pause: false };
}

// Whether a conflict sits on a cell.
function conflictAt(conflicts, x, y) {
  return conflicts.some((c) => c.x === x && c.y === y);
}

// §6 step 5: each conflict's ttl drops by one, and conflicts at 0 go.
function ageConflicts(conflicts) {
  const out = [];
  for (const c of conflicts) {
    if (c.ttl > 1) out.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }
  return out;
}

// §6 step 6: the player moves one cell in move's direction when the target
// cell is passable to the player: not a wall, not a hold or the exit
// unless the level is open, and no conflict on it; otherwise they stay.
function movePlayer(state, cmd, conflicts) {
  if (!cmd.move) return state.player;
  const [dx, dy] = DIRS[cmd.move];
  const x = state.player.x + dx;
  const y = state.player.y + dy;
  const t = tileAt(state, x, y);
  if (t === '#') return state.player;
  if ((t === 'H' || t === 'X') && !state.open) return state.player;
  if (conflictAt(conflicts, x, y)) return state.player;
  return { x, y };
}

// §5: loading a level (at init and on reaching an open exit) sets level,
// player, patches (with fresh colour draws from the running seed), and
// drifts, and resets carried, conflicts, merges, open, invuln, and
// levelTicks; it keeps score, lives, tick, and the PRNG state.
function loadLevel(base, levels, index) {
  const level = parseLevel(levels[index]);
  let seed = base.seed;
  const patches = level.spawns.map((spawn) => {
    const draw = rngInt(seed, COLORS);
    seed = draw.seed;
    return { x: spawn.x, y: spawn.y, color: draw.value };
  });
  return {
    ...base,
    seed,
    level,
    levelIndex: index,
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

// §5: init(seed, options) returns the first state. options.levels holds
// the level definitions (default LEVELS from src/data/levels.js) and
// options.level the starting level index (default 0).
export function init(seed, options) {
  const opts = options ?? {};
  const levels = opts.levels !== undefined ? opts.levels : shippedLevels;
  if (!levels || levels.length === 0) {
    throw new Error('init: no levels: pass options.levels, or make src/data/levels.js loadable');
  }
  const levelIndex = opts.level === undefined ? 0 : opts.level;
  const base = {
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    levels: levels.slice(),
    levelIndex,
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
  return loadLevel(base, base.levels, levelIndex);
}

// §5: the level's terrain character at a cell, and '#' outside the map.
export function tileAt(state, x, y) {
  const tiles = state.level && state.level.tiles;
  if (!tiles || y < 0 || y >= tiles.length) return '#';
  const row = tiles[y];
  if (!row || x < 0 || x >= row.length) return '#';
  return row[x];
}

// §6: step(state, input) returns the next state and never changes state
// or anything in it. Events of the last step are in state.events.
export function step(state, input) {
  const cmd = readInput(input);

  // 1. A finished game returns the state unchanged but with events [].
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause flips paused and ends the step; nothing else changes.
  if (cmd.pause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // 3. While paused, nothing moves and no tick passes.
  if (state.paused) return { ...state, events: [] };

  // 4. The step ticks: tick and levelTicks grow by one; events start empty.
  const draft = {
    ...state,
    tick: state.tick + 1,
    levelTicks: state.levelTicks + 1,
    events: [],
  };

  // 5. Conflicts age: each ttl drops by one, and conflicts at 0 go.
  draft.conflicts = ageConflicts(state.conflicts);

  // 6. The player moves when the target is passable; otherwise they stay.
  draft.player = movePlayer(state, cmd, draft.conflicts);

  // 7. Pickup: if a patch lies on the player's cell and fewer than
  // CARRY_MAX patches are carried, it leaves patches and its colour is
  // pushed onto carried.
  if (draft.carried.length < CARRY_MAX) {
    const at = state.patches.findIndex((p) => p.x === draft.player.x && p.y === draft.player.y);
    if (at !== -1) {
      const patch = state.patches[at];
      draft.patches = state.patches.slice(0, at).concat(state.patches.slice(at + 1));
      draft.carried = state.carried.concat(patch.color);
      draft.events.push('pickup');
    }
  }

  // 8. Merge: carrying n > 0 patches on an M scores PATCH_BASE * n * n,
  // plus one SAME_COLOR_BONUS per patch when at least two carried and all
  // colours are equal; carried empties, and a merge that reaches the
  // level's quorum while not open flips open once.
  if (draft.carried.length > 0 && tileAt(state, draft.player.x, draft.player.y) === 'M') {
    const n = draft.carried.length;
    let points = PATCH_BASE * n * n;
    if (n >= 2 && draft.carried.every((c) => c === draft.carried[0])) {
      points += SAME_COLOR_BONUS * n;
    }
    draft.score += points;
    draft.merges = state.merges + n;
    draft.carried = [];
    draft.events.push('merge');
    if (!state.open && draft.merges >= state.level.quorum) {
      draft.open = true;
      draft.events.push('quorum');
    }
  }

  // 9. Exit: on the X while open, the score grows by the time bonus; then
  // another level loads and the step ends, or the game is won.
  if (draft.open && tileAt(state, draft.player.x, draft.player.y) === 'X') {
    draft.score += Math.max(0, state.level.par - draft.levelTicks) * TIME_BONUS_PER_TICK;
    if (draft.levelIndex + 1 < state.levels.length) {
      return { ...loadLevel(draft, state.levels, draft.levelIndex + 1), events: ['level'] };
    }
    draft.status = 'won';
    draft.events = ['won'];
    return draft;
  }

  // 10 to 13 (§6): drifts move, conflicts form, hits land, and patches
  // spawn. draft.events holds the events so far.
  const before = { x: state.player.x, y: state.player.y };

  driftsAndHits(draft, state, before);

  // 13. Spawns, while still playing and only when this level's tick
  // divides by spawnEvery: one patch on a free spawn point, its point
  // first and its colour second, both from the running seed. A point is
  // free when no patch, the player, or a drift sits on it, and the level
  // has room for one more patch.
  if (draft.status === 'playing'
    && draft.levelTicks % state.level.spawnEvery === 0
    && draft.patches.length + draft.carried.length < state.level.spawns.length) {
    const free = state.level.spawns.filter((s) =>
      !draft.patches.some((p) => p.x === s.x && p.y === s.y)
      && !(draft.player.x === s.x && draft.player.y === s.y)
      && !draft.drifts.some((d) => d.x === s.x && d.y === s.y));
    if (free.length > 0) {
      const spot = rngInt(draft.seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      draft.patches = draft.patches.concat([{ x: free[spot.value].x, y: free[spot.value].y, color: color.value }]);
      draft.seed = color.seed;
      draft.events.push('spawn');
    }
  }

  return draft;
}
