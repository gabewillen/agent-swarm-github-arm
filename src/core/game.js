// The rules of Quorum Run (DESIGN.md §5 to §7).
//
// init(seed, options) builds the first state; step(state, input) returns the
// next state and never changes the state, its arrays, or the input it is
// given. Every state is plain JSON data; randomness comes only from the
// state's seed, drawn through rngInt and written back on every use.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS,
  DIRS, CLOCKWISE,
} from './constants.js';
import { parseLevel } from './level.js';
import { rngInt } from './rng.js';

// The shipped campaign is the default levels list. Loaded dynamically so the
// core stays loadable while src/data/levels.js is being written; init taking
// options.levels always works.
let LEVELS = [];
try {
  ({ LEVELS } = await import('../data/levels.js'));
} catch {
  LEVELS = []; // not shipped yet: callers supply their own levels
}
if (!Array.isArray(LEVELS)) LEVELS = [];

// The opposite facing, for two drifts that meet head-on and reverse (§6.11).
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The terrain character of a level's cell, '#' outside the map (§5).
function tileOf(level, x, y) {
  if (y < 0 || y >= level.height) return '#';
  const row = level.tiles[y];
  if (x < 0 || x >= level.width || row[x] === undefined) return '#';
  return row[x];
}

// tileAt(state, x, y) (§5): the level's terrain at a cell, '#' outside.
export function tileAt(state, x, y) {
  return tileOf(state.level, x, y);
}

// Can the player enter this cell? Not a wall; not a closed hold door or the
// closed exit (§6.6); never a conflict (§6.6). Patches and merge pads never
// block.
function playerPassable(level, conflicts, x, y, open) {
  const tile = tileOf(level, x, y);
  if (tile === '#') return false;
  if (!open && (tile === 'H' || tile === 'X')) return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// Can a drift enter this cell? Not a wall, not a hold, not the exit (open or
// not), and no conflict on it (§6.10). Drifts pass over merge pads, patches,
// and the player.
function driftPassable(level, conflicts, x, y) {
  const tile = tileOf(level, x, y);
  if (tile === '#' || tile === 'H' || tile === 'X') return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// Load level `index` into the state: the fields of §5's loading rule, with
// fresh patch colours drawn from the running seed. Keeps score, lives, tick,
// and everything else the caller carries over (§5).
function loadLevel(s, index) {
  const parsed = parseLevel(s.levels[index]);
  s.levelIndex = index;
  s.level = parsed;
  s.player = { x: parsed.start.x, y: parsed.start.y };
  s.drifts = parsed.drifts.map((d) => ({ ...d }));
  s.carried = [];
  s.conflicts = [];
  s.patches = [];
  s.merges = 0;
  s.open = false;
  s.invuln = 0;
  s.levelTicks = 0;
  for (const spawn of parsed.spawns) {
    const r = rngInt(s.seed, COLORS);
    s.seed = r.seed;
    s.patches.push({ x: spawn.x, y: spawn.y, color: r.value });
  }
}

// init(seed, options) (§5).
export function init(seed, options) {
  const opts = options ?? {};
  const s = {
    seed: seed >>> 0,
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
  loadLevel(s, s.levelIndex);
  return s;
}

// step(state, input) (§6), in the order the design lists.
export function step(state, input) {
  const inp = input ?? {};
  const move = DIRS[inp.move] !== undefined ? inp.move : null;
  const pause = inp.pause === true;

  // 1. A game that is not playing no longer changes, but its events emptied.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause input flips `paused` and nothing else happens.
  if (pause) {
    const paused = !state.paused;
    return { ...state, paused, events: paused ? ['pause'] : ['resume'] };
  }

  // 3. While paused nothing moves, no tick passes, no conflict ages.
  if (state.paused) return { ...state, events: [] };

  // Copy the state: `step` never changes its argument.
  const s = {
    ...state,
    carried: state.carried.slice(),
    drifts: state.drifts.map((d) => ({ ...d })),
    patches: state.patches.map((p) => ({ ...p })),
    conflicts: state.conflicts.map((c) => ({ ...c })),
    events: [],
  };

  // 4. A playing step ticks.
  s.tick += 1;
  s.levelTicks += 1;

  // 5. Conflicts age by one; those that reach 0 go.
  const aged = [];
  for (const c of s.conflicts) {
    if (c.ttl > 1) aged.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }
  s.conflicts = aged;

  // Where the player stood before this step's move, for swap detection in 12.
  const wasX = state.player.x;
  const wasY = state.player.y;

  // 6. The player moves one cell when the target is passable.
  if (move !== null) {
    const [dx, dy] = DIRS[move];
    const nx = s.player.x + dx;
    const ny = s.player.y + dy;
    if (playerPassable(s.level, s.conflicts, nx, ny, s.open)) {
      s.player = { x: nx, y: ny };
    }
  }
  const nowX = s.player.x;
  const nowY = s.player.y;

  // 7. Pickup: a patch under the player, with hands free.
  const under = s.patches.findIndex((p) => p.x === nowX && p.y === nowY);
  if (under !== -1 && s.carried.length < CARRY_MAX) {
    const [picked] = s.patches.splice(under, 1);
    s.carried.push(picked.color);
    s.events.push('pickup');
  }

  // 8. Merge: on a merge pad with patches in hand.
  if (tileOf(s.level, nowX, nowY) === 'M' && s.carried.length > 0) {
    const n = s.carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && s.carried.every((c) => c === s.carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    s.score += gain;
    s.merges += n;
    s.carried = [];
    s.events.push('merge');
    if (!s.open && s.merges >= s.level.quorum) {
      s.open = true;
      s.events.push('quorum');
    }
  }

  // 9. Exit: shipping the level ends the step before the drifts move.
  if (s.open && tileOf(s.level, nowX, nowY) === 'X') {
    s.score += Math.max(0, s.level.par - s.levelTicks) * TIME_BONUS_PER_TICK;
    if (s.levelIndex + 1 < s.levels.length) {
      loadLevel(s, s.levelIndex + 1);
      s.events.push('level');
    } else {
      s.status = 'won';
      s.events.push('won');
    }
    return s;
  }

  // 10. Drifts move on their ticks, in array order, trying their direction
  // and then the directions clockwise to the first passable target.
  const driftsMove = s.tick % s.level.driftPeriod === 0;
  const driftWas = s.drifts.map((d) => ({ x: d.x, y: d.y }));
  if (driftsMove) {
    for (const d of s.drifts) {
      const first = CLOCKWISE.indexOf(d.dir);
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(first + k) % 4];
        const nx = d.x + DIRS[dir][0];
        const ny = d.y + DIRS[dir][1];
        if (driftPassable(s.level, s.conflicts, nx, ny)) {
          d.dir = dir;
          d.x = nx;
          d.y = ny;
          break;
        }
      }
      // No passable direction: the drift stays and keeps its direction.
    }
  }

  // 11. Drift collisions, on the ticks drifts moved: cells in reading order
  // holding two or more drifts reverse them and leave a conflict.
  if (driftsMove) {
    const stacks = new Map();
    for (const d of s.drifts) {
      const key = d.x + ',' + d.y;
      const list = stacks.get(key);
      if (list === undefined) stacks.set(key, [d]);
      else list.push(d);
    }
    const cells = [];
    for (const [key, list] of stacks) {
      if (list.length >= 2) {
        const [x, y] = key.split(',').map(Number);
        cells.push({ x, y, list });
      }
    }
    cells.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const { x, y, list } of cells) {
      for (const d of list) d.dir = OPPOSITE[d.dir];
      if (!s.conflicts.some((c) => c.x === x && c.y === y)) {
        s.conflicts.push({ x, y, ttl: CONFLICT_TICKS });
      }
      s.events.push('conflict');
    }
  }

  // 12. Hits: immunity counts down; otherwise a drift on the player's cell or
  // a drift that swapped cells with the player this step hits.
  if (s.invuln > 0) {
    s.invuln -= 1;
  } else {
    const onCell = s.drifts.some((d) => d.x === nowX && d.y === nowY);
    const swapped = s.drifts.some((d, i) =>
      d.x === wasX && d.y === wasY &&
      driftWas[i].x === nowX && driftWas[i].y === nowY);
    if (onCell || swapped) {
      if (s.carried.length > 0) {
        s.carried = [];
        s.invuln = INVULN_TICKS;
        s.events.push('drop');
      } else {
        s.lives -= 1;
        s.events.push('hit');
        if (s.lives <= 0) {
          s.status = 'lost';
          s.events.push('lost');
        } else {
          s.player = { x: s.level.start.x, y: s.level.start.y };
          s.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. A patch spawns when the level's spawn tick comes round, on a free
  // spawn point, from the running seed: the spot first, then the colour.
  if (
    s.status === 'playing' &&
    s.levelTicks % s.level.spawnEvery === 0 &&
    s.patches.length + s.carried.length < s.level.spawns.length
  ) {
    const lying = new Set(s.patches.map((p) => p.x + ',' + p.y));
    const free = s.level.spawns.filter((p) =>
      !lying.has(p.x + ',' + p.y) &&
      !(p.x === s.player.x && p.y === s.player.y) &&
      !s.drifts.some((d) => d.x === p.x && d.y === p.y));
    if (free.length > 0) {
      const spot = rngInt(s.seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      s.seed = color.seed;
      s.patches.push({
        x: free[spot.value].x,
        y: free[spot.value].y,
        color: color.value,
      });
      s.events.push('spawn');
    }
  }

  return s;
}
