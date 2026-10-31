// Quorum Run — the rules (DESIGN.md §5 to §7), in src/core/game.js.
// This section of the file is the state (§5), the step order (§6 steps 1 to
// 9), and the events (§7). Steps 10 to 13 — drift movement, drift collisions,
// hits, and spawns — are the drift-phase section at the bottom of the file.
//
// Pure: a step reads its state and returns a new plain-JSON state and never
// touches the state it is given. Randomness comes only from state.seed
// through §3's PRNG (src/core/rng.js); no Math.random, no Date, no DOM here.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, CLOCKWISE, DIRS,
} from './constants.js';
import { rngInt } from './rng.js';
// INVULN_TICKS, CONFLICT_TICKS, and CLOCKWISE are spent by the drift phase below
// (§6 steps 10-13); the rest of the constants drive steps 1 to 9.

// The level loader (§4, src/core/level.js) and the shipped levels
// (§10, src/data/levels.js) belong to other areas. Take them the moment they
// exist and keep this file loadable while they are still in flight, with a
// minimal stand-in for parsing.
let levelModule = null;
try { levelModule = await import('./level.js'); } catch { levelModule = null; }

let shippedLevels = null;
try {
  shippedLevels = (await import('../data/levels.js')).LEVELS ?? null;
} catch { shippedLevels = null; }

// §4: parse a level definition (throwing `invalid level ...` for an invalid
// one) — the real loader when src/core/level.js is here, else the fallback.
function parseLevelFor(def) {
  if (levelModule && typeof levelModule.parseLevel === 'function') {
    return levelModule.parseLevel(def);
  }
  return fallbackParseLevel(def);
}

// A stand-in for src/core/level.js while it is in flight: parse a valid
// definition exactly as §4 asks (terrain, start, spawns, drifts in reading
// order) and throw `invalid level` when a definition clearly is not valid.
// It never runs once the real loader loads; the fallback skips only §4's
// 10th check (`unreachable`).
const FALLBACK_DRIFT_DIRS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

function fallbackParseLevel(def) {
  const fail = () => { throw new Error('invalid level'); };
  if (def === null || typeof def !== 'object' || Array.isArray(def)) fail();
  if (typeof def.name !== 'string' || def.name.length === 0) fail();
  for (const field of ['quorum', 'par', 'driftPeriod', 'spawnEvery']) {
    if (!Number.isInteger(def[field]) || def[field] <= 0) fail();
  }
  const map = def.map;
  if (!Array.isArray(map) || map.length === 0) fail();
  for (const row of map) { if (typeof row !== 'string') fail(); }
  const height = map.length;
  const width = map[0].length;
  if (map.some((row) => row.length !== width)) fail();
  if (width > 32 || height > 24) fail();
  const tiles = [];
  const spawns = [];
  const drifts = [];
  let start = null;
  let starts = 0;
  let merges = 0;
  let exits = 0;
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const ch = map[y][x];
      const onEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (onEdge && ch !== '#') fail();
      if (ch === '#') { row += '#'; continue; }
      if (ch === '.') { row += '.'; continue; }
      if (ch === 'M') { merges += 1; row += 'M'; continue; }
      if (ch === 'X') { exits += 1; row += 'X'; continue; }
      if (ch === 'H') { row += 'H'; continue; }
      if (ch === '@') { starts += 1; start = { x, y }; row += '.'; continue; }
      if (ch === 'P') { spawns.push({ x, y }); row += '.'; continue; }
      const dir = FALLBACK_DRIFT_DIRS[ch];
      if (dir !== undefined) { drifts.push({ x, y, dir }); row += '.'; continue; }
      fail();
    }
    tiles.push(row);
  }
  if (starts !== 1 || exits !== 1 || merges < 1 || spawns.length < 1) fail();
  return {
    name: def.name,
    quorum: def.quorum,
    par: def.par,
    driftPeriod: def.driftPeriod,
    spawnEvery: def.spawnEvery,
    width,
    height,
    tiles,
    start,
    spawns,
    drifts,
  };
}

// §5: load a level — at init and at an open exit. It sets `level`, `player`,
// and `patches` (a fresh colour draw per spawn point, in reading order),
// copies the level's drifts, resets the per-level fields and `levelTicks`,
// and keeps score, lives, tick, status, paused, and the PRNG state.
function loadLevel(state, levels, levelIndex) {
  const level = parseLevelFor(levels[levelIndex]);
  let seed = state.seed;
  const patches = level.spawns.map((spawn) => {
    const draw = rngInt(seed, COLORS);
    seed = draw.seed;
    return { x: spawn.x, y: spawn.y, color: draw.value };
  });
  return {
    ...state,
    seed,
    levels,
    levelIndex,
    level,
    player: { x: level.start.x, y: level.start.y },
    patches,
    drifts: level.drifts.map((drift) => ({ x: drift.x, y: drift.y, dir: drift.dir })),
    carried: [],
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
  };
}

// §5: the first state. `options` is optional: `options.levels` (an array of
// level definitions, default shipped LEVELS) and `options.level` (the
// starting level index, default 0).
export function init(seed, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const levels = opts.levels ?? shippedLevels;
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new Error('invalid level: no level definitions to load');
  }
  const levelIndex = opts.level ?? 0;
  return loadLevel({
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    levels: null,
    levelIndex: 0,
    level: null,
    player: null,
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
  }, levels, levelIndex);
}

// §5: the level's terrain character at a cell ('#', '.', 'M', 'X', or 'H'),
// and '#' outside the map.
export function tileAt(state, x, y) {
  const level = state.level;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return '#';
  if (y < 0 || y >= level.height || x < 0 || x >= level.width) return '#';
  return level.tiles[y][x];
}

// §6 step 6: a cell the player may enter — not a wall, not a closed hold or
// exit, and no conflict on it. Drifts never block the player.
function passableForPlayer(state, x, y) {
  const tile = tileAt(state, x, y);
  if (tile === '#') return false;
  if ((tile === 'H' || tile === 'X') && !state.open) return false;
  return !state.conflicts.some((c) => c.x === x && c.y === y);
}

// §6 step 10: a cell a drift may enter — not a wall, not a hold, not the
// exit (open or closed), and no conflict on it. Drifts ignore the player,
// patches, and each other while moving. The drift phase below uses this.
function passableForDrift(state, x, y) {
  const tile = tileAt(state, x, y);
  if (tile === '#' || tile === 'H' || tile === 'X') return false;
  return !state.conflicts.some((c) => c.x === x && c.y === y);
}

// The final shape of a step's state: the state, plus this step's events.
function withEvents(state, events) {
  return { ...state, events };
}

// §6: one step of the game. `input` is `{ move, pause }`; a missing or null
// input, or a missing field, means no move and no pause. Steps 1 to 9 are
// above; the drift phase (steps 10 to 13) closes the step below.
export function step(state, input) {
  const inp = input && typeof input === 'object' ? input : {};

  // §6 step 1. A game that is over does nothing but report no events.
  if (state.status !== 'playing') return withEvents(state, []);

  // §6 step 2. A pause flips `paused` and changes nothing else.
  if (inp.pause === true) {
    return withEvents({ ...state, paused: !state.paused },
      [state.paused ? 'resume' : 'pause']);
  }

  // §6 step 3. While paused, everything waits.
  if (state.paused) return withEvents(state, []);

  // §6 step 4. The clock ticks once.
  let s = { ...state, tick: state.tick + 1, levelTicks: state.levelTicks + 1 };
  const events = [];

  // §6 step 5. Conflicts age; those at 0 go.
  if (s.conflicts.length > 0) {
    s.conflicts = s.conflicts
      .map((conflict) => ({ ...conflict, ttl: conflict.ttl - 1 }))
      .filter((conflict) => conflict.ttl > 0);
  }

  // §6 step 6. The player moves one cell when the target cell is passable.
  const playerBefore = { x: s.player.x, y: s.player.y };
  const want = inp.move ? DIRS[inp.move] : null;
  if (want) {
    const x = playerBefore.x + want[0];
    const y = playerBefore.y + want[1];
    if (passableForPlayer(s, x, y)) s.player = { x, y };
  }

  // §6 step 7. Pickup: the patch on the player's cell, when a hand is free.
  const lying = s.patches.findIndex((p) => p.x === s.player.x && p.y === s.player.y);
  if (lying !== -1 && s.carried.length < CARRY_MAX) {
    const patch = s.patches[lying];
    s.patches = s.patches.filter((p, i) => i !== lying);
    s.carried = [...s.carried, patch.color];
    events.push('pickup');
  }

  // §6 step 8. A merge on a merge pad: score by squared carried count, with
  // a per-patch bonus for a same-colour merge of two or more; the quorum
  // opens the level once.
  if (s.carried.length > 0 && tileAt(s, s.player.x, s.player.y) === 'M') {
    const n = s.carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && s.carried.every((color) => color === s.carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    s.score += gain;
    s.merges += n;
    s.carried = [];
    events.push('merge');
    if (!s.open && s.merges >= s.level.quorum) {
      s.open = true;
      events.push('quorum');
    }
  }

  // §6 step 9. The open exit ships the level: a time bonus for ticks under
  // par, then the next level loads, or the game is won. The step ends here,
  // before the drift phase.
  if (s.open && tileAt(s, s.player.x, s.player.y) === 'X') {
    s.score += Math.max(0, s.level.par - s.levelTicks) * TIME_BONUS_PER_TICK;
    if (s.levelIndex + 1 < s.levels.length) {
      s = loadLevel(s, s.levels, s.levelIndex + 1);
      events.push('level');
    } else {
      s.status = 'won';
      events.push('won');
    }
    return withEvents(s, events);
  }

  // §6 steps 10 to 13 close the step: drifts, conflicts, hits, spawns.
  return driftPhase(s, events, playerBefore);
}

// ---------------------------------------------------------------------------
// §6 steps 10 to 13: the drift phase — drift movement (10), drift collisions
// (11), hits (12), and spawns (13). This whole section is owned by the
// drift-phase owners of this file (test sections 09, 10, 11, 12, and 14) so
// that the steps above and this one change in separate places.
//
// The phase below steps the given state, a fresh copy from `step`, through
// §6 steps 10 to 13 in order and returns it with `events` extended by whatever they add:
//
//   10. When `state.tick % state.level.driftPeriod === 0`, each drift, in
//       array order, moves one cell in the first direction, from its own
//       onward through CLOCKWISE (up to four), whose target cell is
//       `passableForDrift` (above); with none passable it stays and keeps
//       its direction. Drifts ignore the player, patches, and each other.
//   11. On a tick when drifts moved, for each cell in reading order holding
//       two or more drifts, every drift there reverses its direction (up and
//       down, left and right swap), a `{ x, y, ttl: CONFLICT_TICKS }`
//       conflict is added unless one is already on that cell, and event
//       `conflict` is added once for the cell.
//   12. When `state.invuln > 0` it just drops by one. Otherwise the player
//       is hit when a drift stands on the player's cell, or when a drift
//       that moved this step swapped cells with the player (it is now on
//       `playerBefore`'s cell and was on the player's current cell). On a
//       hit with patches carried: `carried` empties, `invuln` becomes
//       INVULN_TICKS, event `drop`. With empty hands: lives down by one,
//       event `hit`; at 0 lives the game is `lost` (event `lost`), else the
//       player returns to the level's start and `invuln` becomes
//       INVULN_TICKS.
//   13. While the game still plays, when
//       `state.levelTicks % state.level.spawnEvery === 0` and
//       `patches.length + carried.length` is below the number of spawn
//       points: the free spawn points — reading order, no patch, not the
//       player's cell, no drift on them — get one new patch, its cell by
//       `rngInt(state.seed, free.length)` and its colour by a second draw,
//       appended to `patches`; event `spawn`.
// ---------------------------------------------------------------------------

// A drift's direction after a collision: the opposite.
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// §6 step 10: one drift's move — the first passable direction from its own
// onward through CLOCKWISE; with none passable it stays and keeps facing.
function moveDrift(state, drift) {
  const from = CLOCKWISE.indexOf(drift.dir);
  for (let i = 0; i < CLOCKWISE.length; i++) {
    const dir = CLOCKWISE[(from + i + CLOCKWISE.length) % CLOCKWISE.length];
    const dx = DIRS[dir][0];
    const dy = DIRS[dir][1];
    const x = drift.x + dx;
    const y = drift.y + dy;
    if (passableForDrift(state, x, y)) return { x, y, dir };
  }
  return { x: drift.x, y: drift.y, dir: drift.dir };
}

function driftPhase(state, events, playerBefore) {
  // §6 step 10. Only on a moving tick does a drift take a cell; befores
  // holds where each drift was, so a cell swap below can be seen.
  const befores = state.drifts;
  const moving = state.tick % state.level.driftPeriod === 0;
  if (moving) state.drifts = befores.map((drift) => moveDrift(state, drift));

  // §6 step 11. Still only on a moving tick: each cell, in reading order,
  // that holds two or more drifts reverses every drift there and leaves a
  // conflict — unless that cell already holds one — with one event per cell.
  if (moving) {
    const groups = new Map();
    for (let i = 0; i < state.drifts.length; i++) {
      const drift = state.drifts[i];
      const key = drift.x + ',' + drift.y;
      const group = groups.get(key);
      if (group === undefined) groups.set(key, [i]);
      else group.push(i);
    }
    const cells = [...groups.keys()]
      .map((key) => key.split(',').map(Number))
      .sort((a, b) => (a[1] !== b[1] ? a[1] - b[1] : a[0] - b[0]));
    for (const [x, y] of cells) {
      const group = groups.get(x + ',' + y);
      if (group.length < 2) continue;
      const here = group;
      state.drifts = state.drifts.map((drift, i) =>
        here.includes(i) ? { ...drift, dir: REVERSE[drift.dir] ?? drift.dir } : drift);
      if (!state.conflicts.some((c) => c.x === x && c.y === y)) {
        state.conflicts = [...state.conflicts, { x, y, ttl: CONFLICT_TICKS }];
      }
      events.push('conflict');
    }
  }

  // §6 step 12. Hits: while `invuln` lasts nothing lands and it burns down
  // by one. Then a drift on the player's cell, or a drift that moved this
  // tick and swapped cells with the player (it now stands where the player
  // was before step 6 and stood where the player now stands), is a hit.
  // Carrying patches, the hit drops them all; empty-handed, it costs a
  // life — at the last life the game is lost, else the start again.
  if (state.invuln > 0) {
    state.invuln -= 1;
  } else {
    let hit = false;
    for (let i = 0; i < state.drifts.length; i++) {
      const drift = state.drifts[i];
      if (drift.x === state.player.x && drift.y === state.player.y) {
        hit = true;
        break;
      }
      if (moving
        && drift.x === playerBefore.x && drift.y === playerBefore.y
        && befores[i].x === state.player.x && befores[i].y === state.player.y) {
        hit = true;
        break;
      }
    }
    if (hit) {
      if (state.carried.length > 0) {
        state.carried = [];
        state.invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        state.lives -= 1;
        events.push('hit');
        if (state.lives <= 0) {
          state.status = 'lost';
          events.push('lost');
        } else {
          state.player = { x: state.level.start.x, y: state.level.start.y };
          state.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // §6 step 13. While the game still plays, a spawn tick with room below
  // the number of spawn points puts one patch on a free point: not held by
  // a patch, not the player's cell, no drift on it. Its spot comes from a
  // first draw, its colour from a second, and both advance the seed.
  if (state.status === 'playing'
    && state.levelTicks % state.level.spawnEvery === 0
    && state.patches.length + state.carried.length < state.level.spawns.length) {
    const free = state.level.spawns.filter((spot) =>
      !state.patches.some((p) => p.x === spot.x && p.y === spot.y)
      && !(state.player.x === spot.x && state.player.y === spot.y)
      && !state.drifts.some((d) => d.x === spot.x && d.y === spot.y));
    if (free.length > 0) {
      const place = rngInt(state.seed, free.length);
      state.seed = place.seed;
      const spot = free[place.value];
      const color = rngInt(state.seed, COLORS);
      state.seed = color.seed;
      state.patches = [...state.patches, { x: spot.x, y: spot.y, color: color.value }];
      events.push('spawn');
    }
  }

  return withEvents(state, events);
}
