// The rules (DESIGN.md §5 to §7): the game state, one tick of play, and the
// events a tick produced. Pure: state in is never mutated, state out is plain
// JSON, and randomness comes only from the state's seed (§3).
import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';

// The shipped levels (§10) are another area's module. Default init to them
// once src/data/levels.js is in place; until then init needs explicit
// options.levels.
let LEVELS;
try {
  ({ LEVELS } = await import('../data/levels.js'));
} catch {
  LEVELS = undefined;
}

// The direction opposite a drift's direction (§6 step 11).
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The terrain character of a cell, '#' where the map has nothing.
function tileIn(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

// Whether the player may step onto a cell: not a wall, not a hold or the
// exit unless open, and no conflict on it (§6 step 6).
function playerCanEnter(level, x, y, open, conflicts) {
  const t = tileIn(level, x, y);
  if (t === '#') return false;
  if (!open && (t === 'H' || t === 'X')) return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// Whether a drift may step onto a cell: not a wall, never a hold or the
// exit (open or not), and no conflict on it (§6 step 10).
function driftCanEnter(level, x, y, conflicts) {
  const t = tileIn(level, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// Load a level into a state (§5): fresh parsed level, the player at its
// start, one patch per spawn with colours drawn in reading order, copies of
// the level's drifts, and the per-level counters reset. Keeps score, lives,
// tick, and the PRNG state.
function loadLevel(state, def) {
  const level = parseLevel(def);
  let seed = state.seed;
  const patches = level.spawns.map((sp) => {
    const draw = rngInt(seed, COLORS);
    seed = draw.seed;
    return { x: sp.x, y: sp.y, color: draw.value };
  });
  return {
    ...state,
    level,
    levelTicks: 0,
    player: { x: level.start.x, y: level.start.y },
    carried: [],
    patches,
    drifts: level.drifts.map((d) => ({ ...d })),
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    seed,
  };
}

// init(seed, options) returns the first state (§5). options.levels defaults
// to the shipped LEVELS; options.level to index 0.
export function init(seed, options) {
  const opts = options ?? {};
  const levels = opts.levels ?? LEVELS;
  const levelIndex = opts.level ?? 0;
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new RangeError('init: no levels (the shipped src/data/levels.js is unavailable)');
  }
  if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= levels.length) {
    throw new RangeError('init: level index ' + levelIndex + ' is not within 0..' + (levels.length - 1));
  }
  const base = {
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    score: 0,
    lives: START_LIVES,
    status: 'playing',
    paused: false,
    events: [],
  };
  return loadLevel(base, levels[levelIndex]);
}

// The terrain character at a cell, '#' outside the map (§5).
export function tileAt(state, x, y) {
  return tileIn(state.level, x, y);
}

// A missing or null input, or a missing field, means no move and no pause
// (§6); anything else that is not a known direction is no move either.
function readInput(input) {
  const nothing = { move: null, pause: false };
  if (input === null || input === undefined || typeof input !== 'object') return nothing;
  const move = input.move !== null && input.move !== undefined && DIRS[input.move] ? input.move : null;
  return { move, pause: input.pause === true };
}

// step(state, input) returns the next state and never changes its argument
// (§6). One step, in order:
//   1 not playing   2 pause flips   3 paused   4 ticks   5 conflicts age
//   6 the player moves   7 pickup   8 merge   9 exit (ends the step)
//   10 drifts move   11 drift collisions   12 hits   13 spawns
export function step(prev, input) {
  // 1. Nothing moves in a game that is won or lost.
  if (prev.status !== 'playing') return { ...prev, events: [] };

  const { move, pause } = readInput(input);

  // 2. A pause input flips paused and ends the step.
  if (pause) {
    const paused = !prev.paused;
    return { ...prev, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // 3. A paused game ignores the tick.
  if (prev.paused) return { ...prev, events: [] };

  const level = prev.level;
  const events = [];

  // 4. Ticks grow by one.
  const tick = prev.tick + 1;
  const levelTicks = prev.levelTicks + 1;
  let score = prev.score;
  let merges = prev.merges;
  let open = prev.open;
  let status = prev.status;
  let invuln = prev.invuln;
  let lives = prev.lives;
  let seed = prev.seed;

  // 5. Conflicts age; conflicts at 0 go.
  let conflicts = prev.conflicts
    .map((c) => ({ ...c, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. The player moves one cell when the target is passable.
  const oldX = prev.player.x;
  const oldY = prev.player.y;
  let px = oldX;
  let py = oldY;
  if (move !== null) {
    const [dx, dy] = DIRS[move];
    if (playerCanEnter(level, oldX + dx, oldY + dy, open, conflicts)) {
      px = oldX + dx;
      py = oldY + dy;
    }
  }

  // 7. Pickup: a patch underfoot fills a hand (up to CARRY_MAX).
  let carried = prev.carried;
  let patches = prev.patches;
  const underfoot = patches.findIndex((p) => p.x === px && p.y === py);
  if (underfoot >= 0 && carried.length < CARRY_MAX) {
    carried = [...carried, patches[underfoot].color];
    patches = patches.filter((_, i) => i !== underfoot);
    events.push('pickup');
  }

  // 8. Merge on a merge pad: base points by size, a bonus for a
  //    same-colour merge, the quorum opens the level.
  if (tileIn(level, px, py) === 'M' && carried.length > 0) {
    const n = carried.length;
    score += PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) score += SAME_COLOR_BONUS * n;
    merges += n;
    carried = [];
    events.push('merge');
    if (!open && merges >= level.quorum) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. The exit ships the level: a time bonus under par, then the next
  //    level loads, or the game is won. Either way the step ends here.
  if (open && tileIn(level, px, py) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (prev.levelIndex + 1 < prev.levels.length) {
      events.push('level');
      return loadLevel(
        { ...prev, events, tick, levelTicks, score, levelIndex: prev.levelIndex + 1 },
        prev.levels[prev.levelIndex + 1],
      );
    }
    events.push('won');
    return { ...prev, events, tick, levelTicks, score, status: 'won' };
  }

  // 10. Drifts move on their tick, each in turn clockwise from its own
  //     direction, ignoring the player, patches, and each other.
  let drifts = prev.drifts;
  const prevDrifts = prev.drifts;
  if (tick % level.driftPeriod === 0) {
    const hasConflictAt = (x, y) => conflicts.some((c) => c.x === x && c.y === y);
    drifts = prevDrifts.map((d) => {
      const from = CLOCKWISE.indexOf(d.dir);
      for (let i = 0; i < 4; i++) {
        const dir = CLOCKWISE[(from + i) % 4];
        const [dx, dy] = DIRS[dir];
        if (driftCanEnter(level, d.x + dx, d.y + dy, conflicts)) {
          return { x: d.x + dx, y: d.y + dy, dir };
        }
      }
      return { x: d.x, y: d.y, dir: d.dir };
    });

    // 11. Two or more drifts on a cell, in reading order, reverse and
    //     leave a conflict there.
    const byCell = new Map();
    for (const d of drifts) {
      const key = d.y + ',' + d.x;
      const list = byCell.get(key);
      if (list) list.push(d);
      else byCell.set(key, [d]);
    }
    const cells = [...byCell.keys()].map((k) => k.split(',').map(Number));
    cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [cy, cx] of cells) {
      const list = byCell.get(cy + ',' + cx);
      if (list.length < 2) continue;
      for (const d of list) d.dir = REVERSE[d.dir];
      if (!hasConflictAt(cx, cy)) conflicts = [...conflicts, { x: cx, y: cy, ttl: CONFLICT_TICKS }];
      events.push('conflict');
    }
  }

  // 12. Hits: an invulnerable player just spends a tick of immunity;
  //     otherwise a drift on the player's cell, or a drift that swapped
  //     cells with the player this step, is a hit — a drop while carrying,
  //     a lost life (back to the start) when not, and lost at zero lives.
  if (invuln > 0) {
    invuln -= 1;
  } else {
    const hit = drifts.some((d, i) =>
      (d.x === px && d.y === py) ||
      (d.x === oldX && d.y === oldY && prevDrifts[i].x === px && prevDrifts[i].y === py));
    if (hit) {
      if (carried.length > 0) {
        carried = [];
        invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        lives -= 1;
        events.push('hit');
        if (lives <= 0) {
          status = 'lost';
          events.push('lost');
        } else {
          px = level.start.x;
          py = level.start.y;
          invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns: a patch comes back on a free spawn point, point first,
  //     then colour, in the seed's order.
  if (status === 'playing' &&
      levelTicks % level.spawnEvery === 0 &&
      patches.length + carried.length < level.spawns.length) {
    const hasPatchAt = (x, y) => patches.some((p) => p.x === x && p.y === y);
    const hasDriftAt = (x, y) => drifts.some((d) => d.x === x && d.y === y);
    const free = level.spawns.filter((sp) =>
      !hasPatchAt(sp.x, sp.y) && !(sp.x === px && sp.y === py) && !hasDriftAt(sp.x, sp.y));
    if (free.length > 0) {
      const point = rngInt(seed, free.length);
      const colour = rngInt(point.seed, COLORS);
      seed = colour.seed;
      patches = [...patches, { x: free[point.value].x, y: free[point.value].y, color: colour.value }];
      events.push('spawn');
    }
  }

  return {
    ...prev,
    events,
    tick,
    levelTicks,
    score,
    merges,
    open,
    status,
    invuln,
    lives,
    seed,
    player: { x: px, y: py },
    carried,
    patches,
    conflicts,
    drifts,
  };
}
