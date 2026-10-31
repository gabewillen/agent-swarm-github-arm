// DESIGN.md §5-§7: the rules of Quorum Run. Pure core: init, step, and
// tileAt return fresh plain data, never change what they are given, and
// draw randomness only from the state's seed (§3).
import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { parseLevel } from './level.js';
import { rngInt } from './rng.js';

// §10: the shipped levels are the default set. A guarded dynamic import so
// a missing or failing src/data/levels.js costs only the tests that need
// the shipped set; every other caller passes its levels in options.
let shipped = [];
try {
  const mod = await import('../data/levels.js');
  if (Array.isArray(mod.LEVELS)) shipped = mod.LEVELS;
} catch {
  // data/levels.js is not here (or not valid) yet.
}
const LEVELS = shipped;

// §6 step 11: a cell collision reverses each drift's direction.
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// A shallow-fresh copy of a state: arrays and cells are duplicated, the
// parsed level and definitions are shared but never mutated.
function clone(state) {
  return {
    ...state,
    player: { ...state.player },
    carried: [...state.carried],
    patches: state.patches.map((p) => ({ ...p })),
    drifts: state.drifts.map((d) => ({ ...d })),
    conflicts: state.conflicts.map((c) => ({ ...c })),
    events: [],
  };
}

// §5: loading a level keeps score, lives, tick, and the PRNG state, and
// resets everything per-level. Mutates the (already fresh) state it gets.
function loadLevel(s, index) {
  const level = parseLevel(s.levels[index]);
  s.level = level;
  s.player = { ...level.start };
  let seed = s.seed;
  // One colour draw per spawn point, in reading order.
  s.patches = level.spawns.map((sp) => {
    const draw = rngInt(seed, COLORS);
    seed = draw.seed;
    return { x: sp.x, y: sp.y, color: draw.value };
  });
  s.seed = seed;
  s.drifts = level.drifts.map((d) => ({ ...d }));
  s.carried = [];
  s.conflicts = [];
  s.merges = 0;
  s.open = false;
  s.invuln = 0;
  s.levelTicks = 0;
}

// §5: init(seed, options) returns the first state. options.levels
// (default the shipped LEVELS) and options.level (default 0).
export function init(seed, options) {
  const opts = options ?? {};
  const levels = opts.levels !== undefined ? opts.levels : LEVELS;
  const levelIndex = opts.level !== undefined ? opts.level : 0;
  const s = {
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
  loadLevel(s, levelIndex);
  return s;
}

// §5: the terrain character at a cell, '#' outside the map.
export function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined) return '#';
  const ch = row[x];
  return ch === undefined ? '#' : ch;
}

function conflictAt(state, x, y) {
  return state.conflicts.some((c) => c.x === x && c.y === y);
}

// Passable to the player: not a wall, hold or exit only while open, and
// no conflict on it (§6 step 6).
function passableForPlayer(state, x, y) {
  const tile = tileAt(state, x, y);
  if (tile === '#') return false;
  if ((tile === 'H' || tile === 'X') && !state.open) return false;
  return !conflictAt(state, x, y);
}

// Passable to a drift: not a wall, never a hold or the exit, and no
// conflict on it (§6 step 10).
function passableForDrift(state, x, y) {
  const tile = tileAt(state, x, y);
  if (tile === '#' || tile === 'H' || tile === 'X') return false;
  return !conflictAt(state, x, y);
}

// §6: step(state, input) returns the next state; the argument is not
// changed. input is { move, pause }; a missing or null input means no
// move and no pause.
export function step(state, input) {
  const move = input && typeof input === 'object' ? input.move : null;
  const pause = !!(input && input.pause);

  // 1. a finished game no longer changes.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. a pause input flips paused and ends the step.
  if (pause) {
    return state.paused
      ? { ...state, paused: false, events: ['resume'] }
      : { ...state, paused: true, events: ['pause'] };
  }

  // 3. a paused game does not tick.
  if (state.paused) return { ...state, events: [] };

  const n = clone(state);
  const events = [];
  n.events = events;

  // 4. the clocks grow by one.
  n.tick++;
  n.levelTicks++;

  // 5. conflicts age; those at 0 go.
  n.conflicts = n.conflicts.filter((c) => --c.ttl > 0);

  // 6. the player tries one cell in move's direction.
  const pre = { ...n.player };
  if (move !== null && DIRS[move] !== undefined) {
    const [dx, dy] = DIRS[move];
    const x = pre.x + dx;
    const y = pre.y + dy;
    if (passableForPlayer(n, x, y)) {
      n.player = { x, y };
    }
  }

  // 7. pickup, when hands are not full.
  if (n.carried.length < CARRY_MAX) {
    const i = n.patches.findIndex((p) => p.x === n.player.x && p.y === n.player.y);
    if (i !== -1) {
      n.carried.push(n.patches[i].color);
      n.patches.splice(i, 1);
      events.push('pickup');
    }
  }

  // 8. merge on a merge pad with patches in hand.
  if (tileAt(n, n.player.x, n.player.y) === 'M' && n.carried.length > 0) {
    const count = n.carried.length;
    let gain = PATCH_BASE * count * count;
    if (count >= 2 && n.carried.every((c) => c === n.carried[0])) {
      gain += SAME_COLOR_BONUS * count;
    }
    n.score += gain;
    n.merges += count;
    n.carried = [];
    events.push('merge');
    if (!n.open && n.merges >= n.level.quorum) {
      n.open = true;
      events.push('quorum');
    }
  }

  // 9. the exit: ends the step before the drifts move.
  if (n.open && tileAt(n, n.player.x, n.player.y) === 'X') {
    n.score += Math.max(0, n.level.par - n.levelTicks) * TIME_BONUS_PER_TICK;
    if (n.levelIndex + 1 < n.levels.length) {
      n.levelIndex++;
      loadLevel(n, n.levelIndex);
      events.push('level');
    } else {
      n.status = 'won';
      events.push('won');
    }
    return n;
  }

  // 10 + 11. drifts move on their ticks; cells holding two or more get a
  // conflict and reversed directions, in reading order.
  let driftsMoved = false;
  const movedFrom = [];
  if (n.tick % n.level.driftPeriod === 0) {
    driftsMoved = true;
    for (const drift of n.drifts) {
      movedFrom.push({ ...drift });
      const facing = CLOCKWISE.indexOf(drift.dir);
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(facing + k) % 4];
        const [dx, dy] = DIRS[dir];
        const x = drift.x + dx;
        const y = drift.y + dy;
        if (passableForDrift(n, x, y)) {
          drift.dir = dir;
          drift.x = x;
          drift.y = y;
          break;
        }
      }
    }
    const byCell = new Map();
    n.drifts.forEach((d, i) => {
      const key = d.y + ':' + d.x;
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key).push(i);
    });
    const cells = [...byCell.keys()]
      .map((key) => key.split(':').map(Number))
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [y, x] of cells) {
      const here = byCell.get(y + ':' + x);
      if (here.length < 2) continue;
      for (const i of here) n.drifts[i].dir = REVERSE[n.drifts[i].dir];
      if (!conflictAt(n, x, y)) n.conflicts.push({ x, y, ttl: CONFLICT_TICKS });
      events.push('conflict');
    }
  }

  // 12. hits, unless invulnerable (which still counts down).
  if (n.invuln > 0) {
    n.invuln--;
  } else {
    const onPlayer = n.drifts.some((d) => d.x === n.player.x && d.y === n.player.y);
    const swapped = driftsMoved && n.drifts.some((d, i) =>
      d.x === pre.x && d.y === pre.y &&
      movedFrom[i].x === n.player.x && movedFrom[i].y === n.player.y);
    if (onPlayer || swapped) {
      if (n.carried.length > 0) {
        // Carrying, a hit costs the patches, not a life.
        n.carried = [];
        n.invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        n.lives--;
        events.push('hit');
        if (n.lives <= 0) {
          n.status = 'lost';
          events.push('lost');
        } else {
          n.player = { ...n.level.start };
          n.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. spawns, while still playing and every spawnEvery level ticks.
  if (n.status === 'playing' &&
      n.levelTicks % n.level.spawnEvery === 0 &&
      n.patches.length + n.carried.length < n.level.spawns.length) {
    const free = n.level.spawns.filter((sp) =>
      !n.patches.some((p) => p.x === sp.x && p.y === sp.y) &&
      !(sp.x === n.player.x && sp.y === n.player.y) &&
      !n.drifts.some((d) => d.x === sp.x && d.y === sp.y));
    if (free.length > 0) {
      const index = rngInt(n.seed, free.length);
      const color = rngInt(index.seed, COLORS);
      n.patches.push({ x: free[index.value].x, y: free[index.value].y, color: color.value });
      n.seed = color.seed;
      events.push('spawn');
    }
  }

  return n;
}
