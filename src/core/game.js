// The rules (DESIGN.md §5 to §7): init, step, and tileAt. Pure: no DOM,
// no randomness but the state's seed, and step never changes its state.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { parseLevel } from './level.js';
import { rngInt } from './rng.js';
import { LEVELS } from '../data/levels.js';

const DIRECTIONS = new Set(['up', 'right', 'down', 'left']);
const DIR_INDEX = { up: 0, right: 1, down: 2, left: 3 };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

const moveOf = (input) => (input && DIRECTIONS.has(input.move) ? input.move : null);
const pauseOf = (input) => !!(input && input.pause === true);

// The terrain character at (x, y): '#' outside the map.
export function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined) return '#';
  const ch = row[x];
  return ch === undefined ? '#' : ch;
}

// A cell passable to the player: not a wall, not a closed hold or exit,
// no conflict on it.
function passablePlayer(level, x, y, open, conflicts) {
  const row = level.tiles[y];
  const t = row === undefined || row[x] === undefined ? '#' : row[x];
  if (t !== '.' && t !== 'M' && !(open && (t === 'H' || t === 'X'))) return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// A cell passable to a drift: floor or merge pad (never walls, holds, or
// the exit, open or not) and no conflict on it.
function passableDrift(tiles, x, y, conflicts) {
  const row = tiles[y];
  const t = row === undefined || row[x] === undefined ? '#' : row[x];
  if (t !== '.' && t !== 'M') return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// One lying patch per spawn point, in reading order, colours drawn from
// the seed in that order.
function placePatches(seed, spawnPoints) {
  let s = seed >>> 0;
  const patches = [];
  for (const sp of spawnPoints) {
    const r = rngInt(s, COLORS);
    patches.push({ x: sp.x, y: sp.y, color: r.value });
    s = r.seed;
  }
  return { patches, seed: s };
}

// A freshly loaded level: the parsed level, the player at its start,
// patches with fresh colour draws, copied drifts, and the per-level
// fields reset. score, lives, tick, and the seed are the caller's.
function loadedFrom(levels, index, seed) {
  const level = parseLevel(levels[index]);
  const { patches, seed: s } = placePatches(seed, level.spawns);
  return {
    level,
    levelIndex: index,
    player: { x: level.start.x, y: level.start.y },
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    carried: [],
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
    seed: s,
  };
}

// `init(seed, options)` returns the first state (§5).
export function init(seed, options = {}) {
  const levels = options.levels ?? LEVELS;
  const asked = options.level ?? 0;
  const index = Math.max(0, Math.min(asked, levels.length - 1));
  const justLoaded = loadedFrom(levels, index, seed >>> 0);
  return {
    ...justLoaded,
    levels,
    status: 'playing',
    paused: false,
    score: 0,
    lives: START_LIVES,
    tick: 0,
    events: [],
  };
}

// One drift moves this tick: its own direction first, then each next
// direction clockwise, up to four; with nothing passable it stays.
function moveDrift(d, tiles, conflicts) {
  const start = DIR_INDEX[d.dir];
  for (let k = 0; k < 4; k++) {
    const dir = CLOCKWISE[(start + k) % 4];
    const [dx, dy] = DIRS[dir];
    const x = d.x + dx;
    const y = d.y + dy;
    if (passableDrift(tiles, x, y, conflicts)) return { x, y, dir };
  }
  return { x: d.x, y: d.y, dir: d.dir };
}

// `step(state, input)` returns the next state; state and input untouched (§6).
export function step(state, input) {
  // 1. Not playing: the state unchanged but with empty events.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause flips paused and ends the step.
  if (pauseOf(input)) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // 3. Paused: nothing happens.
  if (state.paused) return { ...state, events: [] };

  // 4. Time passes; this step's events start empty.
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;
  const level = state.level;
  const events = [];

  // 5. Conflicts age; those that reach 0 go.
  let conflicts = state.conflicts
    .map((c) => ({ ...c, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. The player moves one cell when the target is passable.
  const move = moveOf(input);
  const prevPlayer = { x: state.player.x, y: state.player.y };
  let player = { x: state.player.x, y: state.player.y };
  if (move) {
    const [dx, dy] = DIRS[move];
    const x = player.x + dx;
    const y = player.y + dy;
    if (passablePlayer(level, x, y, state.open, conflicts)) player = { x, y };
  }

  // 7. Pickup: the patch under the player, while carrying below the max.
  let patches = state.patches.map((p) => ({ ...p }));
  let carried = state.carried.slice();
  if (carried.length < CARRY_MAX) {
    const i = patches.findIndex((p) => p.x === player.x && p.y === player.y);
    if (i >= 0) {
      const picked = patches[i];
      patches = patches.slice(0, i).concat(patches.slice(i + 1));
      carried = carried.concat(picked.color);
      events.push('pickup');
    }
  }

  // 8. Merge on a merge pad.
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  if (carried.length > 0 && tileAt(state, player.x, player.y) === 'M') {
    const n = carried.length;
    score += PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) score += SAME_COLOR_BONUS * n;
    merges += n;
    carried = [];
    events.push('merge');
    if (merges >= level.quorum && !open) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. The open exit ships the level; either way the step ends here.
  if (open && tileAt(state, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      return {
        ...loadedFrom(state.levels, state.levelIndex + 1, state.seed),
        levels: state.levels,
        score,
        lives: state.lives,
        tick,
        status: state.status,
        paused: state.paused,
        events: events.concat(['level']),
      };
    }
    return {
      ...state,
      tick,
      levelTicks,
      score,
      player,
      patches,
      carried,
      merges,
      open,
      status: 'won',
      events: events.concat(['won']),
    };
  }

  // 10. Drifts move on ticks divisible by driftPeriod, in array order.
  const oldDrifts = state.drifts.map((d) => ({ x: d.x, y: d.y }));
  let drifts = state.drifts.map((d) => ({ ...d }));
  let driftsMoved = false;
  if (tick % level.driftPeriod === 0) {
    driftsMoved = true;
    drifts = drifts.map((d) => moveDrift(d, level.tiles, conflicts));
  }

  // 11. Collisions, only on a tick when drifts moved: every cell holding
  // two or more drifts, in reading order, reverses its drifts and leaves
  // one conflict and one event.
  if (driftsMoved) {
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const here = drifts.filter((d) => d.x === x && d.y === y);
        if (here.length >= 2) {
          for (const d of here) d.dir = OPPOSITE[d.dir];
          if (!conflicts.some((c) => c.x === x && c.y === y)) {
            conflicts.push({ x, y, ttl: CONFLICT_TICKS });
          }
          events.push('conflict');
        }
      }
    }
  }

  // 12. Hits, unless immune this tick; invuln ticks down either way.
  let lives = state.lives;
  let status = state.status;
  let invuln = state.invuln;
  if (invuln > 0) {
    invuln -= 1;
  } else {
    const bumped = drifts.some((d) => d.x === player.x && d.y === player.y)
      || oldDrifts.some((od, i) => {
        const d = drifts[i];
        return d.x === prevPlayer.x && d.y === prevPlayer.y
          && od.x === player.x && od.y === player.y;
      });
    if (bumped && carried.length > 0) {
      // Carrying: the patches drop instead of a life.
      carried = [];
      invuln = INVULN_TICKS;
      events.push('drop');
    } else if (bumped) {
      lives -= 1;
      events.push('hit');
      if (lives <= 0) {
        lives = 0;
        status = 'lost';
        events.push('lost');
      } else {
        // Back to the start with a spell of immunity.
        player = { x: level.start.x, y: level.start.y };
        invuln = INVULN_TICKS;
      }
    }
  }

  // 13. Spawns: on every spawnEvery-th level tick, while the level holds
  // fewer patches than spawn points, one free point and one colour draw.
  let seed = state.seed;
  if (status === 'playing'
    && levelTicks % level.spawnEvery === 0
    && patches.length + carried.length < level.spawns.length) {
    const taken = (x, y) => patches.some((p) => p.x === x && p.y === y)
      || (player.x === x && player.y === y)
      || drifts.some((d) => d.x === x && d.y === y);
    const free = level.spawns.filter((sp) => !taken(sp.x, sp.y));
    if (free.length > 0) {
      const spot = rngInt(seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      patches = patches.concat([{ x: free[spot.value].x, y: free[spot.value].y, color: color.value }]);
      events.push('spawn');
      seed = color.seed;
    }
  }

  return {
    ...state,
    seed,
    tick,
    levelTicks,
    score,
    lives,
    player,
    patches,
    carried,
    drifts,
    conflicts,
    merges,
    open,
    invuln,
    status,
    events,
  };
}
