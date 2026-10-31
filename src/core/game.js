// §5 to §7: the rules. `init(seed, options)` builds the first state, `step
// (state, input)` returns the next state and never changes its argument or
// anything in it, and `tileAt(state, x, y)` reads the terrain. Pure core:
// no clock, no Math.random, no DOM — randomness comes only from the state's
// seed (§3), and every draw replaces it.
import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';

// The shipped levels of §10, loaded when the file exists so that the rules
// keep working while src/data/levels.js is still on its way.
let LEVELS = [];
try {
  LEVELS = (await import('../data/levels.js')).LEVELS;
} catch {
  LEVELS = [];
}

const WALL = '#';
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The terrain at a cell of a parsed level, '#' off the map (§5).
function tileOf(level, x, y) {
  const row = level && Array.isArray(level.tiles) ? level.tiles[y] : undefined;
  if (typeof row !== 'string' || !Number.isInteger(x) || x < 0 || x >= row.length) return WALL;
  return row[x];
}

export function tileAt(state, x, y) {
  return tileOf(state && state.level, x, y);
}

// Terrain a player may enter: floor, a merge pad, and holds or the exit
// once the quorum is reached. Conflicts are checked by the caller.
function playerTerrain(n, open, x, y) {
  const t = tileOf(n.level, x, y);
  return t === '.' || t === 'M' || (open && (t === 'H' || t === 'X'));
}

function conflictOn(cells, x, y) {
  return cells.some((c) => c.x === x && c.y === y);
}

// Load a level into a state that is being built: the parsed level, the
// player at the start, a fresh patch per spawn with colour draws from the
// running seed, copied drifts, and the per-level fields reset (§5).
function loadLevel(state, def) {
  state.level = parseLevel(def);
  state.player = { x: state.level.start.x, y: state.level.start.y };
  const patches = [];
  let seed = state.seed;
  for (const sp of state.level.spawns) {
    const draw = rngInt(seed, COLORS);
    patches.push({ x: sp.x, y: sp.y, color: draw.value });
    seed = draw.seed;
  }
  state.patches = patches;
  state.seed = seed;
  state.drifts = state.level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  state.carried = [];
  state.conflicts = [];
  state.merges = 0;
  state.open = false;
  state.invuln = 0;
  state.levelTicks = 0;
}

export function init(seed, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const levels = Array.isArray(opts.levels) ? opts.levels : LEVELS;
  const levelIndex = Number.isInteger(opts.level) ? opts.level : 0;
  if (levelIndex < 0 || levelIndex >= levels.length) {
    throw new Error(`invalid level index ${levelIndex} of ${levels.length}`);
  }
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

export function step(state, input) {
  if (!state || typeof state !== 'object') return state;
  const inp = input && typeof input === 'object' ? input : {};
  const move = typeof inp.move === 'string' && DIRS[inp.move] ? inp.move : null;
  const pause = inp.pause === true;

  // 1. An ended game returns unchanged but with empty events.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. Pausing: flip paused, emit pause or resume, change nothing else.
  if (pause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }

  // 3. While paused, nothing happens.
  if (state.paused) return { ...state, events: [] };

  const n = { ...state };
  const level = state.level;
  const spawns = level.spawns;

  // 4. A playing step ticks.
  n.tick = state.tick + 1;
  n.levelTicks = state.levelTicks + 1;
  n.events = [];

  // 5. Conflicts age by one and those at 0 go.
  n.conflicts = (state.conflicts ?? [])
    .map((c) => ({ ...c, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. The player moves one cell when the target is passable and conflict-free.
  const before = { x: state.player.x, y: state.player.y };
  let px = before.x;
  let py = before.y;
  if (move) {
    const tx = before.x + DIRS[move][0];
    const ty = before.y + DIRS[move][1];
    if (playerTerrain(n, state.open, tx, ty) && !conflictOn(n.conflicts, tx, ty)) {
      px = tx;
      py = ty;
    }
  }
  n.player = { x: px, y: py };

  // 7. Pickup: a patch under the player joins the carry in pickup order.
  n.carried = (state.carried ?? []).slice();
  n.patches = (state.patches ?? []).map((p) => ({ ...p }));
  const under = n.patches.findIndex((p) => p.x === px && p.y === py);
  if (under >= 0 && n.carried.length < CARRY_MAX) {
    n.carried.push(n.patches[under].color);
    n.patches.splice(under, 1);
    n.events.push('pickup');
  }

  // 8. Merge on a pad with a full cargo (after this step's pickup).
  if (tileOf(level, px, py) === 'M' && n.carried.length > 0) {
    const m = n.carried.length;
    let gain = PATCH_BASE * m * m;
    if (m >= 2 && n.carried.every((c) => c === n.carried[0])) {
      gain += SAME_COLOR_BONUS * m;
    }
    n.score = n.score + gain;
    n.merges = n.merges + m;
    n.carried = [];
    n.events.push('merge');
    if (!n.open && n.merges >= level.quorum) {
      n.open = true;
      n.events.push('quorum');
    }
  }

  // 9. The exit ships the level once it is open: a time bonus, then the
  //    next level or the win, and the step ends before the drifts act.
  if (n.open && tileOf(level, px, py) === 'X') {
    n.score = n.score + Math.max(0, level.par - n.levelTicks) * TIME_BONUS_PER_TICK;
    if (n.levelIndex + 1 < n.levels.length) {
      n.levelIndex = n.levelIndex + 1;
      loadLevel(n, n.levels[n.levelIndex]);
      n.events.push('level');
    } else {
      n.status = 'won';
      n.events.push('won');
    }
    return n;
  }

  // 10. On a drift tick each drift tries its direction and then clockwise
  //     ones, moving through floor, pads, and only conflict-free cells;
  //     walls, holds, and the exit always stop a drift.
  const driftTick = n.tick % (level.driftPeriod > 0 ? level.driftPeriod : 1) === 0;
  n.drifts = (state.drifts ?? []).map((d) => ({ ...d }));
  if (driftTick) {
    for (const d of n.drifts) {
      const first = CLOCKWISE.indexOf(d.dir);
      const start = first >= 0 ? first : 0;
      for (let i = 0; i < 4; i++) {
        const dir = CLOCKWISE[(start + i) % 4];
        const tx = d.x + DIRS[dir][0];
        const ty = d.y + DIRS[dir][1];
        const t = tileOf(level, tx, ty);
        if (t === WALL || t === 'H' || t === 'X') continue;
        if (conflictOn(n.conflicts, tx, ty)) continue;
        d.x = tx;
        d.y = ty;
        d.dir = dir;
        break;
      }
    }

    // 11. Cells holding two or more drifts, in reading order, conflict:
    //     every drift there reverses, a conflict lands unless one is on
    //     the cell already, and one event fires for the cell.
    const cells = [];
    for (const d of n.drifts) {
      if (!cells.some((q) => q.x === d.x && q.y === d.y)) cells.push({ x: d.x, y: d.y });
    }
    cells.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    for (const cell of cells) {
      const here = n.drifts.filter((d) => d.x === cell.x && d.y === cell.y);
      if (here.length < 2) continue;
      for (const d of here) d.dir = REVERSE[d.dir] ?? d.dir;
      if (!conflictOn(n.conflicts, cell.x, cell.y)) {
        n.conflicts.push({ x: cell.x, y: cell.y, ttl: CONFLICT_TICKS });
      }
      n.events.push('conflict');
    }
  }

  // 12. Hits: a drift on the player's cell, or a swap with one that moved
  //     this step. Carrying drops the cargo; empty-handed costs a life.
  if (n.invuln > 0) {
    n.invuln = n.invuln - 1;
  } else {
    const onCell = n.drifts.some((d) => d.x === px && d.y === py);
    const swapped = driftTick && state.drifts.some((od, i) => {
      const nd = n.drifts[i];
      return !!nd && nd.x === before.x && nd.y === before.y
        && od.x === px && od.y === py;
    });
    if (onCell || swapped) {
      if (n.carried.length > 0) {
        n.carried = [];
        n.invuln = INVULN_TICKS;
        n.events.push('drop');
      } else {
        n.lives = state.lives - 1;
        n.events.push('hit');
        if (n.lives <= 0) {
          n.status = 'lost';
          n.events.push('lost');
        } else {
          n.player = { x: level.start.x, y: level.start.y };
          n.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns follow levelTicks: at most one patch per spawn tick, drawn
  //     from the running seed (spot first, then colour) onto a free point —
  //     one without a patch, the player, or a drift on it.
  if (n.status === 'playing'
    && level.spawnEvery > 0 && n.levelTicks % level.spawnEvery === 0
    && n.patches.length + n.carried.length < spawns.length) {
    const free = spawns.filter((s) => !n.patches.some((p) => p.x === s.x && p.y === s.y)
      && !(n.player.x === s.x && n.player.y === s.y)
      && !n.drifts.some((d) => d.x === s.x && d.y === s.y));
    if (free.length > 0) {
      const spot = rngInt(n.seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      n.seed = color.seed;
      n.patches.push({ x: free[spot.value].x, y: free[spot.value].y, color: color.value });
      n.events.push('spawn');
    }
  }

  return n;
}
