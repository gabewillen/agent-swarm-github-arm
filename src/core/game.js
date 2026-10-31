// Quorum Run — the rules (DESIGN.md §5 to §7).
//
// init(seed, options) builds the first state; step(state, input) returns the
// next state and never changes the state it is given; tileAt(state, x, y)
// reads the level's terrain. Everything the core returns is plain JSON data,
// and randomness comes only from the state's seed through the PRNG of §3.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, COLORS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';

// A drift reverses on a collision.
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// §10's shipped LEVELS are init's default level list. They live in
// src/data/levels.js (another agent's area); until that module is merged,
// every test passes its levels to init, so this leaf loads on its own and
// init without options.levels explains itself instead of failing everyone
// who imports this module.
let DEFAULT_LEVELS = null; // TODO(§10): land with `import { LEVELS } from '../data/levels.js'`.

function pickLevels(options) {
  if (options && Array.isArray(options.levels)) return options.levels.slice();
  if (Array.isArray(DEFAULT_LEVELS)) return DEFAULT_LEVELS;
  throw new Error('levels: pass options.levels (init defaults to the LEVELS of src/data/levels.js, not merged yet)');
}

function isMove(m) {
  return m === 'up' || m === 'right' || m === 'down' || m === 'left';
}

// §6's reading of the step's input: a missing input or field means no move
// and no pause; knowing an unknown move is no move.
function readInput(input) {
  if (!input || typeof input !== 'object') return { move: null, pause: false };
  return { move: isMove(input.move) ? input.move : null, pause: input.pause === true };
}

// The terrain character at a cell, '#' beyond the map.
function terrainAt(level, x, y) {
  const tiles = level && level.tiles;
  if (!Array.isArray(tiles) || !Number.isInteger(y) || y < 0 || y >= tiles.length) return '#';
  const row = tiles[y];
  if (typeof row !== 'string' || !Number.isInteger(x) || x < 0 || x >= row.length) return '#';
  return row[x];
}

// §5's tileAt.
export function tileAt(state, x, y) {
  return terrainAt(state && state.level, x, y);
}

function on(cell, x, y) {
  return cell.x === x && cell.y === y;
}

function conflictAt(conflicts, x, y) {
  return conflicts.some((c) => c.x === x && c.y === y);
}

// Passable to the player: not a wall, a hold or the exit only when the
// level's quorum is open, and no conflict on the cell (§6 step 6).
function passableForPlayer(state, conflicts, x, y) {
  const t = terrainAt(state.level, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !state.open) return false;
  return !conflictAt(conflicts, x, y);
}

// Passable to a drift: never a wall, hold, or exit (open or not), and no
// conflict on the cell (§6 step 10).
function passableForDrift(level, conflicts, x, y) {
  const t = terrainAt(level, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !conflictAt(conflicts, x, y);
}

// A drift's own direction first, then each next direction clockwise (§6
// step 10): facing up it tries up, right, down, left.
function tryOrder(dir) {
  const at = CLOCKWISE.indexOf(dir);
  if (at < 0) return CLOCKWISE.slice();
  return [...CLOCKWISE.slice(at), ...CLOCKWISE.slice(0, at)];
}

// §5's level load, at init and again when an open exit ships the level.
// Fresh patch colours are drawn from the running seed, in reading order.
function loadLevel(state) {
  const level = parseLevel(state.levels[state.levelIndex]);
  let seed = state.seed;
  const patches = [];
  for (const sp of level.spawns) {
    const r = rngInt(seed, COLORS);
    seed = r.seed;
    patches.push({ x: sp.x, y: sp.y, color: r.value });
  }
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
  const levels = pickLevels(options);
  const levelIndex = options && Number.isInteger(options.level) && options.level >= 0
    ? options.level
    : 0;
  const state = {
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    levels,
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
  return loadLevel(state);
}

// §6's step, in order.
export function step(state, input) {
  const req = readInput(input);

  // 1. A won or lost game returns with the events emptied.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause input flips paused and changes nothing else.
  if (req.pause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // 3. While paused nothing happens and no tick passes.
  if (state.paused) return { ...state, events: [] };

  // 4. The step ticks.
  const events = [];
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;

  // 5. Conflicts age; the ones at 0 go.
  const conflicts = [];
  for (const c of state.conflicts) {
    if (c.ttl > 1) conflicts.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }

  // 6. The player moves one cell when the target is passable.
  const before = { x: state.player.x, y: state.player.y };
  let player = { x: before.x, y: before.y };
  if (req.move) {
    const [dx, dy] = DIRS[req.move];
    const tx = before.x + dx;
    const ty = before.y + dy;
    if (passableForPlayer(state, conflicts, tx, ty)) player = { x: tx, y: ty };
  }

  // 7. Pickup: a patch on the player's cell goes into a free hand.
  let carried = state.carried.slice();
  let patches = state.patches.slice();
  if (carried.length < CARRY_MAX) {
    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      if (on(p, player.x, player.y)) {
        patches.splice(i, 1);
        carried.push(p.color);
        events.push('pickup');
        break;
      }
    }
  }

  // 8. Merge: on a pad with a hand, the patches score and empty the hand.
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  if (carried.length > 0 && terrainAt(state.level, player.x, player.y) === 'M') {
    const n = carried.length;
    score += PATCH_BASE * n * n + (n >= 2 && carried.every((c) => c === carried[0]) ? SAME_COLOR_BONUS * n : 0);
    merges += n;
    carried = [];
    events.push('merge');
    if (merges >= state.level.quorum && !open) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. Exit: an open exit ships the level, with time for arriving under par.
  if (open && terrainAt(state.level, player.x, player.y) === 'X') {
    score += Math.max(0, state.level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      const next = { ...state, tick, levelTicks, score, events: [...events, 'level'] };
      return loadLevel({ ...next, levelIndex: state.levelIndex + 1 });
    }
    return { ...state, tick, levelTicks, score, player, patches, carried, conflicts, merges, open, status: 'won', events: [...events, 'won'] };
  }

  // 10. Drifts move on a tick when tick % driftPeriod is 0.
  const moved = tick % state.level.driftPeriod === 0;
  const drifts = state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  const driftMoved = moveDrifts(drifts, moved, conflicts, state.level);

  // 11. Collisions, only on a tick when drifts moved.
  if (moved) collide(drifts, conflicts, events);

  // 12. Hits.
  let invuln = state.invuln;
  let lives = state.lives;
  let status = 'playing';
  let hit = false;
  if (invuln > 0) {
    invuln -= 1;
  } else {
    for (let i = 0; i < drifts.length; i++) {
      const d = drifts[i];
      const b = { x: state.drifts[i].x, y: state.drifts[i].y };
      const sitsOnPlayer = on(d, player.x, player.y);
      const swapped = driftMoved[i]
        && d.x === before.x && d.y === before.y
        && b.x === player.x && b.y === player.y;
      if (sitsOnPlayer || swapped) {
        hit = true;
        break;
      }
    }
  }
  if (hit) {
    if (carried.length > 0) {
      carried = [];
      invuln = INVULN_TICKS;
      events.push('drop');
    } else {
      lives -= 1;
      events.push('hit');
      if (lives > 0) {
        player = { x: state.level.start.x, y: state.level.start.y };
        invuln = INVULN_TICKS;
      } else {
        lives = 0;
        status = 'lost';
        events.push('lost');
      }
    }
  }

  // 13. Spawns, while the game is still being played.
  let seed = state.seed;
  if (status === 'playing'
    && levelTicks % state.level.spawnEvery === 0
    && patches.length + carried.length < state.level.spawns.length) {
    const free = state.level.spawns.filter((sp) =>
      !on(player, sp.x, sp.y)
      && !patches.some((p) => on(p, sp.x, sp.y))
      && !drifts.some((d) => on(d, sp.x, sp.y)));
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
    seed, tick, levelTicks, levels: state.levels, levelIndex: state.levelIndex,
    level: state.level, player, carried, patches, drifts, conflicts,
    score, lives, merges, open, invuln, status, paused: state.paused, events,
  };
}

// One drift pass: each drift, in array order, tries its own direction then
// the next directions clockwise, up to four, and turns to and moves one
// cell in the first passable one; with none it stays and keeps its
// direction. Returns, per drift, whether it moved.
function moveDrifts(drifts, moved, conflicts, level) {
  const driftMoved = drifts.map(() => false);
  if (!moved) return driftMoved;
  for (let i = 0; i < drifts.length; i++) {
    const d = drifts[i];
    for (const dir of tryOrder(d.dir)) {
      const [dx, dy] = DIRS[dir];
      const tx = d.x + dx;
      const ty = d.y + dy;
      if (passableForDrift(level, conflicts, tx, ty)) {
        d.x = tx;
        d.y = ty;
        d.dir = dir;
        driftMoved[i] = true;
        break;
      }
    }
  }
  return driftMoved;
}

function collide(drifts, conflicts, events) {
  const cells = new Map();
  for (let i = 0; i < drifts.length; i++) {
    const d = drifts[i];
    const key = `${d.y},${d.x}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  }
  const keys = [...cells.keys()].sort((a, b) => {
    const [ay, ax] = a.split(',').map(Number);
    const [by, bx] = b.split(',').map(Number);
    return ay - by || ax - bx;
  });
  for (const key of keys) {
    const there = cells.get(key);
    if (there.length < 2) continue;
    const [y, x] = key.split(',').map(Number);
    for (const i of there) drifts[i].dir = REVERSE[drifts[i].dir];
    if (!conflictAt(conflicts, x, y)) conflicts.push({ x, y, ttl: CONFLICT_TICKS });
    events.push('conflict');
  }
}
