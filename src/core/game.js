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

// §5: a drift reverses direction only on a head-on stack.
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

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

  // 10. Drifts move on ticks divisible by the level's driftPeriod. In
  // array order, each drift tries its own direction first and then each
  // next direction clockwise, up to four: it turns to and moves one cell
  // in the first whose target is passable to a drift: not a wall, not a
  // hold, not the exit (open or not), and no conflict on it. A drift
  // standing on a conflict is pinned: it stays and keeps its direction.
  // Drifts ignore the player, patches, and each other while moving; with
  // no passable direction they stay and keep their direction.
  const driftTick = draft.tick % state.level.driftPeriod === 0;
  let drifts = state.drifts;
  if (driftTick) {
    drifts = [];
    for (const d of state.drifts) {
      let plan = null;
      if (!conflictAt(draft.conflicts, d.x, d.y)) {
        const from = CLOCKWISE.indexOf(d.dir);
        for (let k = 0; k < CLOCKWISE.length; k++) {
          const dir = CLOCKWISE[(from + k) % CLOCKWISE.length];
          const [dx, dy] = DIRS[dir];
          const x = d.x + dx;
          const y = d.y + dy;
          const t = tileAt(state, x, y);
          if (t === '#' || t === 'H' || t === 'X') continue;
          if (conflictAt(draft.conflicts, x, y)) continue;
          plan = { x, y, dir };
          break;
        }
      }
      drifts.push(plan ?? { x: d.x, y: d.y, dir: d.dir });
    }

    // 11. Drift collisions, again on drift ticks only: every cell, in
    // reading order, holding two or more drifts reverses every drift
    // there (up and down, left and right swap), adds one conflict
    // { x, y, ttl: CONFLICT_TICKS } unless one is already on the cell,
    // and raises event 'conflict' once for the cell.
    const stacks = new Map();
    for (const d of drifts) {
      const key = `${d.x},${d.y}`;
      const list = stacks.get(key);
      if (list) list.push(d);
      else stacks.set(key, [d]);
    }
    const cells = [];
    for (const list of stacks.values()) {
      if (list.length >= 2) cells.push({ x: list[0].x, y: list[0].y });
    }
    cells.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const cell of cells) {
      for (let i = 0; i < drifts.length; i++) {
        const d = drifts[i];
        if (d.x === cell.x && d.y === cell.y) {
          drifts[i] = { x: d.x, y: d.y, dir: OPPOSITE[d.dir] };
        }
      }
      if (!conflictAt(draft.conflicts, cell.x, cell.y)) {
        draft.conflicts = draft.conflicts.concat({ x: cell.x, y: cell.y, ttl: CONFLICT_TICKS });
      }
      draft.events.push('conflict');
    }
    draft.drifts = drifts;
  }

  // 12. Hits: under invuln nothing hits and the immunity counts down one
  // tick. Otherwise the player is hit when a drift stands on the player's
  // cell, or — on a tick when drifts moved — when a drift swapped cells
  // with the player (the drift is now where the player was before step 6
  // and was where the player is now). Carrying, a hit drops the patches
  // instead: carried empties and invuln starts. Empty-handed, a hit costs
  // a life, then the last life ends the game, or the player returns to
  // the level's start under invuln.
  const wasPlayer = state.player;
  if (draft.invuln > 0) {
    draft.invuln = draft.invuln - 1;
  } else {
    let hit = false;
    for (const d of drifts) {
      if (d.x === draft.player.x && d.y === draft.player.y) {
        hit = true;
        break;
      }
    }
    if (!hit && driftTick) {
      for (let i = 0; i < state.drifts.length && !hit; i++) {
        const d = drifts[i];
        const was = state.drifts[i];
        if (d.x === wasPlayer.x && d.y === wasPlayer.y && was.x === draft.player.x && was.y === draft.player.y) {
          hit = true;
        }
      }
    }
    if (hit) {
      if (draft.carried.length > 0) {
        draft.carried = [];
        draft.invuln = INVULN_TICKS;
        draft.events.push('drop');
      } else {
        draft.lives = draft.lives - 1;
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

  // 13. Spawns, while still playing: every spawnEvery level ticks, when
  // patches worn and carried together leave a spawn point spare — none
  // free that holds a patch, the player, or a drift — the seed picks the
  // point first and its colour second, and the patch joins the board.
  if (draft.status === 'playing') {
    const every = state.level.spawnEvery;
    if (draft.levelTicks % every === 0) {
      const spots = state.level.spawns;
      if (draft.patches.length + draft.carried.length < spots.length) {
        const taken = new Set();
        const cellKey = (x, y) => `${x},${y}`;
        for (const p of draft.patches) taken.add(cellKey(p.x, p.y));
        for (const d of drifts) taken.add(cellKey(d.x, d.y));
        taken.add(cellKey(draft.player.x, draft.player.y));
        const free = spots.filter((s) => !taken.has(cellKey(s.x, s.y)));
        if (free.length > 0) {
          const pick = rngInt(draft.seed, free.length);
          const spot = free[pick.value];
          const color = rngInt(pick.seed, COLORS);
          draft.patches = draft.patches.concat({ x: spot.x, y: spot.y, color: color.value });
          draft.seed = color.seed;
          draft.events.push('spawn');
        }
      }
    }
  }

  return draft;
}
