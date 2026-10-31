// Quorum Run — the rules: state, tiles, and a step (DESIGN.md §5 to §7).
// Pure core: no DOM, no Math.random; every draw comes from state.seed (§3).

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';

// init() without options.levels defaults to `LEVELS` of src/data/levels.js
// (§5). That module carries its own area's level designs and can land after
// the core does; import it when it is there so the rules module stays
// loadable meanwhile, with levels a required option until then.
let LEVELS = [];
try {
  ({ LEVELS } = await import('../data/levels.js'));
} catch {
  // data/levels.js is not shipped on this branch yet.
}

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// §6 step 10: a drift tries its own direction, then each next direction
// clockwise, four tries at most.
function turnOrder(dir) {
  const first = CLOCKWISE.indexOf(dir);
  return [0, 1, 2, 3].map((i) => CLOCKWISE[(first + i) % 4]);
}

const tileOf = (level, x, y) => {
  const row = level.tiles[y];
  return row === undefined ? '#' : (row[x] ?? '#');
};

// §6 step 6: passable to the player is not a wall, not a hold or the exit
// unless the level is open, and no conflict on the cell.
function playerPassable(level, conflicts, open, x, y) {
  const t = tileOf(level, x, y);
  if (t === '#') return false;
  if (t === 'H' || t === 'X') return open;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// §6 step 10: passable to a drift is not a wall, not a hold, not the exit
// (open or not), and no conflict on the cell.
function driftPassable(level, conflicts, x, y) {
  const t = tileOf(level, x, y);
  return t !== '#' && t !== 'H' && t !== 'X'
    && !conflicts.some((c) => c.x === x && c.y === y);
}

// Load a level definition (§5): the parsed level plus one patch per spawn
// point, each colour drawn in reading order from the running seed.
function loadLevel(def, seed) {
  const level = parseLevel(def);
  let s = seed;
  const patches = [];
  for (const sp of level.spawns) {
    const r = rngInt(s, COLORS);
    patches.push({ x: sp.x, y: sp.y, color: r.value });
    s = r.seed;
  }
  return { level, patches, seed: s };
}

export function init(seed, options) {
  const o = options ?? {};
  const levels = o.levels ?? LEVELS;
  const levelIndex = o.level ?? 0;
  const { level, patches, seed: next } = loadLevel(levels[levelIndex], seed >>> 0);
  return {
    seed: next,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level,
    player: { x: level.start.x, y: level.start.y },
    carried: [],
    patches,
    drifts: level.drifts.map((d) => ({ ...d })),
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
}

// §5: the terrain of a cell, '#' outside the map.
export function tileAt(state, x, y) {
  return tileOf(state.level, x, y);
}

export function step(state, input) {
  const i = input ?? {};
  const move = DIRS[i.move] ? i.move : null;
  const pause = i.pause === true;

  // 1. a game that is won or lost no longer changes
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. a pause flips paused and nothing else happens, not even a tick
  if (pause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // 3. nothing happens while paused
  if (state.paused) return { ...state, events: [] };

  // Working locals. Arrays are copied before they change, so a state that
  // arrives deep-frozen is never touched and every step returns fresh data.
  let level = state.level;
  const levels = state.levels;
  let levelIndex = state.levelIndex;
  let seed = state.seed;
  let levelTicks = state.levelTicks;
  let player = state.player;
  let carried = state.carried;
  let patches = state.patches;
  let drifts = state.drifts;
  let conflicts = state.conflicts;
  let score = state.score;
  let lives = state.lives;
  let merges = state.merges;
  let open = state.open;
  let invuln = state.invuln;
  let status = state.status;
  const tick = state.tick + 1;
  const events = [];

  // Assemble the state to return from the bindings as they are now.
  const assembled = () => ({
    seed, tick, levelTicks, levels, levelIndex, level, player, carried,
    patches, drifts, conflicts, score, lives, merges, open, invuln,
    status, paused: state.paused, events,
  });

  // 4. a tick passes
  levelTicks += 1;

  // 5. conflicts age by one; those at 0 go
  conflicts = [];
  for (const c of state.conflicts) {
    if (c.ttl > 1) conflicts.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }

  // 6. the player moves one cell when the target cell is passable
  const before = player;
  if (move) {
    const [dx, dy] = DIRS[move];
    const tx = before.x + dx;
    const ty = before.y + dy;
    if (playerPassable(level, conflicts, open, tx, ty)) {
      player = { x: tx, y: ty };
    }
  }

  // 7. pickup: a patch under the player joins the carried colours
  if (carried.length < CARRY_MAX) {
    const at = patches.findIndex((p) => p.x === player.x && p.y === player.y);
    if (at !== -1) {
      const grabbed = patches[at];
      patches = patches.filter((p, j) => j !== at);
      carried = carried.concat([grabbed.color]);
      events.push('pickup');
    }
  }

  // 8. merge on a pad scores the carried patches
  if (carried.length > 0 && tileOf(level, player.x, player.y) === 'M') {
    const n = carried.length;
    score += PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) {
      score += SAME_COLOR_BONUS * n;
    }
    merges += n;
    carried = [];
    events.push('merge');
    if (merges >= level.quorum && !open) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. the exit ships the level and ends the step before the drifts move
  if (open && tileOf(level, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (levelIndex + 1 < levels.length) {
      events.push('level');
      const loaded = loadLevel(levels[levelIndex + 1], seed);
      seed = loaded.seed;
      levelIndex += 1;
      level = loaded.level;
      levelTicks = 0;
      player = { x: level.start.x, y: level.start.y };
      carried = [];
      patches = loaded.patches;
      drifts = level.drifts.map((d) => ({ ...d }));
      conflicts = [];
      merges = 0;
      open = false;
      invuln = 0;
      return assembled();
    }
    status = 'won';
    events.push('won');
    return assembled();
  }

  // 10. drifts move on their period's ticks, each trying up to four
  // directions clockwise and taking the first passable one
  if (tick % level.driftPeriod === 0) {
    const movedDrifts = [];
    for (const d of state.drifts) {
      let moved = null;
      for (const dir of turnOrder(d.dir)) {
        const [dx, dy] = DIRS[dir];
        if (driftPassable(level, conflicts, d.x + dx, d.y + dy)) {
          moved = { x: d.x + dx, y: d.y + dy, dir };
          break;
        }
      }
      movedDrifts.push(moved ?? { x: d.x, y: d.y, dir: d.dir });
    }
    drifts = movedDrifts;

    // 11. drifts sharing a cell reverse and leave a conflict
    const cells = new Map();
    for (let j = 0; j < drifts.length; j++) {
      const d = drifts[j];
      const key = `${d.y}:${d.x}`;
      const there = cells.get(key);
      if (there) there.push(j);
      else cells.set(key, [j]);
    }
    const keys = [...cells.keys()].sort((a, b) => {
      const [ay, ax] = a.split(':').map(Number);
      const [by, bx] = b.split(':').map(Number);
      return ay - by || ax - bx;
    });
    for (const key of keys) {
      const there = cells.get(key);
      if (there.length < 2) continue;
      for (const j of there) {
        drifts[j] = {
          x: drifts[j].x, y: drifts[j].y, dir: OPPOSITE[drifts[j].dir],
        };
      }
      const [y, x] = key.split(':').map(Number);
      if (!conflicts.some((c) => c.x === x && c.y === y)) {
        conflicts.push({ x, y, ttl: CONFLICT_TICKS });
      }
      events.push('conflict');
    }
  }

  // 12. hits, unless the player is immune; immunity spends first
  if (invuln > 0) {
    invuln -= 1;
  } else {
    const touched = drifts.some((d) => d.x === player.x && d.y === player.y);
    const swapped = state.drifts.some((d, j) =>
      drifts[j].x === before.x && drifts[j].y === before.y
      && d.x === player.x && d.y === player.y);
    if (touched || swapped) {
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
          player = { x: level.start.x, y: level.start.y };
          invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. a patch spawns on the period's ticks while the game still runs
  if (status === 'playing' && levelTicks % level.spawnEvery === 0
    && patches.length + carried.length < level.spawns.length) {
    const free = level.spawns.filter((sp) =>
      !patches.some((p) => p.x === sp.x && p.y === sp.y)
      && !(sp.x === player.x && sp.y === player.y)
      && !drifts.some((d) => d.x === sp.x && d.y === sp.y));
    if (free.length > 0) {
      const spot = rngInt(seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      patches = patches.concat([{
        x: free[spot.value].x, y: free[spot.value].y, color: color.value,
      }]);
      seed = color.seed;
      events.push('spawn');
    }
  }

  return assembled();
}
