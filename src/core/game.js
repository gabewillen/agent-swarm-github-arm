// §5 State, §6 A step, §7 Events. Local stand-in, excluded from git
// (owner: areas 3 and 4).

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
import { LEVELS } from '../data/levels.js';

const MOVES = new Set(['up', 'right', 'down', 'left']);
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The terrain of a cell: '#' beyond the map.
export function tileAt(state, x, y) {
  const tiles = state && state.level ? state.level.tiles : null;
  if (!Array.isArray(tiles) || !Number.isInteger(y) || y < 0 || y >= tiles.length) {
    return '#';
  }
  const row = tiles[y];
  if (typeof row !== 'string' || !Number.isInteger(x) || x < 0 || x >= row.length) {
    return '#';
  }
  return row[x];
}

function passableToPlayer(state, x, y) {
  const t = tileAt(state, x, y);
  if (t === '#') return false;
  if (t === 'H' || t === 'X') return state.open;
  return !state.conflicts.some((c) => c.x === x && c.y === y);
}

function passableToDrift(state, x, y) {
  const t = tileAt(state, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !state.conflicts.some((c) => c.x === x && c.y === y);
}

// Loads levels[levelIndex]: sets level, player, fresh patches, drifts;
// resets carried, conflicts, merges, open, invuln, levelTicks; keeps
// score, lives, tick, and the PRNG state.
function loadLevel(state) {
  const s = { ...state };
  s.level = parseLevel(s.levels[s.levelIndex]);
  s.player = { ...s.level.start };
  let seed = s.seed;
  s.patches = s.level.spawns.map((p) => {
    const d = rngInt(seed, COLORS);
    seed = d.seed;
    return { x: p.x, y: p.y, color: d.value };
  });
  s.seed = seed;
  s.drifts = s.level.drifts.map((d) => ({ ...d }));
  s.carried = [];
  s.conflicts = [];
  s.merges = 0;
  s.open = false;
  s.invuln = 0;
  s.levelTicks = 0;
  return s;
}

export function init(seed, options) {
  const o = options || {};
  const state = {
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    levels: Array.isArray(o.levels) ? o.levels : LEVELS,
    levelIndex: Number.isInteger(o.level) ? o.level : 0,
    level: null,
    player: { x: 0, y: 8 },
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
  return loadLevel(state);
}

export function step(state, input) {
  const s = state || {};

  // 1. Not playing: unchanged but with fresh events.
  if (s.status !== 'playing') return { ...s, events: [] };

  const o = input || {};
  const pause = o.pause === true;
  const move = MOVES.has(o.move) ? o.move : null;

  // 2. Pause flips paused; nothing else changes.
  if (pause) {
    return { ...s, paused: !s.paused, events: [s.paused ? 'resume' : 'pause'] };
  }

  // 3. Paused: nothing changes.
  if (s.paused) return { ...s, events: [] };

  // 4. A tick passes.
  const events = [];
  const next = {
    ...s,
    tick: s.tick + 1,
    levelTicks: s.levelTicks + 1,
    events,
    carried: [...s.carried],
    conflicts: s.conflicts.map((c) => ({ ...c })),
    patches: s.patches.map((p) => ({ ...p })),
    drifts: s.drifts.map((d) => ({ ...d })),
  };
  let seed = s.seed;

  // 5. Conflicts age.
  next.conflicts = next.conflicts
    .map((c) => ({ ...c, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. The player moves one cell when the target is passable.
  const before = { ...s.player };
  if (move) {
    const [dx, dy] = DIRS[move];
    const tx = before.x + dx;
    const ty = before.y + dy;
    if (passableToPlayer(next, tx, ty)) next.player = { x: tx, y: ty };
  }

  // 7. Pickup.
  const idx = next.patches.findIndex(
    (p) => p.x === next.player.x && p.y === next.player.y
  );
  if (idx >= 0 && next.carried.length < CARRY_MAX) {
    next.carried = [...next.carried, next.patches[idx].color];
    next.patches.splice(idx, 1);
    events.push('pickup');
  }

  // 8. Merge.
  if (
    tileAt(next, next.player.x, next.player.y) === 'M' &&
    next.carried.length > 0
  ) {
    const n = next.carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && next.carried.every((c) => c === next.carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    next.score += gain;
    next.merges += n;
    next.carried = [];
    events.push('merge');
    if (next.merges >= next.level.quorum && !next.open) {
      next.open = true;
      events.push('quorum');
    }
  }

  // 9. Exit ends the step here.
  if (next.open && tileAt(next, next.player.x, next.player.y) === 'X') {
    next.score += Math.max(0, next.level.par - next.levelTicks) * TIME_BONUS_PER_TICK;
    if (next.levelIndex + 1 < next.levels.length) {
      next.levelIndex += 1;
      const loaded = loadLevel(next);
      events.push('level');
      loaded.events = events;
      return loaded;
    }
    next.status = 'won';
    events.push('won');
    next.events = events;
    return next;
  }

  // 10. Drifts move on their tick.
  const moved = next.tick % next.level.driftPeriod === 0;
  const driftsBefore = next.drifts.map((d) => ({ ...d }));
  if (moved) {
    next.drifts = next.drifts.map((d) => {
      const from = CLOCKWISE.indexOf(d.dir);
      for (let i = 0; i < 4; i++) {
        const dir = CLOCKWISE[(from + i) % 4];
        const [dx, dy] = DIRS[dir];
        const tx = d.x + dx;
        const ty = d.y + dy;
        if (passableToDrift(next, tx, ty)) return { x: tx, y: ty, dir };
      }
      return { ...d };
    });
  }

  // 11. Drift collisions, only on a tick when drifts moved.
  if (moved) {
    for (let y = 0; y < next.level.height; y++) {
      for (let x = 0; x < next.level.width; x++) {
        const here = next.drifts.filter((d) => d.x === x && d.y === y);
        if (here.length >= 2) {
          for (const d of here) d.dir = OPPOSITE[d.dir];
          if (!next.conflicts.some((c) => c.x === x && c.y === y)) {
            next.conflicts.push({ x, y, ttl: CONFLICT_TICKS });
          }
          events.push('conflict');
        }
      }
    }
  }

  // 12. Hits.
  if (next.invuln > 0) {
    next.invuln -= 1;
  } else {
    const onPlayer = next.drifts.some(
      (d) => d.x === next.player.x && d.y === next.player.y
    );
    const swapped =
      moved &&
      next.drifts.some((d, i) =>
        d.x === before.x &&
        d.y === before.y &&
        driftsBefore[i].x === next.player.x &&
        driftsBefore[i].y === next.player.y
      );
    if (onPlayer || swapped) {
      if (next.carried.length > 0) {
        next.carried = [];
        next.invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        next.lives -= 1;
        events.push('hit');
        if (next.lives <= 0) {
          next.status = 'lost';
          events.push('lost');
        } else {
          next.player = { ...next.level.start };
          next.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns.
  if (
    next.status === 'playing' &&
    next.levelTicks % next.level.spawnEvery === 0 &&
    next.patches.length + next.carried.length < next.level.spawns.length
  ) {
    const free = next.level.spawns.filter(
      (sp) =>
        !next.patches.some((p) => p.x === sp.x && p.y === sp.y) &&
        !(next.player.x === sp.x && next.player.y === sp.y) &&
        !next.drifts.some((d) => d.x === sp.x && d.y === sp.y)
    );
    if (free.length > 0) {
      const spot = rngInt(seed, free.length);
      seed = spot.seed;
      const color = rngInt(seed, COLORS);
      seed = color.seed;
      next.patches.push({ x: free[spot.value].x, y: free[spot.value].y, color: color.value });
      events.push('spawn');
    }
  }
  next.seed = seed;
  next.events = events;
  return next;
}
