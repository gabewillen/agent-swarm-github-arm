// Quorum Run — the rules (DESIGN.md §5 to §7).
//
// The state is plain JSON data at all times; `step` never changes the
// state or input it is given. Everything is random-free: every draw goes
// through the state's own PRNG seed.

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

// The shipped campaign is the default campaign. `src/data/levels.js` is
// another area's file; importing it dynamically keeps this module loadable
// even before it exists, and static-quiet in the browser once it does.
let LEVELS = [];
try {
  ({ LEVELS } = await import('../data/levels.js'));
} catch {
  // The editor or tests will pass their own `levels`; nothing else to do.
}

// --- terrain helpers -------------------------------------------------------

const tileChar = (level, x, y) => level.tiles[y]?.[x] ?? '#';

export function tileAt(state, x, y) {
  return tileChar(state.level, x, y);
}

// Passable to the player: not a wall, not a hold or the exit unless the
// level is open, and no conflict on it.
function playerPassable(level, open, conflicts, x, y) {
  const t = tileChar(level, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !open) return false;
  if (conflicts.some((c) => c.x === x && c.y === y)) return false;
  return true;
}

// Passable to a drift: not a wall, not a hold, not the exit (open or
// not), and no conflict on it. Drifts ignore pads, patches, the player,
// and each other.
function driftPassable(level, conflicts, x, y) {
  const t = tileChar(level, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  if (conflicts.some((c) => c.x === x && c.y === y)) return false;
  return true;
}

// --- level loading (§5) ----------------------------------------------------

// Loads `levels[index]` into `s`: parsed level, start, fresh patch
// colours, drift copies, and the per-level fields reset. Keeps score,
// lives, tick, and the PRNG state. Fresh colours cost one draw per spawn
// point, in reading order.
function loadLevel(levels, index, seed) {
  const def = levels[index];
  const level = parseLevel(def);
  const s = {
    level,
    levelIndex: index,
    player: { x: level.start.x, y: level.start.y },
    carried: [],
    patches: [],
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
  };
  let state = seed;
  for (const sp of level.spawns) {
    const draw = rngInt(state, COLORS);
    state = draw.seed;
    s.patches.push({ x: sp.x, y: sp.y, color: draw.value });
  }
  return { state, fields: s };
}

export function init(seed, options) {
  const opts = options ?? {};
  const levels = opts.levels ?? LEVELS;
  const levelIndex = opts.level ?? 0;
  const { state, fields } = loadLevel(levels, levelIndex, seed >>> 0);
  return {
    seed: state,
    tick: 0,
    levelTicks: fields.levelTicks,
    levels,
    levelIndex: fields.levelIndex,
    level: fields.level,
    player: fields.player,
    carried: fields.carried,
    patches: fields.patches,
    drifts: fields.drifts,
    conflicts: fields.conflicts,
    score: 0,
    lives: START_LIVES,
    merges: fields.merges,
    open: fields.open,
    invuln: fields.invuln,
    status: 'playing',
    paused: false,
    events: [],
  };
}

// --- a step (§6) -----------------------------------------------------------

const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };

function apply(state, patch) {
  return { ...state, ...patch };
}

export function step(state, input) {
  const inp = (input && typeof input === 'object' ? input : {}) ?? {};
  const dir = DIRS[inp.move] ? inp.move : null;

  // 1. A finished game does not change.
  if (state.status !== 'playing') return apply(state, { events: [] });

  // 2. Pause flips `paused` and does nothing else.
  if (inp.pause) {
    return apply(state, {
      paused: !state.paused,
      events: [state.paused ? 'resume' : 'pause'],
    });
  }

  // 3. While paused, a step passes nothing.
  if (state.paused) return apply(state, { events: [] });

  // Work on local copies of everything a step may change; the input
  // state is never touched.
  const level = state.level;
  const events = [];

  // 4. Ticks grow.
  let tick = state.tick + 1;
  let levelTicks = state.levelTicks + 1;

  // 5. Conflicts age.
  let conflicts = state.conflicts
    .map((c) => ({ ...c, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. The player moves one cell when the target is passable.
  const playerBefore = { x: state.player.x, y: state.player.y };
  let player = { ...state.player };
  if (dir) {
    const [dx, dy] = DIRS[dir];
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (playerPassable(level, state.open, conflicts, nx, ny)) {
      player = { x: nx, y: ny };
    }
  }

  // 7. Pickup: one patch below the player, while there is room.
  let patches = state.patches.slice();
  let carried = state.carried.slice();
  const pi = patches.findIndex((p) => p.x === player.x && p.y === player.y);
  if (pi >= 0 && carried.length < CARRY_MAX) {
    const [patch] = patches.splice(pi, 1);
    carried.push(patch.color);
    events.push('pickup');
  }

  // 8. Merge, and the quorum wheel opens the level.
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  if (tileChar(level, player.x, player.y) === 'M' && carried.length > 0) {
    const n = carried.length;
    score += PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) {
      score += SAME_COLOR_BONUS * n;
    }
    merges += n;
    carried = [];
    events.push('merge');
    if (!open && merges >= level.quorum) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. Exit: ship the level, or win the game. The step ends here.
  if (open && tileChar(level, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      const { state: seed, fields } = loadLevel(
        state.levels,
        state.levelIndex + 1,
        state.seed,
      );
      events.push('level');
      return apply(state, {
        seed,
        tick,
        score,
        events: events.slice(),
        ...fields,
      });
    }
    events.push('won');
    return apply(state, {
      seed: state.seed,
      tick,
      score,
      status: 'won',
      events: events.slice(),
    });
  }

  // 10. Drifts move on their ticks, in array order, turning clockwise.
  const driftsBefore = state.drifts.map((d) => ({ x: d.x, y: d.y }));
  const driftTick = tick % level.driftPeriod === 0;
  let drifts = state.drifts.map((d) => ({ ...d }));
  if (driftTick) {
    drifts = drifts.map((d) => {
      const idx = CLOCKWISE.indexOf(d.dir);
      for (let i = 0; i < 4; i++) {
        const dir2 = CLOCKWISE[(idx + i) % 4];
        const [dx, dy] = DIRS[dir2];
        const nx = d.x + dx;
        const ny = d.y + dy;
        if (driftPassable(level, conflicts, nx, ny)) {
          return { x: nx, y: ny, dir: dir2 };
        }
      }
      return d;
    });
  }

  // 11. Collisions, only on a tick when drifts moved: cells in reading
  // order, two or more drifts on one, reverse them and leave a
  // conflict unless the cell already holds one.
  if (driftTick) {
    const byCell = new Map();
    for (const d of drifts) {
      const key = `${d.x},${d.y}`;
      const list = byCell.get(key) ?? [];
      list.push(d);
      byCell.set(key, list);
    }
    const cells = [...byCell.entries()]
      .filter(([, list]) => list.length >= 2)
      .map(([key]) => key.split(',').map(Number))
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [x, y] of cells) {
      const list = byCell.get(`${x},${y}`);
      for (const d of list) d.dir = opposite[d.dir];
      if (!conflicts.some((c) => c.x === x && c.y === y)) {
        conflicts = conflicts.concat([{ x, y, ttl: CONFLICT_TICKS }]);
      }
      events.push('conflict');
    }
  }

  // 12. Hits.
  let invuln = state.invuln;
  let lives = state.lives;
  let status = state.status;
  let playerAfterDrift = player;
  if (invuln > 0) {
    invuln -= 1;
  } else {
    const onPlayer = drifts.some((d) => d.x === player.x && d.y === player.y);
    const swapped = drifts.some(
      (d, i) =>
        d.x === playerBefore.x &&
        d.y === playerBefore.y &&
        driftsBefore[i].x === player.x &&
        driftsBefore[i].y === player.y,
    );
    if (onPlayer || swapped) {
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
          playerAfterDrift = { x: level.start.x, y: level.start.y };
          invuln = INVULN_TICKS;
        }
      }
    }
  }
  player = playerAfterDrift;

  // 13. Spawns, on the level's rhythm and only while still playing.
  let seed = state.seed;
  if (status === 'playing' && levelTicks % level.spawnEvery === 0) {
    if (patches.length + carried.length < level.spawns.length) {
      const free = level.spawns.filter(
        (sp) =>
          !patches.some((p) => p.x === sp.x && p.y === sp.y) &&
          !(player.x === sp.x && player.y === sp.y) &&
          !drifts.some((d) => d.x === sp.x && d.y === sp.y),
      );
      if (free.length > 0) {
        const spot = rngInt(seed, free.length);
        seed = spot.seed;
        const color = rngInt(seed, COLORS);
        seed = color.seed;
        patches = patches.concat([
          { x: free[spot.value].x, y: free[spot.value].y, color: color.value },
        ]);
        events.push('spawn');
      }
    }
  }

  return apply(state, {
    seed,
    tick,
    levelTicks,
    player,
    carried,
    patches,
    drifts,
    conflicts,
    score,
    lives,
    merges,
    open,
    invuln,
    status,
    events,
  });
}
