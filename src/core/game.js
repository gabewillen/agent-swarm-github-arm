// The rules: state, moves, merges, exits, drifts, conflicts, hits, and
// spawns (DESIGN.md §5 to §7). The core is pure: `step` rebuilds state
// instead of changing it, so a frozen state is as good a state as any.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS,
  DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// init(seed, options) -> the first state. Options may name the levels
// (`options.levels`, default the shipped LEVELS) and the starting level
// (`options.level`, default 0).
export function init(seed, options) {
  const levels = (options && options.levels) || LEVELS;
  const wanted = options && options.level !== undefined ? options.level : 0;
  const levelIndex = Math.max(0, Math.min(wanted, levels.length - 1));
  const base = {
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
  return loadLevel(base, levelIndex);
}

// Loading a level (at init and on reaching an open exit): fresh level
// data and per-level fields; score, lives, tick, status, and the PRNG
// state carry over. One colour draw per spawn, in reading order.
function loadLevel(prev, index) {
  const level = parseLevel(prev.levels[index]);
  let seed = prev.seed;
  const patches = [];
  for (const spot of level.spawns) {
    const draw = rngInt(seed, COLORS);
    seed = draw.seed;
    patches.push({ x: spot.x, y: spot.y, color: draw.value });
  }
  return {
    ...prev,
    levelIndex: index,
    level,
    seed,
    player: { x: level.start.x, y: level.start.y },
    carried: [],
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
  };
}

// tileAt(state, x, y): the terrain at a cell, '#' anywhere outside.
export function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

function playerEnterable(state, x, y) {
  const t = tileAt(state, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !state.open) return false;
  return !state.conflicts.some((c) => c.x === x && c.y === y);
}

// A drift passes floors and merge pads; holds, the exit (open or not),
// walls, and conflicts are walls.
function driftEnterable(state, x, y) {
  const t = tileAt(state, x, y);
  if (t !== '.' && t !== 'M') return false;
  return !state.conflicts.some((c) => c.x === x && c.y === y);
}

// step(state, input) -> the next state; never changes its arguments.
export function step(state, input) {
  const move = input && typeof input === 'object' ? input.move : null;
  const pause = !!(input && input.pause);

  // 1. A game that is over stays over.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. Pause flips paused; the step ends there.
  if (pause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // 3. A paused game just idles.
  if (state.paused) return { ...state, events: [] };

  // 4. A tick passes.
  let s = { ...state, events: [] };
  s.tick = state.tick + 1;
  s.levelTicks = state.levelTicks + 1;
  const prevPlayer = state.player;

  // 5. Conflicts age; the gone ones free their cells.
  s.conflicts = state.conflicts
    .filter((c) => c.ttl > 1)
    .map((c) => ({ ...c, ttl: c.ttl - 1 }));

  // 6. The player moves one cell when the target is enterable.
  const dir = move ? DIRS[move] : undefined;
  let movedTo = null;
  if (dir) {
    const x = prevPlayer.x + dir[0];
    const y = prevPlayer.y + dir[1];
    if (playerEnterable(s, x, y)) movedTo = { x, y };
  }
  s.player = movedTo ?? prevPlayer;

  // 7. Pickup, up to CARRY_MAX.
  const here = s.patches.findIndex((p) => p.x === s.player.x && p.y === s.player.y);
  if (here !== -1 && s.carried.length < CARRY_MAX) {
    s.carried = [...s.carried, s.patches[here].color];
    s.patches = s.patches.filter((_, i) => i !== here);
    s.events.push('pickup');
  }

  // 8. Merge on a pad.
  if (tileAt(s, s.player.x, s.player.y) === 'M' && s.carried.length > 0) {
    const n = s.carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && s.carried.every((c) => c === s.carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    s.score += gain;
    s.merges += n;
    s.carried = [];
    s.events.push('merge');
    if (s.merges >= s.level.quorum && !s.open) {
      s.open = true;
      s.events.push('quorum');
    }
  }

  // 9. Exit: ship the level, or win the game. Either way the step ends
  // before the drifts move.
  if (s.open && tileAt(s, s.player.x, s.player.y) === 'X') {
    s.score += Math.max(0, s.level.par - s.levelTicks) * TIME_BONUS_PER_TICK;
    if (s.levelIndex + 1 < s.levels.length) {
      s = loadLevel(s, s.levelIndex + 1);
      s.events.push('level');
    } else {
      s.status = 'won';
      s.events.push('won');
    }
    return s;
  }

  // 10. Drifts move on their period, in array order, ignoring the player
  // and each other.
  const driftsMove = s.tick % s.level.driftPeriod === 0;
  if (driftsMove) {
    s.drifts = s.drifts.map((d) => advanceDrift(s, d));
    // 11. Head-on collisions: conflicts in reading order.
    s = collectConflicts(s);
  }

  // 12. Hits.
  if (s.invuln > 0) {
    s.invuln = s.invuln - 1;
  } else {
    const onPlayer = s.drifts.some((d) => d.x === s.player.x && d.y === s.player.y);
    const swapped = s.drifts.some((d, i) =>
      d.x === prevPlayer.x && d.y === prevPlayer.y &&
      state.drifts[i].x === s.player.x && state.drifts[i].y === s.player.y);
    if (onPlayer || swapped) {
      if (s.carried.length > 0) {
        s.carried = [];
        s.invuln = INVULN_TICKS;
        s.events.push('drop');
      } else {
        s.lives = s.lives - 1;
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

  // 13. Spawns, at most one per tick, and only while still playing.
  if (s.status === 'playing' &&
      s.levelTicks % s.level.spawnEvery === 0 &&
      s.patches.length + s.carried.length < s.level.spawns.length) {
    const busy = new Set(s.patches.map((p) => `${p.x},${p.y}`));
    for (const d of s.drifts) busy.add(`${d.x},${d.y}`);
    const free = s.level.spawns.filter((sp) =>
      !busy.has(`${sp.x},${sp.y}`) &&
      !(sp.x === s.player.x && sp.y === s.player.y));
    if (free.length > 0) {
      const pick = rngInt(s.seed, free.length);
      const tint = rngInt(pick.seed, COLORS);
      const spot = free[pick.value];
      s.patches = [...s.patches, { x: spot.x, y: spot.y, color: tint.value }];
      s.seed = tint.seed;
      s.events.push('spawn');
    }
  }

  return s;
}

// A drift tries its own direction, then each next direction clockwise,
// up to four; blocked every way it stays put and keeps its direction.
function advanceDrift(state, d) {
  const from = CLOCKWISE.indexOf(d.dir);
  for (let k = 0; k < 4; k++) {
    const dir = CLOCKWISE[(from + k) % 4];
    const [dx, dy] = DIRS[dir];
    const x = d.x + dx;
    const y = d.y + dy;
    if (driftEnterable(state, x, y)) return { x, y, dir };
  }
  return d;
}

// Cells in reading order that hold two or more drifts: every drift there
// reverses, one conflict is laid unless one already sits on the cell,
// and one `conflict` event is raised for the cell.
function collectConflicts(s) {
  const width = s.level.width;
  const counts = new Map();
  for (const d of s.drifts) {
    const key = d.y * width + d.x;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const collisions = [...counts.keys()]
    .filter((key) => counts.get(key) >= 2)
    .sort((a, b) => a - b);
  if (collisions.length === 0) return s;

  let drifts = s.drifts;
  let conflicts = s.conflicts;
  const events = [...s.events];
  for (const key of collisions) {
    const x = key % width;
    const y = Math.floor(key / width);
    drifts = drifts.map((d) =>
      d.x === x && d.y === y ? { ...d, dir: REVERSE[d.dir] } : d);
    if (!conflicts.some((c) => c.x === x && c.y === y)) {
      conflicts = [...conflicts, { x, y, ttl: CONFLICT_TICKS }];
    }
    events.push('conflict');
  }
  return { ...s, drifts, conflicts, events };
}
