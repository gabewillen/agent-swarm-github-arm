// §6 step 12: the opposite of a direction, for a reversing drift.
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The rules of Quorum Run (DESIGN.md §5 to §7): the state, the step, and
// the terrain lookup. Pure: every state in and out is plain JSON data, no
// DOM, no Math.random — randomness comes only from the state's seed
// through src/core/rng.js.

import {
  CLOCKWISE,
  CARRY_MAX,
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

// §6 step 10: whether a drift may enter a cell: not a wall, not a hold,
// never the exit (open or not), and no conflict on it. A drift ignores the
// player, patches, merge pads, and other drifts.
function driftMayEnter(state, conflicts, x, y) {
  const t = tileAt(state, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !conflictAt(conflicts, x, y);
}

// §6 step 10: the drifts move when tick % driftPeriod === 0. Each drift,
// in array order, tries its own direction, then each next direction
// clockwise, up to four; it turns to and moves one cell in the first whose
// target is passable to a drift. With no passable direction it stays and
// keeps its direction. Returns the new drifts plus, in parallel, each
// drift's cell before the move (for the swap check in step 12).
function moveDrifts(state, conflicts) {
  const drifts = [];
  const froms = [];
  for (const d of state.drifts) {
    const at = CLOCKWISE.indexOf(d.dir);
    let x = d.x;
    let y = d.y;
    let dir = d.dir;
    for (let i = 0; i < 4; i++) {
      const want = CLOCKWISE[(at + i) % 4];
      const [dx, dy] = DIRS[want];
      if (driftMayEnter(state, conflicts, d.x + dx, d.y + dy)) {
        x = d.x + dx;
        y = d.y + dy;
        dir = want;
        break;
      }
    }
    drifts.push({ x, y, dir });
    froms.push({ x: d.x, y: d.y });
  }
  return { drifts, froms };
}

// §6 step 11: only on a tick when drifts moved, cells holding two or more
// drifts, in reading order, reverse every drift there and add a conflict
// with ttl CONFLICT_TICKS unless the cell already has one; event conflict
// once per cell, still.
function collideDrifts(draft) {
  const width = draft.level.width;
  const height = draft.level.height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const here = draft.drifts.filter((d) => d.x === x && d.y === y);
      if (here.length < 2) continue;
      for (const d of here) d.dir = REVERSE[d.dir];
      if (!conflictAt(draft.conflicts, x, y)) {
        draft.conflicts.push({ x, y, ttl: CONFLICT_TICKS });
      }
      draft.events.push('conflict');
    }
  }
}

// §6 step 12: hits. With any invuln left nothing hits and the shield
// decays by one. Otherwise the player is hit when a drift is on their
// cell, or when a drift that moved this step swapped cells with them
// (its new cell is where the player was and its old cell is where the
// player now is). Carrying patches, a hit drops them (invuln grows, no
// life lost); empty-handed it costs a life, and the last one ends the
// game — otherwise the player returns to the level's start with invuln.
function resolveHits(draft, prePlayer, froms) {
  if (draft.invuln > 0) {
    draft.invuln -= 1;
    return;
  }
  let hit = draft.drifts.some((d) => d.x === draft.player.x && d.y === draft.player.y);
  for (let i = 0; !hit && i < draft.drifts.length; i++) {
    const d = draft.drifts[i];
    const f = froms[i];
    hit = d.x === prePlayer.x && d.y === prePlayer.y && f.x === draft.player.x && f.y === draft.player.y;
  }
  if (!hit) return;
  if (draft.carried.length > 0) {
    draft.carried = [];
    draft.invuln = INVULN_TICKS;
    draft.events.push('drop');
    return;
  }
  draft.lives -= 1;
  draft.events.push('hit');
  if (draft.lives <= 0) {
    draft.lives = 0;
    draft.status = 'lost';
    draft.events.push('lost');
    return;
  }
  draft.player = { x: draft.level.start.x, y: draft.level.start.y };
  draft.invuln = INVULN_TICKS;
}

// §6 step 13: a patch spawns when levelTicks % spawnEvery === 0, the game
// is still being played, and patches lying plus patches carried is below
// the level's number of spawn points. The spawn point comes from the free
// ones — in reading order, no patch, not the player's cell, no drift —
// chosen by the seed first, then the colour, both chained rngInt draws.
// At most one patch spawns per tick.
function spawnPatch(draft) {
  if (draft.status !== 'playing') return;
  if (draft.levelTicks % draft.level.spawnEvery !== 0) return;
  if (draft.patches.length + draft.carried.length >= draft.level.spawns.length) return;
  const patchCells = new Set(draft.patches.map((p) => `${p.x},${p.y}`));
  const driftCells = new Set(draft.drifts.map((d) => `${d.x},${d.y}`));
  const free = draft.level.spawns.filter((s) => !patchCells.has(`${s.x},${s.y}`)
    && !(draft.player.x === s.x && draft.player.y === s.y)
    && !driftCells.has(`${s.x},${s.y}`));
  if (free.length === 0) return;
  const spot = rngInt(draft.seed, free.length);
  const spawn = free[spot.value];
  const colour = rngInt(spot.seed, COLORS);
  draft.seed = colour.seed;
  draft.patches = draft.patches.concat({ x: spawn.x, y: spawn.y, color: colour.value });
  draft.events.push('spawn');
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

  // 10 to 13 (§6): drifts move on their phase, conflicts form where they
  // meet, hits land (or fall on the shield), and patches respawn.
  // 10. Drifts move only when this step's tick is a multiple of the
  // level's driftPeriod; the step remembers each drift's old cell.
  const drifting = draft.tick % state.level.driftPeriod === 0;
  let drifts = state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  let froms = state.drifts.map((d) => ({ x: d.x, y: d.y }));
  if (drifting) {
    const run = moveDrifts(state, draft.conflicts);
    drifts = run.drifts;
    froms = run.froms;
  }
  draft.drifts = drifts;

  // 11. Collisions: only on such a tick, cells in reading order.
  if (drifting) collideDrifts(draft);

  // 12. Hits: resolution works from the moved board and the player's
  // cell before step 6, for the swap check.
  resolveHits(draft, state.player, froms);

  // 13. A patch may still respawn, while the level is being played.
  spawnPatch(draft);

  return draft;
}
