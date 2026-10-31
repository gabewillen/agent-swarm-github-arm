// §5 to §7: the core rules. step() copies everything it changes and never
// touches the state it is given; every returned state is plain JSON data.
// Randomness comes only from the state's seed, through the PRNG of §3.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK,
  COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';

// The shipped levels (§10) are init's default. src/data/levels.js is
// another module of this game that may not exist yet when this module is
// being brought up, so it loads best-effort; with explicit options the
// game never needs it.
let SHIPPED_LEVELS = null;
try {
  SHIPPED_LEVELS = (await import('../data/levels.js')).LEVELS ?? null;
} catch {
  SHIPPED_LEVELS = null;
}

export function tileAt(state, x, y) {
  const level = state.level;
  if (!Number.isInteger(x) || !Number.isInteger(y) || y < 0 || y >= level.height || x < 0 || x >= level.width) {
    return '#';
  }
  return level.tiles[y][x];
}

function conflictOnTile(state, x, y) {
  return state.conflicts.some((c) => c.x === x && c.y === y);
}

// Passable to the player: not a wall, not a hold or the exit unless open,
// and no conflict on it (§6 step 6).
function playerCanEnter(st, x, y) {
  const t = tileAt(st, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !st.open) return false;
  return !conflictOnTile(st, x, y);
}

// Passable to a drift: not a wall, not a hold, not the exit (open or
// not), and no conflict on it. Pads, patches, the player, and other
// drifts are ignored while moving (§6 steps 10).
function driftCanEnter(st, x, y) {
  const t = tileAt(st, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !conflictOnTile(st, x, y);
}

const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

const MOVE_KEYS = new Set(Object.keys(DIRS));

// Loads a level into the working state: parse, player, drifts, per-level
// counters, and a fresh patch with a fresh colour draw per spawn point,
// in reading order (§5).
function loadLevel(st, index) {
  const level = parseLevel(st.levels[index]);
  st.levelIndex = index;
  st.level = level;
  st.player = { x: level.start.x, y: level.start.y };
  st.drifts = level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  st.carried = [];
  st.conflicts = [];
  st.merges = 0;
  st.open = false;
  st.invuln = 0;
  st.levelTicks = 0;
  const patches = [];
  for (const spawn of level.spawns) {
    const drawn = rngInt(st.seed, COLORS);
    st.seed = drawn.seed;
    patches.push({ x: spawn.x, y: spawn.y, color: drawn.value });
  }
  st.patches = patches;
}

export function init(seed, options) {
  const opts = options ?? null;
  const levels = opts && opts.levels !== undefined ? opts.levels : (SHIPPED_LEVELS ?? []);
  const chosen = opts && opts.level !== undefined ? opts.level : 0;
  let levelIndex = 0;
  if (Number.isInteger(chosen) && levels.length > 0) {
    levelIndex = Math.min(Math.max(chosen, 0), levels.length - 1);
  }
  const st = {
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level: parseLevel(levels[0]),
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
  loadLevel(st, levelIndex);
  return st;
}

export function step(state, input) {
  // 1. A game that is over changes nothing but its events.
  if (state.status !== 'playing') {
    return { ...state, events: [] };
  }

  const given = input ?? null;
  let move = null;
  let pause = false;
  if (given && typeof given === 'object') {
    move = MOVE_KEYS.has(given.move) ? given.move : null;
    pause = given.pause === true;
  }

  // 2. A pause flips paused and does nothing else.
  if (pause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }
  // 3. While paused nothing happens.
  if (state.paused) {
    return { ...state, events: [] };
  }

  // 4. The clock ticks.
  const st = {
    ...state,
    player: { ...state.player },
    carried: state.carried.slice(),
    patches: state.patches.slice(),
    drifts: state.drifts.map((d) => ({ ...d })),
    conflicts: state.conflicts.slice(),
    tick: state.tick + 1,
    levelTicks: state.levelTicks + 1,
    events: [],
  };
  const driftsBefore = state.drifts;

  // 5. Conflicts age.
  st.conflicts = st.conflicts
    .map((c) => ({ ...c, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. The player moves.
  const playerBefore = { ...st.player };
  if (move !== null) {
    const [dx, dy] = DIRS[move];
    const nx = st.player.x + dx;
    const ny = st.player.y + dy;
    if (playerCanEnter(st, nx, ny)) {
      st.player = { x: nx, y: ny };
    }
  }

  // 7. Pickup.
  const here = st.patches.filter((p) => p.x === st.player.x && p.y === st.player.y);
  const canTake = Math.min(here.length, CARRY_MAX - st.carried.length);
  if (canTake > 0) {
    let taken = 0;
    const pickedColors = [];
    const left = [];
    for (const p of st.patches) {
      if (taken < canTake && p.x === st.player.x && p.y === st.player.y) {
        pickedColors.push(p.color);
        taken++;
      } else {
        left.push(p);
      }
    }
    st.patches = left;
    st.carried = st.carried.concat(pickedColors);
    for (let i = 0; i < taken; i++) st.events.push('pickup');
  }

  // 8. Merge.
  if (tileAt(st, st.player.x, st.player.y) === 'M' && st.carried.length > 0) {
    const n = st.carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && st.carried.every((c) => c === st.carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    st.score += gain;
    st.merges += n;
    st.carried = [];
    st.events.push('merge');
    if (!st.open && st.merges >= st.level.quorum) {
      st.open = true;
      st.events.push('quorum');
    }
  }

  // 9. Exit: the step ends here, before the drifts move.
  if (st.open && tileAt(st, st.player.x, st.player.y) === 'X') {
    st.score += Math.max(0, (st.level.par - st.levelTicks)) * TIME_BONUS_PER_TICK;
    if (st.levelIndex + 1 < st.levels.length) {
      loadLevel(st, st.levelIndex + 1);
      st.events.push('level');
    } else {
      st.status = 'won';
      st.events.push('won');
    }
    return st;
  }

  // 10. Drifts move on their period.
  let driftsMoved = false;
  if (st.tick % st.level.driftPeriod === 0) {
    driftsMoved = true;
    const moved = [];
    for (const d of st.drifts) {
      const ring = CLOCKWISE.length;
      const at = ((CLOCKWISE.indexOf(d.dir) % ring) + ring) % ring;
      let placed = false;
      for (let k = 0; k < ring; k++) {
        const dir = CLOCKWISE[(at + k) % ring];
        const [dx, dy] = DIRS[dir];
        const nx = d.x + dx;
        const ny = d.y + dy;
        if (driftCanEnter(st, nx, ny)) {
          moved.push({ x: nx, y: ny, dir });
          placed = true;
          break;
        }
      }
      if (!placed) moved.push({ x: d.x, y: d.y, dir: d.dir });
    }
    st.drifts = moved;

    // 11. Collision, cell by cell in reading order, only when drifts moved.
    const cells = new Map();
    for (let i = 0; i < st.drifts.length; i++) {
      const d = st.drifts[i];
      const key = `${d.x},${d.y}`;
      let list = cells.get(key);
      if (list === undefined) {
        list = [];
        cells.set(key, list);
      }
      list.push(i);
    }
    const clashes = [...cells.entries()]
      .filter(([, list]) => list.length >= 2)
      .map(([key, list]) => {
        const [x, y] = key.split(',').map(Number);
        return { x, y, list };
      })
      .sort((a, b) => (a.y - b.y) || (a.x - b.x));
    for (const clash of clashes) {
      for (const i of clash.list) {
        st.drifts[i] = { ...st.drifts[i], dir: REVERSE[st.drifts[i].dir] ?? st.drifts[i].dir };
      }
      if (!conflictOnTile(st, clash.x, clash.y)) {
        st.conflicts.push({ x: clash.x, y: clash.y, ttl: CONFLICT_TICKS });
      }
      st.events.push('conflict');
    }
  }

  // 12. Hits.
  if (st.invuln > 0) {
    st.invuln -= 1;
  } else {
    const onPlayer = st.drifts.some((d) => d.x === st.player.x && d.y === st.player.y);
    const swapped = driftsMoved && st.drifts.some((d, i) => {
      const before = driftsBefore[i];
      return d.x === playerBefore.x && d.y === playerBefore.y
        && before.x === st.player.x && before.y === st.player.y;
    });
    if (onPlayer || swapped) {
      if (st.carried.length > 0) {
        st.carried = [];
        st.invuln = INVULN_TICKS;
        st.events.push('drop');
      } else {
        st.lives -= 1;
        st.events.push('hit');
        if (st.lives <= 0) {
          st.lives = 0;
          st.status = 'lost';
          st.events.push('lost');
        } else {
          st.player = { x: st.level.start.x, y: st.level.start.y };
          st.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns.
  if (st.status === 'playing'
    && st.levelTicks % st.level.spawnEvery === 0
    && st.patches.length + st.carried.length < st.level.spawns.length) {
    const free = st.level.spawns.filter((s) =>
      !st.patches.some((p) => p.x === s.x && p.y === s.y)
      && !(s.x === st.player.x && s.y === st.player.y)
      && !st.drifts.some((d) => d.x === s.x && d.y === s.y));
    if (free.length > 0) {
      const where = rngInt(st.seed, free.length);
      st.seed = where.seed;
      const color = rngInt(st.seed, COLORS);
      st.seed = color.seed;
      const spot = free[where.value];
      st.patches = st.patches.concat([{ x: spot.x, y: spot.y, color: color.value }]);
      st.events.push('spawn');
    }
  }

  return st;
}
