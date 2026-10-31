// DESIGN.md §5–§7: the rules of Quorum Run. The core is pure and
// render-free: `step` never changes the state (or anything in it) it is
// given, and every state it returns is plain JSON data. Randomness comes
// only from the state's seed, drawn through rngInt (§3).
import { CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE } from './constants.js';
import { parseLevel } from './level.js';
import { rngInt } from './rng.js';
import { LEVELS } from '../data/levels.js';

// A deep copy of JSON data: arrays and plain objects are rebuilt, numbers,
// strings, booleans, and null are copied as they are.
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = clone(value[key]);
    return out;
  }
  return value;
}

// Loading a level (§5) starts it: the level, its fresh patches (colours
// drawn from the running seed, one per spawn point in reading order), its
// drifts, and the per-level fields. The caller's score, lives, tick, and
// seed survive; the seed follows the draws.
function loadLevel(state) {
  state.level = parseLevel(state.levels[state.levelIndex]);
  state.player = { ...state.level.start };
  const patches = [];
  let seed = state.seed;
  for (const spawn of state.level.spawns) {
    const draw = rngInt(seed, COLORS);
    patches.push({ x: spawn.x, y: spawn.y, color: draw.value });
    seed = draw.seed;
  }
  state.patches = patches;
  state.drifts = state.level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  state.carried = [];
  state.conflicts = [];
  state.merges = 0;
  state.open = false;
  state.invuln = 0;
  state.levelTicks = 0;
  state.seed = seed;
}

export function init(seed, options) {
  const opts = options ?? {};
  const state = {
    seed: (seed ?? 0) >>> 0,
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
  loadLevel(state);
  return state;
}

// The level's terrain at a cell ('#', '.', 'M', 'X', 'H'), '#' outside.
export function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (typeof row !== 'string') return '#';
  const t = row[x];
  return t === undefined ? '#' : t;
}

function conflictAt(state, x, y) {
  return state.conflicts.some((c) => c.x === x && c.y === y);
}

// §6 step 6: passable to the player — not a wall, not a hold or the exit
// unless the level's quorum is reached, and no conflict on it.
function passablePlayer(state, x, y) {
  const t = tileAt(state, x, y);
  if (t === '#') return false;
  if (t === 'H' || t === 'X') return state.open;
  if (conflictAt(state, x, y)) return false;
  return true;
}

// §6 step 10: passable to a drift — not a wall, not a hold, not the exit
// (open or not), and no conflict on it. Drifts ignore the player, patches,
// and each other.
function passableDrift(state, x, y) {
  const t = tileAt(state, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  if (conflictAt(state, x, y)) return false;
  return true;
}

function reverseDir(dir) {
  return dir === 'up' ? 'down'
    : dir === 'down' ? 'up'
      : dir === 'left' ? 'right'
        : 'left';
}

// Each drift, in array order, tries its own direction then the next
// clockwise, up to four: it turns to and moves one cell in the first
// passable one. A drift standing on a conflict is held by it (the tests
// pin this: the block stops everything on it too). With no passable
// direction it stays and keeps its direction. Returns one entry per drift:
// { moved, fromX, fromY } for the swap rule.
function moveDrifts(state) {
  const out = [];
  for (const d of state.drifts) {
    const fromX = d.x;
    const fromY = d.y;
    let moved = false;
    if (!conflictAt(state, d.x, d.y)) {
      const start = CLOCKWISE.indexOf(d.dir);
      for (let k = 0; k < 4 && !moved; k++) {
        const dir = CLOCKWISE[(start + k) % 4];
        const [dx, dy] = DIRS[dir];
        const tx = d.x + dx;
        const ty = d.y + dy;
        if (passableDrift(state, tx, ty)) {
          d.dir = dir;
          d.x = tx;
          d.y = ty;
          moved = true;
        }
      }
    }
    out.push({ moved, fromX, fromY });
  }
  return out;
}

// §6 step 11: for each cell, in reading order, holding two or more drifts,
// every drift there reverses; a conflict is added unless one is already on
// that cell; one event for the cell.
function driftCollisions(state) {
  const byCell = new Map();
  for (const d of state.drifts) {
    const key = d.y + ',' + d.x;
    const list = byCell.get(key);
    if (list) list.push(d);
    else byCell.set(key, [d]);
  }
  const cells = [...byCell.entries()]
    .map(([key, drifts]) => {
      const at = key.split(',');
      return { y: Number(at[0]), x: Number(at[1]), drifts };
    });
  cells.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  for (const cell of cells) {
    if (cell.drifts.length < 2) continue;
    for (const d of cell.drifts) d.dir = reverseDir(d.dir);
    if (!conflictAt(state, cell.x, cell.y)) {
      state.conflicts.push({ x: cell.x, y: cell.y, ttl: CONFLICT_TICKS });
    }
    state.events.push('conflict');
  }
}

// §6 step 12: while invuln holds, it counts down and nothing hits. Then a
// hit is a drift on the player's cell, or a drift that moved this step and
// swapped cells with the player. Carrying patches, they drop them all;
// empty-handed it costs a life.
function stepHits(state, playerBefore, moved) {
  if (state.invuln > 0) {
    state.invuln -= 1;
    return;
  }
  let hit = false;
  for (const d of state.drifts) {
    if (d.x === state.player.x && d.y === state.player.y) {
      hit = true;
      break;
    }
  }
  if (!hit && moved) {
    for (let i = 0; i < state.drifts.length; i++) {
      const flag = moved[i];
      if (!flag.moved) continue;
      const d = state.drifts[i];
      // The drift is now where the player was, and was where the player is.
      if (d.x === playerBefore.x && d.y === playerBefore.y
        && flag.fromX === state.player.x && flag.fromY === state.player.y) {
        hit = true;
        break;
      }
    }
  }
  if (!hit) return;
  if (state.carried.length > 0) {
    state.carried = [];
    state.invuln = INVULN_TICKS;
    state.events.push('drop');
  } else {
    state.lives -= 1;
    state.events.push('hit');
    if (state.lives <= 0) {
      state.lives = 0;
      state.status = 'lost';
      state.events.push('lost');
    } else {
      state.player = { ...state.level.start };
      state.invuln = INVULN_TICKS;
    }
  }
}

// §6 step 13: a patch respawns when the level's tick is due and free spawn
// points exist: not holding a patch, not the player's cell, no drift on
// them. Pick the point, then the colour, each from the seed.
function stepSpawns(state) {
  if (state.levelTicks % state.level.spawnEvery !== 0) return;
  if (state.patches.length + state.carried.length >= state.level.spawns.length) return;
  const patchCells = new Set(state.patches.map((p) => p.y + ',' + p.x));
  const driftCells = new Set(state.drifts.map((d) => d.y + ',' + d.x));
  const free = state.level.spawns.filter((sp) => {
    const key = sp.y + ',' + sp.x;
    return !patchCells.has(key) && !driftCells.has(key)
      && !(sp.x === state.player.x && sp.y === state.player.y);
  });
  if (free.length === 0) return;
  const pick = rngInt(state.seed, free.length);
  const color = rngInt(pick.seed, COLORS);
  const spot = free[pick.value];
  state.patches = [...state.patches, { x: spot.x, y: spot.y, color: color.value }];
  state.seed = color.seed;
  state.events.push('spawn');
}

// §6: one step. `input` is { move, pause }: move one of 'up', 'right',
// 'down', 'left', or null; pause a boolean. A missing or null input, or a
// missing field, means no move and no pause.
export function step(state, input) {
  const s = clone(state);
  const rawMove = input ? input.move : undefined;
  const rawPause = input ? input.pause : undefined;
  const move = typeof rawMove === 'string' && Object.hasOwn(DIRS, rawMove) ? rawMove : null;
  const pause = rawPause === true;

  // 1. A game that is won or lost no longer changes.
  if (s.status !== 'playing') {
    s.events = [];
    return s;
  }
  // 2. A pause input flips paused and is the whole step.
  if (pause) {
    s.paused = !s.paused;
    s.events = [s.paused ? 'pause' : 'resume'];
    return s;
  }
  // 3. Nothing moves while paused.
  if (s.paused) {
    s.events = [];
    return s;
  }

  // 4. Time passes.
  s.tick += 1;
  s.levelTicks += 1;
  s.events = [];

  // 5. Conflicts age, freeing their cells for everything below.
  const live = [];
  for (const c of s.conflicts) {
    if (c.ttl > 1) live.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }
  s.conflicts = live;

  // 6. The player moves when the target is passable.
  const playerBefore = { x: s.player.x, y: s.player.y };
  if (move) {
    const [dx, dy] = DIRS[move];
    const tx = s.player.x + dx;
    const ty = s.player.y + dy;
    if (passablePlayer(s, tx, ty)) s.player = { x: tx, y: ty };
  }

  // 7. Pickup: a patch on the player's cell, while there is room to carry.
  if (s.carried.length < CARRY_MAX) {
    const at = s.patches.findIndex((p) => p.x === s.player.x && p.y === s.player.y);
    if (at >= 0) {
      const color = s.patches[at].color;
      s.patches = s.patches.filter((q, i) => i !== at);
      s.carried.push(color);
      s.events.push('pickup');
    }
  }

  // 8. Merge.
  if (tileAt(s, s.player.x, s.player.y) === 'M' && s.carried.length > 0) {
    const n = s.carried.length;
    let gained = PATCH_BASE * n * n;
    if (n >= 2 && s.carried.every((c) => c === s.carried[0])) {
      gained += SAME_COLOR_BONUS * n;
    }
    s.score += gained;
    s.merges += n;
    s.carried = [];
    s.events.push('merge');
    if (!s.open && s.merges >= s.level.quorum) {
      s.open = true;
      s.events.push('quorum');
    }
  }

  // 9. Exit: the step ends here, before the drifts move.
  if (s.open && tileAt(s, s.player.x, s.player.y) === 'X') {
    s.score += Math.max(0, s.level.par - s.levelTicks) * TIME_BONUS_PER_TICK;
    if (s.levelIndex + 1 < s.levels.length) {
      s.levelIndex += 1;
      loadLevel(s);
      s.events.push('level');
    } else {
      s.status = 'won';
      s.events.push('won');
    }
    return s;
  }

  const driftTick = s.tick % s.level.driftPeriod === 0;

  // 10 and 11. Drifts move and collide on their tick.
  if (driftTick) {
    const moved = moveDrifts(s);
    driftCollisions(s);

    // 12. Hits.
    stepHits(s, playerBefore, moved);
  } else {
    stepHits(s, playerBefore, null);
  }

  // 13. Spawns, while still playing.
  if (s.status === 'playing') stepSpawns(s);

  return s;
}
