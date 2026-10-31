// DESIGN.md §5–§7: the rules. Pure and render-free: no DOM, no clock, no
// Math.random — every draw comes from the state's seed (§3).
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

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// A fresh, unfrozen copy of every mutable part of the state.
function clone(s) {
  return {
    ...s,
    player: { ...s.player },
    carried: s.carried.slice(),
    patches: s.patches.map((p) => ({ ...p })),
    drifts: s.drifts.map((d) => ({ ...d })),
    conflicts: s.conflicts.map((c) => ({ ...c })),
    events: [],
  };
}

export function tileAt(state, x, y) {
  const tiles = state.level.tiles;
  if (y < 0 || y >= tiles.length) return '#';
  const row = tiles[y];
  if (x < 0 || x >= row.length) return '#';
  return row[x];
}

const conflictAt = (conflicts, x, y) =>
  conflicts.some((c) => c.x === x && c.y === y);

// To the player: not a wall, not a closed hold or exit, no conflict on it.
function playerPassable(s, x, y) {
  const tile = tileAt(s, x, y);
  if (tile === '#') return false;
  if ((tile === 'H' || tile === 'X') && !s.open) return false;
  return !conflictAt(s.conflicts, x, y);
}

// To a drift: holds and the exit are walls open or not.
function driftPassable(s, x, y) {
  const tile = tileAt(s, x, y);
  if (tile === '#' || tile === 'H' || tile === 'X') return false;
  return !conflictAt(s.conflicts, x, y);
}

// Loads a level: fresh level, player, patches, drifts; resets the per-level
// fields; keeps score, lives, tick, and the PRNG state (§5).
function loadLevel(s, levelIndex) {
  const level = parseLevel(s.levels[levelIndex]);
  let seed = s.seed;
  const patches = level.spawns.map((sp) => {
    const r = rngInt(seed, COLORS);
    seed = r.seed;
    return { x: sp.x, y: sp.y, color: r.value };
  });
  const next = {
    ...s,
    level,
    levelIndex,
    player: { x: level.start.x, y: level.start.y },
    patches,
    drifts: level.drifts.map((d) => ({ ...d })),
    carried: [],
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
    seed,
  };
  return next;
}

export function init(seed, options) {
  const opts = options ?? {};
  const base = {
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    levels: opts.levels ?? LEVELS,
    levelIndex: opts.level ?? 0,
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
  return loadLevel(base, base.levelIndex);
}

export function step(state, input) {
  // 1. A finished game only clears its events.
  if (state.status !== 'playing') return { ...state, events: [] };

  const move =
    input && typeof input.move === 'string' && input.move in DIRS
      ? input.move
      : null;
  const pause = Boolean(input && input.pause);

  // 2. Pause flips paused; nothing else changes.
  if (pause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }
  // 3. While paused nothing happens.
  if (state.paused) return { ...state, events: [] };

  const s = clone(state);

  // 4. A tick passes.
  s.tick += 1;
  s.levelTicks += 1;

  // 5. Conflicts age; those at 0 go.
  const aging = [];
  for (const c of s.conflicts) {
    c.ttl -= 1;
    if (c.ttl > 0) aging.push(c);
  }
  s.conflicts = aging;

  // 6. The player moves when the target is passable.
  const before = { x: s.player.x, y: s.player.y };
  if (move) {
    const [dx, dy] = DIRS[move];
    if (playerPassable(s, before.x + dx, before.y + dy)) {
      s.player = { x: before.x + dx, y: before.y + dy };
    }
  }

  // 7. Pickup on the player's cell while hands are not full.
  if (s.carried.length < CARRY_MAX) {
    const i = s.patches.findIndex(
      (p) => p.x === s.player.x && p.y === s.player.y
    );
    if (i >= 0) {
      s.carried.push(s.patches[i].color);
      s.patches.splice(i, 1);
      s.events.push('pickup');
    }
  }

  // 8. Merge on the pad.
  if (tileAt(s, s.player.x, s.player.y) === 'M' && s.carried.length > 0) {
    const n = s.carried.length;
    s.score += PATCH_BASE * n * n;
    if (n >= 2 && s.carried.every((c) => c === s.carried[0])) {
      s.score += SAME_COLOR_BONUS * n;
    }
    s.merges += n;
    s.carried = [];
    s.events.push('merge');
    if (!s.open && s.merges >= s.level.quorum) {
      s.open = true;
      s.events.push('quorum');
    }
  }

  // 9. The exit ships the level and ends the step before drifts move.
  if (s.open && tileAt(s, s.player.x, s.player.y) === 'X') {
    s.score += Math.max(0, s.level.par - s.levelTicks) * TIME_BONUS_PER_TICK;
    s.events.push(s.levelIndex + 1 < s.levels.length ? 'level' : 'won');
    if (s.levelIndex + 1 < s.levels.length) {
      const next = loadLevel(s, s.levelIndex + 1);
      next.events = s.events;
      return next;
    }
    s.status = 'won';
    return s;
  }

  // 10. Drifts move on their tick, turning clockwise through four tries.
  const driftMoved = s.tick % s.level.driftPeriod === 0;
  const beforeDrifts = s.drifts.map((d) => ({ x: d.x, y: d.y }));
  if (driftMoved) {
    for (const d of s.drifts) {
      const own = CLOCKWISE.indexOf(d.dir);
      for (let i = 0; i < 4; i++) {
        const dir = CLOCKWISE[(own + i) % 4];
        const [dx, dy] = DIRS[dir];
        if (driftPassable(s, d.x + dx, d.y + dy)) {
          d.dir = dir;
          d.x += dx;
          d.y += dy;
          break;
        }
      }
    }
  }

  // 11. Drift collisions, per cell in reading order.
  if (driftMoved && s.drifts.length > 1) {
    const at = new Map();
    s.drifts.forEach((d, i) => {
      const key = d.y * 1024 + d.x;
      if (!at.has(key)) at.set(key, []);
      at.get(key).push(i);
    });
    const cells = [...at.keys()]
      .map((key) => ({ x: key % 1024, y: Math.floor(key / 1024) }))
      .sort((a, b) => a.y - b.y || a.x - b.x);
    for (const cell of cells) {
      const group = at.get(cell.y * 1024 + cell.x);
      if (group.length < 2) continue;
      for (const i of group) s.drifts[i].dir = OPPOSITE[s.drifts[i].dir];
      if (!conflictAt(s.conflicts, cell.x, cell.y)) {
        s.conflicts.push({ x: cell.x, y: cell.y, ttl: CONFLICT_TICKS });
      }
      s.events.push('conflict');
    }
  }

  // 12. Hits.
  if (s.invuln > 0) {
    s.invuln -= 1;
  } else {
    let hit = s.drifts.some(
      (d) => d.x === s.player.x && d.y === s.player.y
    );
    if (!hit) {
      hit = s.drifts.some((d, i) =>
        Boolean(driftMoved) &&
        d.x === before.x &&
        d.y === before.y &&
        beforeDrifts[i].x === s.player.x &&
        beforeDrifts[i].y === s.player.y
      );
    }
    if (hit) {
      if (s.carried.length > 0) {
        s.carried = [];
        s.invuln = INVULN_TICKS;
        s.events.push('drop');
      } else {
        s.lives -= 1;
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

  // 13. A patch spawns on a free spawn point.
  if (
    s.status === 'playing' &&
    s.levelTicks % s.level.spawnEvery === 0 &&
    s.patches.length + s.carried.length < s.level.spawns.length
  ) {
    const hasPatch = (x, y) => s.patches.some((p) => p.x === x && p.y === y);
    const hasDrift = (x, y) => s.drifts.some((d) => d.x === x && d.y === y);
    const free = s.level.spawns.filter(
      (sp) =>
        !hasPatch(sp.x, sp.y) &&
        !(sp.x === s.player.x && sp.y === s.player.y) &&
        !hasDrift(sp.x, sp.y)
    );
    if (free.length > 0) {
      const spot = rngInt(s.seed, free.length);
      const freeSpot = free[spot.value];
      const color = rngInt(spot.seed, COLORS);
      s.patches.push({ x: freeSpot.x, y: freeSpot.y, color: color.value });
      s.seed = color.seed;
      s.events.push('spawn');
    }
  }

  return s;
}
