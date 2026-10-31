// The rules of Quorum Run (DESIGN.md §5 to §7): the state, the step, and
// the terrain lookup. Pure: every state in and out is plain JSON data, no
// DOM, no Math.random — randomness comes only from the state's seed
// through src/core/rng.js.

import {
  CARRY_MAX,
  CLOCKWISE,
  CONFLICT_TICKS,
  COLORS,
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

// §6 step 10: one drift's move. It tries its own direction first, then
// each next direction clockwise, up to four, and turns to and moves one
// cell in the first whose target is passable to a drift: not a wall, not
// a hold, not the exit (open or not), and no conflict on it. Drifts
// ignore the player, patches, and each other while moving; with no
// passable direction it stays and keeps its direction.
const AWAY = { up: 'down', down: 'up', left: 'right', right: 'left' };

function moveDrift(state, drift, conflicts) {
  const at = CLOCKWISE.indexOf(drift.dir);
  for (let k = 0; k < 4; k++) {
    const dir = CLOCKWISE[(at + k) % 4];
    const [dx, dy] = DIRS[dir];
    const x = drift.x + dx;
    const y = drift.y + dy;
    const t = tileAt(state, x, y);
    if (t === '#' || t === 'H' || t === 'X') continue;
    if (conflictAt(conflicts, x, y)) continue;
    return { x, y, dir };
  }
  return { x: drift.x, y: drift.y, dir: drift.dir };
}

// §6 step 11: for each cell, in reading order, holding two or more
// drifts, every drift there reverses its direction, a conflict
// { x, y, ttl: CONFLICT_TICKS } is added unless one is on the cell
// already, and one conflict event is reported for the cell.
function collideDrifts(drifts, conflicts, events) {
  const counts = new Map();
  for (const d of drifts) {
    const key = `${d.x},${d.y}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const cells = [...counts]
    .filter(([, n]) => n >= 2)
    .map(([key]) => key.split(',').map(Number))
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  let out = drifts;
  for (const [x, y] of cells) {
    out = out.map((d) => (d.x === x && d.y === y ? { ...d, dir: AWAY[d.dir] } : d));
    if (!conflictAt(conflicts, x, y)) conflicts.push({ x, y, ttl: CONFLICT_TICKS });
    events.push('conflict');
  }
  return out;
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

  // 10. Drifts move on the ticks the level's period allows: each drift,
  // in array order, turns to the first passable direction clockwise from
  // its own and moves one cell. The step keeps each drift's from cell for
  // step 12's swap check.
  const prePlayer = state.player; // the player before step 6
  let moved = null;
  if (draft.tick % state.level.driftPeriod === 0) {
    moved = state.drifts.map((d) => {
      const to = moveDrift(state, d, draft.conflicts);
      return { from: { x: d.x, y: d.y }, to };
    });
    draft.drifts = moved.map((m) => m.to);
    // 11. Drift collisions: on a tick when drifts moved, cells holding
    // two or more drifts, in reading order, reverse every drift there,
    // leave one conflict each, and report one event each.
    draft.drifts = collideDrifts(draft.drifts, draft.conflicts, draft.events);
  }

  // 12. Hits: with invulnerability left, it counts down and nothing hits;
  // otherwise the player is hit when a drift is on the player's cell, or
  // when a drift that moved this step swapped cells with the player. On a
  // hit, carried patches drop instead of a life; empty-handed a life is
  // lost, and at 0 lives the game is lost, else the player returns to the
  // level's start with fresh invulnerability.
  if (draft.invuln > 0) {
    draft.invuln = draft.invuln - 1;
  } else {
    let hit = draft.drifts.some((d) => d.x === draft.player.x && d.y === draft.player.y);
    if (!hit && moved !== null) {
      hit = moved.some((m) =>
        (m.from.x !== m.to.x || m.from.y !== m.to.y) &&
        m.to.x === prePlayer.x && m.to.y === prePlayer.y &&
        m.from.x === draft.player.x && m.from.y === draft.player.y);
    }
    if (hit) {
      if (draft.carried.length > 0) {
        draft.carried = [];
        draft.invuln = INVULN_TICKS;
        draft.events.push('drop');
      } else {
        draft.lives = state.lives - 1;
        draft.events.push('hit');
        if (draft.lives <= 0) {
          draft.status = 'lost';
          draft.events.push('lost');
        } else {
          draft.player = { x: state.level.start.x, y: state.level.start.y };
          draft.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns: when the level's ticks reach a spawn period and patches
  // are missing, one patch appears on a free spawn point: one with no
  // patch, not the player's cell, and no drift on it. Its cell comes from
  // the seed first, then its colour; both draws advance the seed.
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
      draft.seed = color.seed;
      draft.patches = draft.patches.concat([
        { x: free[spot.value].x, y: free[spot.value].y, color: color.value },
      ]);
      draft.events.push('spawn');
    }
  }

  return draft;
}
