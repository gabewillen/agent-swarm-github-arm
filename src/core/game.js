// DESIGN.md §5–§7: the rules. Pure: no DOM, no Math.random; every draw comes
// from the state's seed. init and step never change the state they are given.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { parseLevel } from './level.js';
import { rngInt } from './rng.js';
import { LEVELS } from '../data/levels.js';

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

const terrainAt = (level, x, y) => {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return '#';
  return level.tiles[y][x];
};

export function tileAt(state, x, y) {
  return terrainAt(state.level, x, y);
}

const onConflict = (conflicts, x, y) =>
  conflicts.some((c) => c.x === x && c.y === y);

// The player may enter anything but walls, closed holds, the closed exit,
// and a conflict cell.
const openToPlayer = (level, x, y, open, conflicts) => {
  const t = terrainAt(level, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !open) return false;
  return !onConflict(conflicts, x, y);
};

// A drift may enter anything but walls, holds, and the exit (open or not).
const openToDrift = (level, x, y, conflicts) => {
  const t = terrainAt(level, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !onConflict(conflicts, x, y);
};

// One { x, y, color } per spawn point, in reading order, each colour a
// rngInt(seed, COLORS) draw; returns the state's pieces and the new seed.
function freshLevel(levels, levelIndex, seed) {
  const level = parseLevel(levels[levelIndex]);
  const patches = [];
  let s = seed;
  for (const sp of level.spawns) {
    const r = rngInt(s, COLORS);
    patches.push({ x: sp.x, y: sp.y, color: r.value });
    s = r.seed;
  }
  return {
    level,
    player: { x: level.start.x, y: level.start.y },
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    seed: s,
  };
}

export function init(seed, options) {
  const levels = (options && options.levels) || LEVELS;
  const levelIndex = (options && options.level) || 0;
  const fresh = freshLevel(levels, levelIndex, seed >>> 0);
  return {
    seed: fresh.seed,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level: fresh.level,
    player: fresh.player,
    carried: [],
    patches: fresh.patches,
    drifts: fresh.drifts,
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

export function step(state, input) {
  const move = input && typeof input.move === 'string' ? input.move : null;
  const pause = Boolean(input && input.pause === true);

  // 1. A finished game no longer changes.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause input flips paused and does nothing else.
  if (pause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }

  // 3. A paused game does not tick.
  if (state.paused) return { ...state, events: [] };

  // 4. The step ticks.
  const events = [];
  const s = { ...state, tick: state.tick + 1, levelTicks: state.levelTicks + 1, events };
  s.seed = state.seed;

  // 5. Conflicts age.
  s.conflicts = [];
  for (const c of state.conflicts) {
    if (c.ttl > 1) s.conflicts.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }

  // 6. The player moves one cell when the target accepts the player.
  const from = { x: state.player.x, y: state.player.y };
  const vec = move ? DIRS[move] : null;
  if (vec) {
    const tx = from.x + vec[0];
    const ty = from.y + vec[1];
    if (openToPlayer(s.level, tx, ty, s.open, s.conflicts)) s.player = { x: tx, y: ty };
  }

  // 7. Pickup.
  const idx = s.patches.findIndex((p) => p.x === s.player.x && p.y === s.player.y);
  if (idx >= 0 && s.carried.length < CARRY_MAX) {
    const patch = s.patches[idx];
    s.patches = s.patches.filter((p, i) => i !== idx);
    s.carried = [...s.carried, patch.color];
    events.push('pickup');
  }

  // 8. Merge.
  if (terrainAt(s.level, s.player.x, s.player.y) === 'M' && s.carried.length > 0) {
    const n = s.carried.length;
    let gained = PATCH_BASE * n * n;
    if (n >= 2 && s.carried.every((c) => c === s.carried[0])) gained += SAME_COLOR_BONUS * n;
    s.score += gained;
    s.merges = s.merges + n;
    s.carried = [];
    events.push('merge');
    if (!s.open && s.merges >= s.level.quorum) {
      s.open = true;
      events.push('quorum');
    }
  }

  // 9. Exit: ship the level or win the game; the step ends here.
  if (s.open && terrainAt(s.level, s.player.x, s.player.y) === 'X') {
    s.score += Math.max(0, s.level.par - s.levelTicks) * TIME_BONUS_PER_TICK;
    if (s.levelIndex + 1 < s.levels.length) {
      const fresh = freshLevel(s.levels, s.levelIndex + 1, s.seed);
      s.level = fresh.level;
      s.levelIndex = s.levelIndex + 1;
      s.player = fresh.player;
      s.patches = fresh.patches;
      s.drifts = fresh.drifts;
      s.seed = fresh.seed;
      s.carried = [];
      s.conflicts = [];
      s.merges = 0;
      s.open = false;
      s.invuln = 0;
      s.levelTicks = 0;
      events.push('level');
    } else {
      s.status = 'won';
      events.push('won');
    }
    return s;
  }

  // 10. Drifts move on their tick: own direction first, then clockwise.
  const driftTick = s.tick % s.level.driftPeriod === 0;
  const before = s.drifts.map((d) => ({ x: d.x, y: d.y, moved: false }));
  const drifts = s.drifts.map((d) => ({ ...d }));
  if (driftTick) {
    for (let i = 0; i < drifts.length; i++) {
      const d = drifts[i];
      const at = CLOCKWISE.indexOf(d.dir);
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(at + k) % 4];
        const v = DIRS[dir];
        const tx = d.x + v[0];
        const ty = d.y + v[1];
        if (openToDrift(s.level, tx, ty, s.conflicts)) {
          d.x = tx;
          d.y = ty;
          d.dir = dir;
          before[i].moved = true;
          break;
        }
      }
    }
  }
  s.drifts = drifts;

  // 11. Collisions, only on a tick when drifts moved: reading order by cell.
  if (driftTick && drifts.length > 1) {
    const counts = new Map();
    for (const d of drifts) {
      const key = d.x + ',' + d.y;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const colliding = [];
    for (let y = 0; y < s.level.height; y++) {
      for (let x = 0; x < s.level.width; x++) {
        if ((counts.get(x + ',' + y) || 0) >= 2) colliding.push({ x, y });
      }
    }
    for (const cell of colliding) {
      const key = cell.x + ',' + cell.y;
      for (const d of drifts) {
        if (d.x === cell.x && d.y === cell.y) d.dir = OPPOSITE[d.dir];
      }
      if (!onConflict(s.conflicts, cell.x, cell.y)) {
        s.conflicts = [...s.conflicts, { x: cell.x, y: cell.y, ttl: CONFLICT_TICKS }];
      }
      events.push('conflict');
      void key;
    }
  }

  // 12. Hits.
  if (state.invuln > 0) {
    s.invuln = state.invuln - 1;
  } else {
    const hit = drifts.some((d, i) => {
      if (d.x === s.player.x && d.y === s.player.y) return true;
      const prev = before[i];
      return prev.moved && d.x === from.x && d.y === from.y &&
        prev.x === s.player.x && prev.y === s.player.y;
    });
    if (hit) {
      if (s.carried.length > 0) {
        s.carried = [];
        s.invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        s.lives = s.lives - 1;
        events.push('hit');
        if (s.lives <= 0) {
          s.lives = 0;
          s.status = 'lost';
          events.push('lost');
        } else {
          s.player = { x: s.level.start.x, y: s.level.start.y };
          s.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns, when the game is still being played.
  if (
    s.status === 'playing' &&
    s.levelTicks % s.level.spawnEvery === 0 &&
    s.patches.length + s.carried.length < s.level.spawns.length
  ) {
    const taken = new Set(s.patches.map((p) => p.x + ',' + p.y));
    const free = [];
    for (const sp of s.level.spawns) {
      if (taken.has(sp.x + ',' + sp.y)) continue;
      if (sp.x === s.player.x && sp.y === s.player.y) continue;
      if (drifts.some((d) => d.x === sp.x && d.y === sp.y)) continue;
      free.push(sp);
    }
    if (free.length > 0) {
      const spot = rngInt(s.seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      s.patches = [...s.patches, { x: free[spot.value].x, y: free[spot.value].y, color: color.value }];
      s.seed = color.seed;
      events.push('spawn');
    }
  }

  return s;
}
