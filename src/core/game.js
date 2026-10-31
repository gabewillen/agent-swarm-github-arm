// §5 The state, §6 A step, §7 Events.
//
// `init(seed, options)` builds the first state; `step(state, input)` returns
// the next one, in the fixed order of §6; `tileAt(state, x, y)` reads the
// level's terrain. States are plain JSON data and every step is pure: the
// given state and input are never changed. Randomness comes only from the
// state's seed through §3's `rngInt`.
import {
  CARRY_MAX,
  START_LIVES,
  INVULN_TICKS,
  CONFLICT_TICKS,
  PATCH_BASE,
  SAME_COLOR_BONUS,
  TIME_BONUS_PER_TICK,
  COLORS,
  DIRS,
  CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';

// The shipped levels of §10 are `init`'s default. The data file is its own
// area of the game; until it is landed the table stays empty and every call
// supplies `options.levels`. The dynamic import keeps this module loadable
// on its own, and picks the shipped levels up as soon as the file exists.
let SHIPPED_LEVELS = [];
try {
  ({ LEVELS: SHIPPED_LEVELS } = await import('../data/levels.js'));
} catch {
  SHIPPED_LEVELS = [];
}
if (!Array.isArray(SHIPPED_LEVELS)) SHIPPED_LEVELS = [];

// The terrain character at a cell of the level's tiles, '#' when outside.
export function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

function tileOf(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

// The cell is passable to the player: not a wall, not a hold or the exit
// unless the quorum is open, and no conflict on it.
function passableForPlayer(level, open, conflicts, x, y) {
  const t = tileOf(level, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !open) return false;
  if (conflicts.some((c) => c.x === x && c.y === y)) return false;
  return true;
}

// The cell is passable to a drift: not a wall, not a hold, not the exit
// (open or not), and no conflict on it. Drifts ignore everything else.
function passableForDrift(level, conflicts, x, y) {
  const t = tileOf(level, x, y);
  if (t === '#') return false;
  if (t === 'H' || t === 'X') return false;
  if (conflicts.some((c) => c.x === x && c.y === y)) return false;
  return true;
}

// Place a level's board into a base state: the parsed level, the player at
// the start, one fresh patch on every spawn, the drifts copied, and the
// per-level fields reset. Keeps score, lives, tick, and the PRNG state.
function loadLevel(base, levelIndex) {
  const levels = base.levels;
  const level = parseLevel(levels[levelIndex]);
  let seed = base.seed;
  const patches = [];
  for (const sp of level.spawns) {
    const r = rngInt(seed, COLORS);
    seed = r.seed;
    patches.push({ x: sp.x, y: sp.y, color: r.value });
  }
  return {
    seed,
    levels,
    levelIndex,
    level,
    player: { x: level.start.x, y: level.start.y },
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    carried: [],
    conflicts: [],
    score: base.score,
    lives: base.lives,
    merges: 0,
    open: false,
    invuln: 0,
    tick: base.tick,
    levelTicks: 0,
    status: base.status,
    paused: false,
    events: base.events,
  };
}

// A fresh state (§5). `options.levels` names the level definitions
// (default: the shipped `LEVELS`) and `options.level` the starting index.
export function init(seed, options) {
  const o = options === undefined || options === null ? {} : options;
  const levels = o.levels !== undefined ? o.levels : SHIPPED_LEVELS;
  const base = {
    seed: seed >>> 0,
    levels,
    levelIndex: o.level !== undefined ? o.level : 0,
    score: 0,
    lives: START_LIVES,
    tick: 0,
    status: 'playing',
    events: [],
  };
  return loadLevel(base, base.levelIndex);
}

// One step of the game (§6), returning the next state.
export function step(state, input) {
  // 1. A finished game changes nothing but its events.
  if (state.status !== 'playing') return { ...state, events: [] };

  // Input: a missing or null input, or a missing field, means no move and
  // no pause.
  const raw = input === undefined || input === null ? {} : input;
  const offset = DIRS[raw.move] ?? null;
  const pause = raw.pause === true;

  // 2. A pause input flips `paused` and does nothing else.
  if (pause) {
    return {
      ...state,
      paused: !state.paused,
      events: [state.paused ? 'resume' : 'pause'],
    };
  }

  // 3. While paused nothing happens.
  if (state.paused) return { ...state, events: [] };

  const level = state.level;
  const events = [];
  let seed = state.seed;
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  let invuln = state.invuln;
  let lives = state.lives;
  let status = state.status;
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;

  // 5. Conflicts age by one and those at 0 go.
  const conflicts = [];
  for (const c of state.conflicts) {
    if (c.ttl - 1 > 0) conflicts.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }
  const hasConflict = (x, y) => conflicts.some((c) => c.x === x && c.y === y);

  // 6. The player moves one cell when the target is passable.
  const playerBefore = { x: state.player.x, y: state.player.y };
  let player = { ...playerBefore };
  if (offset !== null) {
    const nx = playerBefore.x + offset[0];
    const ny = playerBefore.y + offset[1];
    if (passableForPlayer(level, open, conflicts, nx, ny)) {
      player = { x: nx, y: ny };
    }
  }

  const patches = state.patches.map((p) => ({ ...p }));
  let carried = state.carried.map((c) => c);

  // 7. Pickup.
  const index = patches.findIndex((p) => p.x === player.x && p.y === player.y);
  if (index >= 0 && carried.length < CARRY_MAX) {
    carried.push(patches[index].color);
    patches.splice(index, 1);
    events.push('pickup');
  }

  // 8. Merge.
  if (tileOf(level, player.x, player.y) === 'M' && carried.length > 0) {
    const n = carried.length;
    score += PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) {
      score += SAME_COLOR_BONUS * n;
    }
    carried = [];
    events.push('merge');
    merges = state.merges + n;
    if (!open && merges >= level.quorum) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. Exit: the time bonus, then the next level or the win. Either way
  // the step ends here, before the drifts move.
  if (open && tileOf(level, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    const nextIndex = state.levelIndex + 1;
    if (nextIndex < state.levels.length) {
      const next = { ...state, tick, levelTicks, score, levelIndex: nextIndex, events: ['level'] };
      return loadLevel(next, nextIndex);
    }
    return {
      ...state, player, patches, carried, score, merges, status: 'won',
      events: ['won'], tick, levelTicks,
    };
  }

  // Work on private copies for the drift steps.
  const drifts = state.drifts.map((d) => ({ ...d }));

  // 10. Drifts move when the tick says so, each trying its own direction
  // first and then each next direction clockwise, in array order, ignoring
  // the player, patches, and each other.
  const driftsMoved = tick % level.driftPeriod === 0;
  const premove = driftsMoved ? drifts.map((d) => ({ x: d.x, y: d.y })) : null;
  if (driftsMoved) {
    for (const d of drifts) {
      const first = CLOCKWISE.indexOf(d.dir);
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(first + k) % 4];
        const [dx, dy] = DIRS[dir];
        const nx = d.x + dx;
        const ny = d.y + dy;
        if (passableForDrift(level, conflicts, nx, ny)) {
          d.x = nx;
          d.y = ny;
          d.dir = dir;
          break;
        }
      }
    }

    // 11. Collisions, in reading order: two or more drifts on a cell
    // reverse there and leave a conflict unless one already sits on it.
    const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
    for (let y = 0; y < level.height; y++) {
      const row = level.tiles[y];
      if (row === undefined) continue;
      for (let x = 0; x < row.length; x++) {
        const here = drifts.filter((d) => d.x === x && d.y === y);
        if (here.length < 2) continue;
        for (const d of here) d.dir = OPPOSITE[d.dir];
        if (!hasConflict(x, y)) conflicts.push({ x, y, ttl: CONFLICT_TICKS });
        events.push('conflict');
      }
    }
  }

  // 12. Hits. Under invulnerability the shield drops and nothing hits.
  if (invuln > 0) {
    invuln -= 1;
  } else {
    const hit = drifts.some((d, i) => (d.x === player.x && d.y === player.y) ||
      (driftsMoved &&
        premove[i].x === player.x && premove[i].y === player.y &&
        d.x === playerBefore.x && d.y === playerBefore.y));
    if (hit) {
      if (carried.length > 0) {
        carried = [];
        invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        lives -= 1;
        events.push('hit');
        if (lives === 0) {
          status = 'lost';
          events.push('lost');
        } else {
          player = { x: level.start.x, y: level.start.y };
          invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns: at most one fresh patch per tick on a free spawn point.
  if (
    status === 'playing' &&
    levelTicks % level.spawnEvery === 0 &&
    patches.length + carried.length < level.spawns.length
  ) {
    const free = [];
    for (const sp of level.spawns) {
      if (patches.some((p) => p.x === sp.x && p.y === sp.y)) continue;
      if (player.x === sp.x && player.y === sp.y) continue;
      if (drifts.some((d) => d.x === sp.x && d.y === sp.y)) continue;
      free.push(sp);
    }
    if (free.length > 0) {
      const spot = rngInt(seed, free.length);
      seed = spot.seed;
      const place = free[spot.value];
      const color = rngInt(seed, COLORS);
      seed = color.seed;
      patches.push({ x: place.x, y: place.y, color: color.value });
      events.push('spawn');
    }
  }

  // The next state, every field freshly owned by it.
  return {
    seed,
    levels: state.levels,
    levelIndex: state.levelIndex,
    level,
    player,
    patches,
    drifts,
    carried,
    conflicts,
    score,
    lives,
    merges,
    open,
    invuln,
    tick,
    levelTicks,
    status,
    paused: false,
    events,
  };
}
