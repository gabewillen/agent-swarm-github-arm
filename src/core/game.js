// Quorum Run §5–§7: the state, a step, and terrain lookups.
//
// `init(seed, options)` builds the first state; `step(state, input)`
// advances it one tick and never changes its argument; `tileAt(state, x, y)`
// reads terrain. Every state is plain JSON data. Randomness comes only from
// `state.seed`; the core is pure and render-free.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

// Load a level into a state: the parsed level, the player at its start, one
// patch per spawn point in reading order with fresh colour draws, copies of
// the drifts, and the per-level counters reset. Keeps score, lives, tick,
// and the PRNG state (§5).
function loadLevel(state, def) {
  state.level = parseLevel(def);
  state.player = { x: state.level.start.x, y: state.level.start.y };
  state.patches = [];
  for (const spot of state.level.spawns) {
    const r = rngInt(state.seed, COLORS);
    state.seed = r.seed;
    state.patches.push({ x: spot.x, y: spot.y, color: r.value });
  }
  state.drifts = state.level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  state.carried = [];
  state.conflicts = [];
  state.merges = 0;
  state.open = false;
  state.invuln = 0;
  state.levelTicks = 0;
}

export function init(seed, options) {
  const opts = options || {};
  const levels = opts.levels === undefined ? LEVELS : opts.levels;
  const levelIndex = opts.level === undefined ? 0 : opts.level;
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
  loadLevel(state, levels[levelIndex]);
  return state;
}

export function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

// Passable to the player: never a wall; holds and the exit only when open;
// never a conflict cell (§6 step 6).
function passable(state, x, y) {
  const t = tileAt(state, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !state.open) return false;
  for (const c of state.conflicts) {
    if (c.x === x && c.y === y) return false;
  }
  return true;
}

// Passable to a drift: never a wall, hold, or the exit, even open; never a
// conflict cell (§6 step 10).
function passableForDrift(state, x, y) {
  const t = tileAt(state, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  for (const c of state.conflicts) {
    if (c.x === x && c.y === y) return false;
  }
  return true;
}

const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function step(state, input) {
  // §6 step 1: a finished game does nothing but clear its events.
  if (state.status !== 'playing') return { ...state, events: [] };
  // Step 2: a pause flips `paused` and changes nothing else.
  if (input && input.pause) {
    return {
      ...state,
      paused: !state.paused,
      events: [state.paused ? 'resume' : 'pause'],
    };
  }
  // Step 3: while paused nothing happens.
  if (state.paused) return { ...state, events: [] };

  // Step 4: the clock runs.
  const next = { ...state, events: [] };
  next.tick += 1;
  next.levelTicks += 1;

  // Step 5: conflicts age.
  next.conflicts = next.conflicts
    .map((c) => ({ ...c, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // Step 6: the player moves one cell when the target is passable.
  const prev = { x: next.player.x, y: next.player.y };
  const move = input && input.move;
  if (move && DIRS[move]) {
    const nx = prev.x + DIRS[move][0];
    const ny = prev.y + DIRS[move][1];
    if (passable(next, nx, ny)) next.player = { x: nx, y: ny };
  }

  // Step 7: pickup, when hands are not full.
  if (next.carried.length < CARRY_MAX) {
    const i = next.patches.findIndex((p) => p.x === next.player.x && p.y === next.player.y);
    if (i >= 0) {
      next.carried = [...next.carried, next.patches[i].color];
      next.patches = next.patches.filter((p, j) => j !== i);
      next.events.push('pickup');
    }
  }

  // Step 8: merge on a merge pad.
  if (tileAt(next, next.player.x, next.player.y) === 'M' && next.carried.length > 0) {
    const n = next.carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && next.carried.every((c) => c === next.carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    next.score += gain;
    next.merges += n;
    next.carried = [];
    next.events.push('merge');
    if (!next.open && next.merges >= next.level.quorum) {
      next.open = true;
      next.events.push('quorum');
    }
  }

  // Step 9: exit. Open and standing on X: time bonus, then the next level or
  // the win. Either way the step ends here, before the drifts move.
  if (next.open && tileAt(next, next.player.x, next.player.y) === 'X') {
    next.score += Math.max(0, next.level.par - next.levelTicks) * TIME_BONUS_PER_TICK;
    if (next.levelIndex + 1 < next.levels.length) {
      next.levelIndex += 1;
      loadLevel(next, next.levels[next.levelIndex]);
      next.events.push('level');
    } else {
      next.status = 'won';
      next.events.push('won');
    }
    return next;
  }

  // Step 10: drifts move on their phase.
  const driftPhase = next.tick % next.level.driftPeriod === 0;
  let driftsBefore = null;
  if (driftPhase) {
    driftsBefore = next.drifts;
    next.drifts = driftsBefore.map((d) => {
      const first = CLOCKWISE.indexOf(d.dir);
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(first + k) % 4];
        const nx = d.x + DIRS[dir][0];
        const ny = d.y + DIRS[dir][1];
        if (passableForDrift(next, nx, ny)) return { x: nx, y: ny, dir };
      }
      return d;
    });
    // Step 11: collisions, in reading order of cells.
    const stacked = new Map();
    for (const d of next.drifts) {
      const k = d.x + ',' + d.y;
      stacked.set(k, (stacked.get(k) || 0) + 1);
    }
    const tiles = next.level.tiles;
    for (let y = 0; y < tiles.length; y++) {
      for (let x = 0; x < tiles[y].length; x++) {
        if ((stacked.get(x + ',' + y) || 0) < 2) continue;
        next.drifts = next.drifts.map((d) =>
          d.x === x && d.y === y ? { ...d, dir: REVERSE[d.dir] } : d
        );
        if (!next.conflicts.some((c) => c.x === x && c.y === y)) {
          next.conflicts = [...next.conflicts, { x, y, ttl: CONFLICT_TICKS }];
        }
        next.events.push('conflict');
      }
    }
  }

  // Step 12: hits. Invulnerable ticks count down and block everything.
  if (next.invuln > 0) {
    next.invuln -= 1;
  } else {
    const onCell = next.drifts.some((d) => d.x === next.player.x && d.y === next.player.y);
    let hit = onCell;
    if (!hit && driftPhase && (next.player.x !== prev.x || next.player.y !== prev.y)) {
      // A drift that swapped cells with the player: it is now where the
      // player was before step 6, and was where the player is now.
      hit = next.drifts.some((d, i) =>
        d.x === prev.x && d.y === prev.y &&
        driftsBefore[i].x === next.player.x && driftsBefore[i].y === next.player.y
      );
    }
    if (hit) {
      if (next.carried.length > 0) {
        next.carried = [];
        next.invuln = INVULN_TICKS;
        next.events.push('drop');
      } else {
        next.lives -= 1;
        next.events.push('hit');
        if (next.lives <= 0) {
          next.status = 'lost';
          next.events.push('lost');
        } else {
          next.player = { x: next.level.start.x, y: next.level.start.y };
          next.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // Step 13: spawns, while the game is still going.
  if (next.status === 'playing'
      && next.levelTicks % next.level.spawnEvery === 0
      && next.patches.length + next.carried.length < next.level.spawns.length) {
    const free = next.level.spawns.filter((s) =>
      !next.patches.some((p) => p.x === s.x && p.y === s.y)
      && !(next.player.x === s.x && next.player.y === s.y)
      && !next.drifts.some((d) => d.x === s.x && d.y === s.y));
    if (free.length > 0) {
      let r = rngInt(next.seed, free.length);
      next.seed = r.seed;
      const spot = free[r.value];
      r = rngInt(next.seed, COLORS);
      next.seed = r.seed;
      next.patches = [...next.patches, { x: spot.x, y: spot.y, color: r.value }];
      next.events.push('spawn');
    }
  }
  return next;
}
