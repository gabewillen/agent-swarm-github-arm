// The rules of Quorum Run (DESIGN.md §5 to §7): init, step, and tileAt.
// The state is plain JSON data; `step` never mutates the state, the input,
// or anything reachable from them, and every random draw goes through the
// state's seed so whole games replay from one number.
import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';

// The shipped campaign (§10) is the default of init's `options.levels`.
// Resolved once at load time so the default is exact; a missing or broken
// levels module only takes the default campaign away, not this module.
let SHIPPED_LEVELS = null;
try {
  SHIPPED_LEVELS = await import('../data/levels.js');
} catch {
  SHIPPED_LEVELS = null;
}

function shippedLevels() {
  if (SHIPPED_LEVELS !== null) return SHIPPED_LEVELS.LEVELS;
  throw new Error('no shipped levels: src/data/levels.js does not load');
}

// A drift's opposite turn of §6 step 11.
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The terrain character under a cell, '#' outside the map (§5).
export function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

// The terrain of a parsed level, as tileAt sees it (tileAt just wraps this).
function charAt(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

// A cell the player may step onto: not a wall; a hold or the exit only
// while the quorum is met; never through a live conflict (§6 step 6).
function passableForPlayer(level, open, conflicts, x, y) {
  const ch = charAt(level, x, y);
  if (ch === '#') return false;
  if ((ch === 'H' || ch === 'X') && !open) return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// A cell a drift may enter: floor or merge pad only — never a wall, a
// hold, or the exit (even when open) — and never a conflict (§6 step 10).
function passableForDrift(level, conflicts, x, y) {
  const ch = charAt(level, x, y);
  if (ch !== '.' && ch !== 'M') return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// Loading a level (§5, at init and on reaching an open exit): the fields
// every fresh level begins with, plus the next PRNG state after the
// spawn-point colours, drawn in reading order.
function loadLevel(level, seed) {
  let s = seed;
  const patches = level.spawns.map((p) => {
    const draw = rngInt(s, COLORS);
    s = draw.seed;
    return { x: p.x, y: p.y, color: draw.value };
  });
  return {
    level,
    player: { x: level.start.x, y: level.start.y },
    carried: [],
    patches,
    drifts: level.drifts.map((d) => ({ ...d })),
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
    seed: s,
  };
}

// init returns the first state (§5): the level of `options.level` (or the
// default campaign's first) with one patch per spawn point, one patch
// drawn per spawn point in reading order.
export function init(seed, options) {
  const levels =
    options !== undefined && options !== null && options.levels !== undefined && options.levels !== null
      ? options.levels
      : shippedLevels();
  let levelIndex = options === undefined || options === null ? undefined : options.level;
  if (typeof levelIndex !== 'number' || !Number.isInteger(levelIndex) || levelIndex < 0) levelIndex = 0;
  if (levelIndex >= levels.length) levelIndex = levels.length - 1;
  if (levelIndex < 0) levelIndex = 0;
  const first = loadLevel(parseLevel(levels[levelIndex]), seed >>> 0);
  return {
    seed: first.seed,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level: first.level,
    player: first.player,
    carried: first.carried,
    patches: first.patches,
    drifts: first.drifts,
    conflicts: first.conflicts,
    score: 0,
    lives: START_LIVES,
    merges: 0,
    open: false,
    invuln: 0,
    status: 'playing',
    paused: false,
    events: [],
  };
}

// The move of an input, or null for none: a missing or null input and a
// missing or unknown field all mean no move (§6 preamble).
function moveOf(input) {
  if (input === undefined || input === null) return null;
  const m = input.move;
  if (typeof m !== 'string' || !Object.prototype.hasOwnProperty.call(DIRS, m)) return null;
  return m;
}

// step returns the next state (§6), reading `state` and `input` and
// touching neither. The order of §6:
//   1 game over short-circuits, 2 pause toggles, 3 paused skips,
//   4 ticks, 5 conflicts age, 6 the player moves, 7 pickup, 8 merge,
//   9 exit, 10 drifts move, 11 drift collisions, 12 hits, 13 spawns.
export function step(state, input) {
  // 1. A finished game returns the state unchanged but with empty events.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause flips `paused` and does nothing else: not even a tick.
  if (input !== undefined && input !== null && input.pause === true) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }

  // 3. While paused the world waits.
  if (state.paused) return { ...state, events: [] };

  // 4. A tick passes. `next` mirrors `state`; nothing below reads `state`
  // again except the fields it copies at the start.
  const move = moveOf(input);
  const next = {
    ...state,
    tick: state.tick + 1,
    levelTicks: state.levelTicks + 1,
    events: [],
  };
  const level = next.level;
  const driftPeriod = level.driftPeriod;

  // 5. Conflicts age by one; those at the end of their ttl vanish.
  const aged = [];
  for (const c of state.conflicts) {
    if (c.ttl - 1 > 0) aged.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }
  next.conflicts = aged;

  // 6. The player moves one cell when the target is passable to the player.
  const before = { x: state.player.x, y: state.player.y };
  if (move !== null) {
    const tx = before.x + DIRS[move][0];
    const ty = before.y + DIRS[move][1];
    if (passableForPlayer(level, next.open, aged, tx, ty)) {
      next.player = { x: tx, y: ty };
    }
  }
  const p = next.player;

  // 7. Pickup: one patch under the player, while there is room to carry.
  if (next.carried.length < CARRY_MAX) {
    const i = next.patches.findIndex((q) => q.x === p.x && q.y === p.y);
    if (i >= 0) {
      next.carried = [...next.carried, next.patches[i].color];
      next.patches = next.patches.filter((q, j) => j !== i);
      next.events.push('pickup');
    }
  }

  // 8. Merge: empty the hands onto a merge pad for the score of §6.
  const n = next.carried.length;
  if (n > 0 && charAt(level, p.x, p.y) === 'M') {
    let same = true;
    for (let i = 1; i < n; i++) if (next.carried[i] !== next.carried[0]) same = false;
    let gain = PATCH_BASE * n * n;
    if (same && n >= 2) gain += SAME_COLOR_BONUS * n;
    next.score += gain;
    next.merges += n;
    next.carried = [];
    next.events.push('merge');
    // Quorum: the level opens once, on the first merge that reaches it.
    if (!next.open && next.merges >= level.quorum) {
      next.open = true;
      next.events.push('quorum');
    }
  }

  // 9. Exit: standing on the exit while open ships the level, and this
  // step ends here; the drifts and everything after wait for the next.
  if (next.open && charAt(level, p.x, p.y) === 'X') {
    let under = level.par - next.levelTicks;
    if (under < 0) under = 0;
    next.score += under * TIME_BONUS_PER_TICK;
    if (next.levelIndex + 1 < next.levels.length) {
      const loaded = loadLevel(parseLevel(next.levels[next.levelIndex + 1]), next.seed);
      next.level = loaded.level;
      next.levelIndex += 1;
      next.player = loaded.player;
      next.carried = loaded.carried;
      next.patches = loaded.patches;
      next.drifts = loaded.drifts;
      next.conflicts = loaded.conflicts;
      next.merges = 0;
      next.open = false;
      next.invuln = 0;
      next.levelTicks = 0;
      next.seed = loaded.seed;
      next.events.push('level');
      return next;
    }
    next.status = 'won';
    next.events.push('won');
    return next;
  }

  // 10. Drifts move on their period, each trying its own direction first,
  // then clockwise, and keeping its direction when nothing is open.
  let drifts = state.drifts;
  const driftFrom = [];
  const driftMoved = [];
  const moveTick = next.tick % driftPeriod === 0;
  if (moveTick) {
    drifts = state.drifts.map((d) => {
      driftFrom.push({ x: d.x, y: d.y });
      const start = Math.max(0, CLOCKWISE.indexOf(d.dir));
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(start + k) % 4];
        const tx = d.x + DIRS[dir][0];
        const ty = d.y + DIRS[dir][1];
        if (passableForDrift(level, aged, tx, ty)) {
          driftMoved.push(true);
          return { x: tx, y: ty, dir };
        }
      }
      driftMoved.push(false);
      return { x: d.x, y: d.y, dir: d.dir };
    });
    next.drifts = drifts;

    // 11. Collisions, reading order over the cells: every drift on a cell
    // of two or more reverses, the cell becomes a conflict (unless one is
    // already there), and the conflict event is raised once for the cell.
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        let here = 0;
        for (const d of drifts) if (d.x === x && d.y === y) here++;
        if (here < 2) continue;
        for (const d of drifts) if (d.x === x && d.y === y) d.dir = REVERSE[d.dir];
        if (!next.conflicts.some((c) => c.x === x && c.y === y)) {
          next.conflicts.push({ x, y, ttl: CONFLICT_TICKS });
        }
        next.events.push('conflict');
      }
    }
  }

  // 12. Hits, blocked for a tick by invulnerability: a drift on the
  // player's cell, or one that moved and swapped cells with the player.
  if (next.invuln > 0) {
    next.invuln -= 1;
  } else {
    let hit = false;
    for (let i = 0; i < drifts.length; i++) {
      const d = drifts[i];
      if (d.x === p.x && d.y === p.y) {
        hit = true;
        break;
      }
      const swap =
        moveTick &&
        driftMoved[i] &&
        d.x === before.x &&
        d.y === before.y &&
        driftFrom[i].x === p.x &&
        driftFrom[i].y === p.y;
      if (swap) {
        hit = true;
        break;
      }
    }
    if (hit) {
      if (next.carried.length > 0) {
        // Carrying, the patches scatter and are gone for good.
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
          next.player = { x: level.start.x, y: level.start.y };
          next.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns, when the clock is up and a spawn point is missing a patch:
  // the free spawn points, in reading order, take one point draw and then
  // one colour draw from the seed.
  const after = next.player;
  if (
    next.status === 'playing' &&
    next.levelTicks % level.spawnEvery === 0 &&
    next.patches.length + next.carried.length < level.spawns.length
  ) {
    const free = level.spawns.filter(
      (s) =>
        !next.patches.some((q) => q.x === s.x && q.y === s.y) &&
        !(after.x === s.x && after.y === s.y) &&
        !drifts.some((d) => d.x === s.x && d.y === s.y),
    );
    if (free.length > 0) {
      const spot = rngInt(next.seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      const place = free[spot.value];
      next.patches = [...next.patches, { x: place.x, y: place.y, color: color.value }];
      next.seed = color.seed;
      next.events.push('spawn');
    }
  }

  return next;
}
