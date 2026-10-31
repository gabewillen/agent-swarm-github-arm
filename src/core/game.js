// Quorum Run: the rules (DESIGN.md §5 to §7).
// Pure: never changes the state or the input it is given; every returned
// state is plain JSON data.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { parseLevel } from './level.js';
import { rngInt } from './rng.js';
import { LEVELS } from '../data/levels.js';

// §6 reverse of each direction: a colliding drift turns around.
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The terrain character of a cell ('#', '.', 'M', 'X', 'H'), '#' outside.
function tileOf(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

function conflictOn(conflicts, x, y) {
  return conflicts.some((c) => c.x === x && c.y === y);
}

// Passable to the player: not a wall, not a hold or the exit unless open,
// and no conflict on it (§6 step 6).
function playerEnterOk(level, open, conflicts, x, y) {
  const ch = tileOf(level, x, y);
  if (ch === '#') return false;
  if ((ch === 'H' || ch === 'X') && !open) return false;
  return !conflictOn(conflicts, x, y);
}

// Passable to a drift: not a wall, never a hold or the exit, and no
// conflict on it (§6 step 10).
function driftEnterOk(level, conflicts, x, y) {
  const ch = tileOf(level, x, y);
  if (ch === '#' || ch === 'H' || ch === 'X') return false;
  return !conflictOn(conflicts, x, y);
}

// Parses a level and rolls its fresh starting fields: patches with their
// colours drawn from the seed against every spawn in reading order, the
// player at the start, copies of the drifts (§5). Returns the seed's next
// state too.
function freshLevel(levels, index, seed) {
  const level = parseLevel(levels[index]);
  const patches = [];
  let s = seed;
  for (const p of level.spawns) {
    const r = rngInt(s, COLORS);
    patches.push({ x: p.x, y: p.y, color: r.value });
    s = r.seed;
  }
  return {
    seed: s,
    level,
    patches,
    player: { x: level.start.x, y: level.start.y },
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
  };
}

// A loaded level resets the per-level fields and keeps score, lives, tick,
// and the PRNG state (§5).
export function init(seed, options) {
  const opts = options ?? {};
  const levels = opts.levels ?? LEVELS;
  const levelIndex = opts.level ?? 0;
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

// The level's terrain character at a cell, '#' outside the map (§5).
export function tileAt(state, x, y) {
  return tileOf(state.level, x, y);
}

// §6: one step of the game. input is { move, pause }: move one of
// 'up' | 'right' | 'down' | 'left' | null; pause a boolean. A missing or
// null input, or a missing field, means no move and no pause.
export function step(state, input) {
  // 1. A finished game freezes (its events list empties).
  if (state.status !== 'playing') return { ...state, events: [] };

  const move = input && (input.move === 'up' || input.move === 'right' ||
    input.move === 'down' || input.move === 'left') ? input.move : null;
  const pause = Boolean(input && input.pause);

  // 2. A pause flips paused; nothing else happens.
  if (pause) {
    return { ...state, paused: !state.paused, events: state.paused ? ['resume'] : ['pause'] };
  }

  // 3. Paused: nothing happens, no tick passes.
  if (state.paused) return { ...state, events: [] };

  const level = state.level;
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;
  let events = [];

  // 5. Conflicts age by one each tick.
  let conflicts = state.conflicts
    .filter((c) => c.ttl > 1)
    .map((c) => ({ ...c, ttl: c.ttl - 1 }));

  // 6. The player moves one cell when the target is passable.
  const playerPre = { x: state.player.x, y: state.player.y };
  let player = { x: playerPre.x, y: playerPre.y };
  if (move) {
    const [dx, dy] = DIRS[move];
    const tx = player.x + dx;
    const ty = player.y + dy;
    if (playerEnterOk(level, state.open, conflicts, tx, ty)) {
      player = { x: tx, y: ty };
    }
  }

  // 7. Pickup: a patch under the player that isn't beyond CARRY_MAX.
  let patches = state.patches.slice();
  let carried = state.carried.slice();
  const pick = patches.findIndex((p) => p.x === player.x && p.y === player.y);
  if (pick >= 0 && carried.length < CARRY_MAX) {
    carried.push(patches[pick].color);
    patches = patches.filter((_, i) => i !== pick);
    events.push('pickup');
  }

  // 8. Merge on a merge pad when carrying.
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  if (tileOf(level, player.x, player.y) === 'M' && carried.length > 0) {
    const n = carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    score += gain;
    merges += n;
    carried = [];
    events.push('merge');
    if (!state.open && merges >= level.quorum) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. Exit: an open exit ships the level or wins the game; the step ends
  // here, so drifts never move on this tick.
  if (open && tileOf(level, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      // Ship: the next level loads.
      const next = state.levelIndex + 1;
      const fresh = freshLevel(state.levels, next, state.seed);
      events.push('level');
      return {
        ...state,
        seed: fresh.seed,
        tick,
        levelTicks: 0,
        levelIndex: next,
        level: fresh.level,
        player: fresh.player,
        carried: [],
        patches: fresh.patches,
        drifts: fresh.drifts,
        conflicts: [],
        score,
        merges: 0,
        open: false,
        invuln: 0,
        events,
      };
    }
    // The last level: the game is won.
    events.push('won');
    return { ...state, score, merges, carried, status: 'won', events };
  }

  // 10. Drifts move when tick % driftPeriod === 0, in array order, each
  // trying its own direction then clockwise, ignoring the player, patches,
  // and each other.
  const driftsMoved = tick % level.driftPeriod === 0;
  let drifts = state.drifts.map((d) => ({ ...d }));
  if (driftsMoved) {
    for (const d of drifts) {
      const at = CLOCKWISE.indexOf(d.dir);
      const from = at === -1 ? 0 : at;
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(from + k) % 4];
        const [dx, dy] = DIRS[dir];
        const tx = d.x + dx;
        const ty = d.y + dy;
        if (driftEnterOk(level, conflicts, tx, ty)) {
          d.x = tx;
          d.y = ty;
          d.dir = dir;
          break;
        }
      }
    }
  }

  // 11. Collisions, only when drifts moved: every cell (in reading order)
  // holding two or more drifts reverses each of them and holds a conflict.
  if (driftsMoved) {
    const stacked = new Map();
    for (const d of drifts) {
      const key = `${d.x},${d.y}`;
      const arr = stacked.get(key);
      if (arr) arr.push(d);
      else stacked.set(key, [d]);
    }
    const cells = [...stacked.keys()].map((key) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, arr: stacked.get(key) };
    });
    cells.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const cell of cells) {
      if (cell.arr.length < 2) continue;
      for (const d of cell.arr) {
        d.dir = OPPOSITE[d.dir] ?? d.dir;
      }
      if (!conflictOn(conflicts, cell.x, cell.y)) {
        conflicts.push({ x: cell.x, y: cell.y, ttl: CONFLICT_TICKS });
      }
      events.push('conflict');
    }
  }

  // 12. Hits: blocked while invulnerable; a drift on the player's cell, or
  // one that swapped cells with the player, hits.
  let lives = state.lives;
  let invuln = state.invuln;
  let status = state.status;
  if (invuln > 0) {
    invuln -= 1;
  } else {
    let hit = false;
    for (let i = 0; i < drifts.length && !hit; i++) {
      const d = drifts[i];
      const pre = state.drifts[i];
      if (d.x === player.x && d.y === player.y) {
        hit = true;
      } else if (pre.x === player.x && pre.y === player.y &&
        d.x === playerPre.x && d.y === playerPre.y &&
        (d.x !== pre.x || d.y !== pre.y)) {
        hit = true;
      }
    }
    if (hit) {
      if (carried.length > 0) {
        // Carrying: the patches drop instead of a life.
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

  // 13. Spawns: one patch on a free spawn point, point first then colour
  // from the seed.
  let seed = state.seed;
  if (status === 'playing' && levelTicks % level.spawnEvery === 0 &&
    patches.length + carried.length < level.spawns.length) {
    const held = new Set(patches.map((p) => `${p.x},${p.y}`));
    const free = level.spawns.filter((p) =>
      !held.has(`${p.x},${p.y}`) &&
      !(p.x === player.x && p.y === player.y) &&
      !drifts.some((d) => d.x === p.x && d.y === p.y));
    if (free.length > 0) {
      const a = rngInt(seed, free.length);
      seed = a.seed;
      const spot = free[a.value];
      const b = rngInt(seed, COLORS);
      seed = b.seed;
      patches = [...patches, { x: spot.x, y: spot.y, color: b.value }];
      events.push('spawn');
    }
  }

  return {
    ...state,
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
  };
}
