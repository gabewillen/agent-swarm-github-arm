// Quorum Run: the rules (DESIGN.md §5 to §7). init(seed, options) returns the
// first state; step(state, input) returns the next state and never changes the
// state or the input it is given; tileAt(state, x, y) reads terrain.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { parseLevel } from './level.js';
import { rngInt } from './rng.js';
import { LEVELS } from '../data/levels.js';

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

function tileOf(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined || y < 0 || x < 0 || x >= row.length) return '#';
  return row[x];
}

function onConflict(conflicts, x, y) {
  return conflicts.some((c) => c.x === x && c.y === y);
}

function playerPassable(level, conflicts, x, y, open) {
  const t = tileOf(level, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !open) return false;
  return !onConflict(conflicts, x, y);
}

function driftPassable(level, conflicts, x, y) {
  const t = tileOf(level, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !onConflict(conflicts, x, y);
}

// Draws one patch colour per spawn point, in reading order, and returns the
// drawn patches and the advanced seed.
function drawPatches(startSeed, spawns) {
  let seed = startSeed;
  const patches = spawns.map((sp) => {
    const r = rngInt(seed, COLORS);
    seed = r.seed;
    return { x: sp.x, y: sp.y, color: r.value };
  });
  return { patches, seed };
}

// Builds the fields a freshly loaded level holds; keeps seed, score, lives,
// tick, levels, and levelIndex as given (§5).
function loadedLevel(levels, levelIndex, seed) {
  const def = levels[levelIndex];
  const level = parseLevel(def);
  const { patches, seed: nextSeed } = drawPatches(seed, level.spawns);
  return {
    seed: nextSeed,
    levelIndex,
    level,
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

export function init(seed, options = {}) {
  const levels = options.levels ?? LEVELS;
  const levelIndex = options.level ?? 0;
  const base = loadedLevel(levels, levelIndex, seed >>> 0);
  return {
    tick: 0,
    levels,
    score: 0,
    lives: START_LIVES,
    status: 'playing',
    paused: false,
    events: [],
    ...base,
  };
}

export function tileAt(state, x, y) {
  return tileOf(state.level, x, y);
}

// A level's ordered directions, starting with the drift's own.
function turnOrder(dir) {
  const at = CLOCKWISE.indexOf(dir);
  const out = [];
  for (let i = 0; i < CLOCKWISE.length; i++) out.push(CLOCKWISE[(at + i) % CLOCKWISE.length]);
  return out;
}

export function step(state, input) {
  const inMove = typeof input?.move === 'string' ? input.move : null;
  const move = DIRS[inMove] ? inMove : null;
  const pause = Boolean(input?.pause);

  // 1. A finished game no longer changes, but its events are cleared.
  if (state.status !== 'playing') {
    return { ...state, events: [] };
  }
  // 2. A pause flips paused and ends the step; nothing else changes.
  if (pause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }
  // 3. While paused nothing happens.
  if (state.paused) {
    return { ...state, events: [] };
  }

  const events = [];
  let s = {
    seed: state.seed >>> 0,
    tick: state.tick + 1, // 4. the clock grows
    levelTicks: state.levelTicks + 1,
    levels: state.levels,
    levelIndex: state.levelIndex,
    level: state.level,
    player: { x: state.player.x, y: state.player.y },
    carried: state.carried.slice(),
    patches: state.patches.map((p) => ({ ...p })),
    drifts: state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    conflicts: state.conflicts.map((c) => ({ ...c })),
    score: state.score,
    lives: state.lives,
    merges: state.merges,
    open: state.open,
    invuln: state.invuln,
    status: 'playing',
    paused: false,
  };

  // 5. Conflicts age; those at 0 go.
  s.conflicts = s.conflicts
    .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. The player's move.
  const prevPlayer = { ...s.player };
  if (move && playerPassable(s.level, s.conflicts, prevPlayer.x + DIRS[move][0], prevPlayer.y + DIRS[move][1], s.open)) {
    s.player = { x: prevPlayer.x + DIRS[move][0], y: prevPlayer.y + DIRS[move][1] };
  }

  // 7. Pickup.
  if (s.carried.length < CARRY_MAX) {
    const at = s.patches.findIndex((p) => p.x === s.player.x && p.y === s.player.y);
    if (at !== -1) {
      const patch = s.patches[at];
      s.patches.splice(at, 1);
      s.carried = [...s.carried, patch.color];
      events.push('pickup');
    }
  }

  // 8. Merge.
  if (tileOf(s.level, s.player.x, s.player.y) === 'M' && s.carried.length > 0) {
    const n = s.carried.length;
    s.score += PATCH_BASE * n * n;
    if (n >= 2 && s.carried.every((c) => c === s.carried[0])) s.score += SAME_COLOR_BONUS * n;
    s.merges += n;
    s.carried = [];
    events.push('merge');
    if (!s.open && s.merges >= s.level.quorum) {
      s.open = true;
      events.push('quorum');
    }
  }

  // 9. Exit: ship the level and load the next one, or win. The step ends
  // here either way.
  if (s.open && tileOf(s.level, s.player.x, s.player.y) === 'X') {
    s.score += Math.max(0, s.level.par - s.levelTicks) * TIME_BONUS_PER_TICK;
    if (s.levelIndex + 1 < s.levels.length) {
      const next = loadedLevel(s.levels, s.levelIndex + 1, s.seed);
      s = { ...s, ...next };
      events.push('level');
    } else {
      s.status = 'won';
      events.push('won');
    }
    return { ...s, events: [...events] };
  }

  // 10. Drifts move on their ticks, each in array order, ignoring the
  // player, patches, and each other.
  const preDrifts = s.drifts.map((d) => ({ x: d.x, y: d.y }));
  const driftsMoved = s.tick % s.level.driftPeriod === 0;
  if (driftsMoved) {
    for (const d of s.drifts) {
      for (const dir of turnOrder(d.dir)) {
        const nx = d.x + DIRS[dir][0];
        const ny = d.y + DIRS[dir][1];
        if (driftPassable(s.level, s.conflicts, nx, ny)) {
          d.x = nx;
          d.y = ny;
          d.dir = dir;
          break;
        }
      }
    }
  }

  // 11. Collisions: two or more drifts on a cell, in reading order, all
  // reverse there, leave a conflict unless one already lies there, and make
  // one event per cell.
  if (driftsMoved) {
    const byCell = new Map();
    for (const d of s.drifts) {
      const key = d.x + ',' + d.y;
      byCell.set(key, (byCell.get(key) ?? 0) + 1);
    }
    const crowded = [...byCell.entries()]
      .filter(([, count]) => count >= 2)
      .map(([key]) => key.split(',').map(Number))
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [x, y] of crowded) {
      for (const d of s.drifts) {
        if (d.x === x && d.y === y) d.dir = OPPOSITE[d.dir];
      }
      if (!onConflict(s.conflicts, x, y)) s.conflicts.push({ x, y, ttl: CONFLICT_TICKS });
      events.push('conflict');
    }
  }

  // 12. Hits.
  if (s.invuln > 0) {
    s.invuln -= 1;
  } else {
    let hit = false;
    for (let i = 0; i < s.drifts.length; i++) {
      const d = s.drifts[i];
      if (d.x === s.player.x && d.y === s.player.y) {
        hit = true;
        break;
      }
      if (driftsMoved && d.x === prevPlayer.x && d.y === prevPlayer.y
        && preDrifts[i].x === s.player.x && preDrifts[i].y === s.player.y) {
        hit = true;
        break;
      }
    }
    if (hit) {
      if (s.carried.length > 0) {
        s.carried = [];
        s.invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        s.lives -= 1;
        events.push('hit');
        if (s.lives <= 0) {
          s.status = 'lost';
          events.push('lost');
        } else {
          s.player = { x: s.level.start.x, y: s.level.start.y };
          s.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns, one at most, when the level's clock says so and a spawn
  // point is free.
  if (s.status === 'playing' && s.levelTicks % s.level.spawnEvery === 0
    && s.patches.length + s.carried.length < s.level.spawns.length) {
    const free = s.level.spawns.filter((sp) =>
      !s.patches.some((p) => p.x === sp.x && p.y === sp.y)
      && !(s.player.x === sp.x && s.player.y === sp.y)
      && !s.drifts.some((d) => d.x === sp.x && d.y === sp.y));
    if (free.length > 0) {
      const spot = rngInt(s.seed, free.length);
      s.seed = spot.seed;
      const color = rngInt(s.seed, COLORS);
      s.seed = color.seed;
      s.patches.push({ x: free[spot.value].x, y: free[spot.value].y, color: color.value });
      events.push('spawn');
    }
  }

  return { ...s, events: [...events] };
}
