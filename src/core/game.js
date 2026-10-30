// DESIGN.md §5 to §7: the rules. step is pure: it returns a new state and
// never changes the one it is given, nor the input.
import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

function key(x, y) {
  return x + ',' + y;
}

function hasConflict(state, x, y) {
  return state.conflicts.some((c) => c.x === x && c.y === y);
}

// A cell the player may step into (§6 step 6): not a wall, not a hold or the
// exit while the level is closed, and clear of conflicts.
function openToPlayer(state, x, y) {
  const t = tileAt(state, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !state.open) return false;
  return !hasConflict(state, x, y);
}

// A cell a drift may step into (§6 step 10): a wall, a hold, or the exit
// always blocks it, open or not, as does a conflict.
function openToDrift(state, x, y) {
  const t = tileAt(state, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !hasConflict(state, x, y);
}

// The order a drift tries: its own direction, then the rest clockwise.
function tryOrder(dir) {
  const i = CLOCKWISE.indexOf(dir);
  if (i < 0) return CLOCKWISE.slice();
  return [0, 1, 2, 3].map((n) => CLOCKWISE[(i + n) % 4]);
}

function reversed(dir) {
  if (dir === 'up') return 'down';
  if (dir === 'down') return 'up';
  if (dir === 'right') return 'left';
  if (dir === 'left') return 'right';
  return dir;
}

// Loading a level (§5): the terrain, the player, fresh patch colours drawn
// in spawn order, and the drifts; the per-level counters reset, and score,
// lives, tick, and the PRNG state carry over.
function loadLevel(state, def) {
  const level = parseLevel(def);
  let seed = state.seed;
  const patches = [];
  for (const spot of level.spawns) {
    const draw = rngInt(seed, COLORS);
    seed = draw.seed;
    patches.push({ x: spot.x, y: spot.y, color: draw.value });
  }
  return {
    ...state,
    level,
    player: { x: level.start.x, y: level.start.y },
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    carried: [],
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
    seed,
  };
}

export function init(seed, options = {}) {
  const levels = options.levels ?? LEVELS;
  const levelIndex = options.level ?? 0;
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
  return loadLevel(state, levels[levelIndex]);
}

export function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

export function step(state, input) {
  // 1. a game that is not playing no longer changes, but loses its events.
  if (state.status !== 'playing') return { ...state, events: [] };

  const pause = !!(input && input.pause);

  // 2. pause flips paused and nothing else happens.
  if (pause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }
  // 3. while paused, nothing moves.
  if (state.paused) return { ...state, events: [] };

  const s = { ...state, tick: state.tick + 1, levelTicks: state.levelTicks + 1, events: [] };
  const level = s.level;
  const before = state.player;
  const events = [];

  // 5. conflicts age before anything moves.
  s.conflicts = s.conflicts
    .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. the player moves one cell when the target is passable.
  const move = input && input.move;
  if (move && DIRS[move]) {
    const [dx, dy] = DIRS[move];
    const x = state.player.x + dx;
    const y = state.player.y + dy;
    if (openToPlayer(s, x, y)) s.player = { x, y };
  }

  // 7. pickup: a patch under the player's feet, with room to carry it.
  if (s.carried.length < CARRY_MAX) {
    const i = s.patches.findIndex((p) => p.x === s.player.x && p.y === s.player.y);
    if (i >= 0) {
      const patch = s.patches[i];
      s.patches = s.patches.filter((_, n) => n !== i);
      s.carried = [...s.carried, patch.color];
      events.push('pickup');
    }
  }

  // 8. merge: standing on the pad with patches in hand.
  if (tileAt(s, s.player.x, s.player.y) === 'M' && s.carried.length > 0) {
    const n = s.carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && s.carried.every((c) => c === s.carried[0])) gain += SAME_COLOR_BONUS * n;
    s.score = s.score + gain;
    s.merges = s.merges + n;
    s.carried = [];
    events.push('merge');
    if (!s.open && s.merges >= level.quorum) {
      s.open = true;
      events.push('quorum');
    }
  }

  // 9. the exit ships the level.
  if (s.open && tileAt(s, s.player.x, s.player.y) === 'X') {
    s.score += Math.max(0, level.par - s.levelTicks) * TIME_BONUS_PER_TICK;
    if (s.levelIndex + 1 < s.levels.length) {
      s.levelIndex = s.levelIndex + 1;
      s.events = ['level'];
      return loadLevel(s, s.levels[s.levelIndex]);
    }
    s.status = 'won';
    s.events = ['won'];
    return s;
  }

  const moved = s.tick % level.driftPeriod === 0;
  const drifted = s.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  const oldCells = s.drifts.map((d) => ({ x: d.x, y: d.y }));
  if (moved) {
    for (const d of drifted) {
      for (const dir of tryOrder(d.dir)) {
        const [dx, dy] = DIRS[dir];
        const x = d.x + dx;
        const y = d.y + dy;
        if (!openToDrift(s, x, y)) continue;
        d.x = x;
        d.y = y;
        d.dir = dir;
        break;
      }
    }
  }
  s.drifts = drifted;

  // 11. drift collisions: cells, in reading order, holding two or more.
  if (moved) {
    const cells = new Map();
    drifted.forEach((d, i) => {
      const k = key(d.x, d.y);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(i);
    });
    const conflicts = s.conflicts.slice();
    for (const [k, list] of [...cells.entries()].sort((a, b) => {
      const [ax, ay] = a[0].split(',').map(Number);
      const [bx, by] = b[0].split(',').map(Number);
      return ay - by || ax - bx;
    })) {
      if (list.length < 2) continue;
      const [x, y] = k.split(',').map(Number);
      for (const i of list) drifted[i].dir = reversed(drifted[i].dir);
      if (!conflicts.some((c) => c.x === x && c.y === y)) {
        conflicts.push({ x, y, ttl: CONFLICT_TICKS });
      }
      events.push('conflict');
    }
    s.conflicts = conflicts;
  }

  // 12. hits.
  if (s.invuln > 0) {
    s.invuln = s.invuln - 1;
  } else {
    const on = drifted.some((d) => d.x === s.player.x && d.y === s.player.y);
    const swapped = drifted.some((d, i) => (
      (d.x !== oldCells[i].x || d.y !== oldCells[i].y) &&
      d.x === before.x && d.y === before.y &&
      oldCells[i].x === s.player.x && oldCells[i].y === s.player.y
    ));
    if (on || swapped) {
      if (s.carried.length > 0) {
        s.carried = [];
        s.invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        s.lives = s.lives - 1;
        events.push('hit');
        if (s.lives <= 0) {
          s.status = 'lost';
          events.push('lost');
        } else {
          s.player = { x: level.start.x, y: level.start.y };
          s.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. spawns.
  if (s.status === 'playing' && s.levelTicks % level.spawnEvery === 0) {
    const taken = new Set(s.patches.map((p) => key(p.x, p.y)));
    const free = level.spawns.filter(
      (sp) =>
        !taken.has(key(sp.x, sp.y)) &&
        !(sp.x === s.player.x && sp.y === s.player.y) &&
        !s.drifts.some((d) => d.x === sp.x && d.y === sp.y),
    );
    if (free.length > 0 && s.patches.length + s.carried.length < level.spawns.length) {
      const spot = rngInt(s.seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      const at = free[spot.value];
      s.patches = [...s.patches, { x: at.x, y: at.y, color: color.value }];
      s.seed = color.seed;
      events.push('spawn');
    }
  }

  s.events = events;
  return s;
}
