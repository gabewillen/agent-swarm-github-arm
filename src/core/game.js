// Quorum Run: the rules (DESIGN.md §5, §6, §7).
// Pure: step never changes the state or the input it is given, and every
// state it returns is plain JSON data. Randomness comes only from the
// state's seed via rngInt.

import {
  CARRY_MAX,
  CLOCKWISE,
  COLORS,
  CONFLICT_TICKS,
  DIRS,
  INVULN_TICKS,
  PATCH_BASE,
  SAME_COLOR_BONUS,
  START_LIVES,
  TIME_BONUS_PER_TICK,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';

// A drift's opposite direction, taken on a collision.
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The shipped levels (src/data/levels.js) when that module is present; a
// small stand-in while it is not. init without options.levels uses this.
let SHIPPED_LEVELS = [
  { name: 'Eastward', quorum: 2, par: 60, driftPeriod: 2, spawnEvery: 20,
    map: ['#######', '#@P.M.#', '#..X..#', '#######'] },
  { name: 'Crossways', quorum: 2, par: 70, driftPeriod: 3, spawnEvery: 18,
    map: ['########', '#@P...M#', '#..>.X.#', '#......#', '########'] },
  { name: 'Holdfast', quorum: 3, par: 90, driftPeriod: 2, spawnEvery: 16,
    map: ['########', '#@P..MH#', '#..P...#', '#.>X...#', '########'] },
];
try {
  const data = await import('../data/levels.js');
  if (Array.isArray(data.LEVELS) && data.LEVELS.length > 0) SHIPPED_LEVELS = data.LEVELS;
} catch {
  // src/data/levels.js is not part of the tree yet; keep the stand-in.
}

// The terrain character ('#', '.', 'M', 'X', or 'H') of a cell, '#' outside.
function terrainAt(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

// What the player may enter: not a wall, not a hold or the exit unless
// open, and no conflict on it.
function playerPassable(t, x, y, open, conflicts) {
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !open) return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// What a drift may enter: not a wall, not a hold, not the exit (open or
// not), and no conflict on it. It ignores the player, patches, and other
// drifts.
function driftPassable(t, x, y, conflicts) {
  if (t === '#') return false;
  if (t === 'H' || t === 'X') return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// Parses a level and lays out its pieces: the player at the start, one
// patch per spawn point with a colour drawn in reading order, and copies
// of the level's drifts. Returns the fresh pieces and the advanced seed.
function loadLevel(def, seedIn) {
  const level = parseLevel(def);
  let seed = seedIn;
  const patches = level.spawns.map((s) => {
    const draw = rngInt(seed, COLORS);
    seed = draw.seed;
    return { x: s.x, y: s.y, color: draw.value };
  });
  const drifts = level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  return { level, patches, drifts, seed };
}

// init(seed, options) — the first state (DESIGN.md §5).
export function init(seed, options) {
  const opts = options ?? {};
  const levels = opts.levels ?? SHIPPED_LEVELS;
  if (!Array.isArray(levels) || levels.length === 0) throw new Error('no levels to load');
  let levelIndex = opts.level ?? 0;
  if (typeof levelIndex !== 'number') levelIndex = 0;
  levelIndex = Math.floor(levelIndex);
  levelIndex = Math.max(0, Math.min(levelIndex, levels.length - 1));
  const base = seed >>> 0;
  const { level, patches, drifts, seed: seedOut } = loadLevel(levels[levelIndex], base);
  return {
    seed: seedOut,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level,
    player: { x: level.start.x, y: level.start.y },
    carried: [],
    patches,
    drifts,
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

// What to do about an input: its move when it names a direction, else none.
function moveOf(input) {
  if (input === null || typeof input !== 'object') return null;
  const move = input.move;
  return typeof move === 'string' && Object.prototype.hasOwnProperty.call(DIRS, move) ? move : null;
}

// step(state, input) — one game step (DESIGN.md §6), in order.
export function step(state, input) {
  // 1. A state that is not playing no longer changes.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. Pause flips the flag and nothing else changes.
  const wantsPause = input !== null && typeof input === 'object' && input.pause === true;
  if (wantsPause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // 3. While paused the world waits.
  if (state.paused) return { ...state, events: [] };

  const move = moveOf(input);
  const events = [];
  const next = {
    ...state,
    tick: state.tick + 1, // 4. The clock ticks once.
    levelTicks: state.levelTicks + 1,
  };

  // 5. Conflicts age; those at 0 go.
  const conflicts = [];
  for (const c of state.conflicts) {
    if (c.ttl - 1 > 0) conflicts.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }
  next.conflicts = conflicts;

  // 6. The player moves one cell when the target is passable.
  const before = { x: state.player.x, y: state.player.y };
  let player = { ...before };
  if (move !== null) {
    const [dx, dy] = DIRS[move];
    const tx = before.x + dx;
    const ty = before.y + dy;
    if (playerPassable(terrainAt(state.level, tx, ty), tx, ty, state.open, conflicts)) {
      player = { x: tx, y: ty };
    }
  }
  next.player = player;

  // 7. Pickup: a patch under the player, while there is room to carry it.
  const patchIndex = state.patches.findIndex((p) => p.x === player.x && p.y === player.y);
  const carried = state.carried.slice();
  if (patchIndex >= 0 && carried.length < CARRY_MAX) {
    carried.push(state.patches[patchIndex].color);
    next.patches = state.patches.filter((p, i) => i !== patchIndex);
    events.push('pickup');
  }
  next.carried = carried;

  // 8. Merge on a pad with patches in hand.
  if (terrainAt(state.level, player.x, player.y) === 'M' && carried.length > 0) {
    let gained = PATCH_BASE * carried.length * carried.length;
    if (carried.length >= 2 && carried.every((c) => c === carried[0])) {
      gained += SAME_COLOR_BONUS * carried.length;
    }
    next.score = state.score + gained;
    next.merges = state.merges + carried.length;
    next.carried = [];
    events.push('merge');
    if (!state.open && next.merges >= state.level.quorum) {
      next.open = true;
      events.push('quorum');
    }
  }

  // 9. Exit: an open exit ships the level. Either way the step ends here.
  if (state.open && terrainAt(state.level, player.x, player.y) === 'X') {
    next.score = next.score + Math.max(0, state.level.par - next.levelTicks) * TIME_BONUS_PER_TICK;
    if (next.levelIndex + 1 < next.levels.length) {
      const li = next.levelIndex + 1;
      const loaded = loadLevel(next.levels[li], next.seed);
      next.levelIndex = li;
      next.level = loaded.level;
      next.player = { x: loaded.level.start.x, y: loaded.level.start.y };
      next.patches = loaded.patches;
      next.drifts = loaded.drifts;
      next.carried = [];
      next.conflicts = [];
      next.merges = 0;
      next.open = false;
      next.invuln = 0;
      next.levelTicks = 0;
      next.seed = loaded.seed;
      next.events = [...events, 'level'];
      return next;
    }
    next.status = 'won';
    next.events = [...events, 'won'];
    return next;
  }

  // 10. Drifts move on their tick: their way, or the first that works of
  // the next directions clockwise. Without a way, they stay and keep it.
  const driftsMove = next.tick % state.level.driftPeriod === 0;
  const drifts = [];
  const moves = []; // per drift: whether it moved and where from
  for (const d of state.drifts) {
    const stay = { x: d.x, y: d.y, dir: d.dir };
    if (!driftsMove) {
      drifts.push(stay);
      moves.push({ moved: false, from: stay });
      continue;
    }
    let worked = false;
    let tryIndex = CLOCKWISE.indexOf(d.dir);
    if (tryIndex < 0) tryIndex = 0;
    for (let a = 0; a < 4; a++) {
      const dir = CLOCKWISE[(tryIndex + a) % 4];
      const [dx, dy] = DIRS[dir];
      const tx = d.x + dx;
      const ty = d.y + dy;
      if (driftPassable(terrainAt(state.level, tx, ty), tx, ty, conflicts)) {
        drifts.push({ x: tx, y: ty, dir });
        moves.push({ moved: true, from: stay });
        worked = true;
        break;
      }
    }
    if (!worked) {
      drifts.push(stay);
      moves.push({ moved: false, from: stay });
    }
  }
  next.drifts = drifts;

  // 11. Collisions, only on a tick when drifts moved: each cell in reading
  // order holding two or more drifts leaves a conflict and reverses them.
  if (driftsMove) {
    for (let cy = 0; cy < state.level.height; cy++) {
      for (let cx = 0; cx < state.level.width; cx++) {
        const here = [];
        for (let i = 0; i < drifts.length; i++) {
          if (drifts[i].x === cx && drifts[i].y === cy) here.push(i);
        }
        if (here.length < 2) continue;
        for (const i of here) {
          const d = drifts[i];
          drifts[i] = { x: d.x, y: d.y, dir: REVERSE[d.dir] ?? d.dir };
        }
        if (!conflicts.some((c) => c.x === cx && c.y === cy)) {
          conflicts.push({ x: cx, y: cy, ttl: CONFLICT_TICKS });
        }
        events.push('conflict');
      }
    }
  }

  // 12. Hits. With immunity, it counts down and nothing lands.
  if (state.invuln > 0) {
    next.invuln = state.invuln - 1;
  } else {
    // Hit when a drift stands on the player, or when one that moved this
    // step swapped cells with the player (it is now where the player was,
    // and was where the player is).
    const swapped = drifts.some(
      (d, i) => moves[i].moved
        && d.x === before.x
        && d.y === before.y
        && moves[i].from.x === player.x
        && moves[i].from.y === player.y,
    );
    const hit = swapped || drifts.some((d) => d.x === player.x && d.y === player.y);
    if (hit) {
      if (next.carried.length > 0) {
        // Drops the patches; the cells keep nothing.
        next.carried = [];
        next.invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        const lives = state.lives - 1;
        events.push('hit');
        if (lives <= 0) {
          next.lives = 0;
          next.status = 'lost';
          events.push('lost');
        } else {
          next.lives = lives;
          next.invuln = INVULN_TICKS;
          next.player = { x: state.level.start.x, y: state.level.start.y };
        }
      }
    }
  }

  // 13. Spawns: at most one patch per spawn tick, from the free points.
  if (
    next.status === 'playing'
    && next.levelTicks % state.level.spawnEvery === 0
    && next.patches.length + next.carried.length < state.level.spawns.length
  ) {
    const free = state.level.spawns.filter(
      (s) => !next.patches.some((p) => p.x === s.x && p.y === s.y)
        && (next.player.x !== s.x || next.player.y !== s.y)
        && !next.drifts.some((d) => d.x === s.x && d.y === s.y),
    );
    if (free.length > 0) {
      const pick = rngInt(next.seed, free.length);
      const spot = free[pick.value];
      const color = rngInt(pick.seed, COLORS);
      next.patches = [...next.patches, { x: spot.x, y: spot.y, color: color.value }];
      next.seed = color.seed;
      events.push('spawn');
    }
  }

  next.events = events;
  return next;
}

// The terrain of a cell of the state's level, '#' outside the map.
export function tileAt(state, x, y) {
  return terrainAt(state.level, x, y);
}
