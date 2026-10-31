// The rules (DESIGN.md §5 to §7). init(seed, options) builds the first
// state; step(state, input) returns the next state and never changes the
// state or anything in it; tileAt reads the level's terrain.
//
// Pure core: randomness comes only from the seed (§3), and every state
// these functions return is plain JSON data.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

// An input of §6: { move, pause }. A missing or null input, or a missing
// field, means no move and no pause; anything unknown stays no move.
function readInput(input) {
  if (!input || typeof input !== 'object') return { move: null, pause: false };
  const move = DIRS[input.move] ? input.move : null;
  return { move, pause: input.pause === true };
}

function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

// Whether a conflict sits on a cell.
function conflictAt(conflicts, x, y) {
  return conflicts.some((c) => c.x === x && c.y === y);
}

// The terrain character at a cell, '#' outside the map.
function tileTerrain(level, x, y) {
  const tiles = level && level.tiles;
  if (!Array.isArray(tiles) || !Number.isInteger(y) || y < 0 || y >= tiles.length) return '#';
  const row = tiles[y];
  if (typeof row !== 'string' || !Number.isInteger(x) || x < 0 || x >= row.length) return '#';
  return row[x];
}

// Passable per step 6: not a wall, a hold or the exit only when the
// quorum is open, and no conflict on it.
function openToPlayer(level, x, y, isOpen, conflicts) {
  const t = tileTerrain(level, x, y);
  if (t === '#') return false;
  if (!isOpen && (t === 'H' || t === 'X')) return false;
  return !conflictAt(conflicts, x, y);
}

// Passable to a drift per step 10: not a wall, not a hold, not the exit
// (open or not), and no conflict on it.
function openToDrift(level, x, y, conflicts) {
  const t = tileTerrain(level, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !conflictAt(conflicts, x, y);
}

// Loading a level (at init and on reaching an open exit): sets level,
// player, patches (with fresh colour draws), drifts, and resets carried,
// conflicts, merges, open, invuln, and levelTicks; the caller keeps
// score, lives, tick, and the PRNG state. Draws return the advanced seed.
function loadLevel(seed, def) {
  const level = parseLevel(def);
  const patches = [];
  for (const spawn of level.spawns) {
    const r = rngInt(seed, COLORS);
    seed = r.seed;
    patches.push({ x: spawn.x, y: spawn.y, color: r.value });
  }
  return {
    seed, level,
    player: { x: level.start.x, y: level.start.y },
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    carried: [], conflicts: [], merges: 0, open: false, invuln: 0, levelTicks: 0,
  };
}

// init(seed, options) returns the first state (§5). options.levels holds
// the level definitions (default the shipped LEVELS of §10) and
// options.level the starting index (default 0).
export function init(seed, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const levels = Array.isArray(opts.levels) ? opts.levels : LEVELS;
  const levelIndex = opts.level === undefined ? 0 : opts.level;
  const start = loadLevel(seed >>> 0, levels[levelIndex]);
  return {
    ...start,
    tick: 0,
    levels, levelIndex,
    score: 0, lives: START_LIVES,
    status: 'playing', paused: false, events: [],
  };
}

// tileAt(state, x, y) returns the level's terrain character at a cell
// ('#', '.', 'M', 'X', or 'H'), and '#' outside the map.
export function tileAt(state, x, y) {
  return tileTerrain(state && state.level, x, y);
}

// step(state, input) returns the next state and never changes the state
// or anything in it. The steps run in the order §6 numbers them; the
// comments name them.
export function step(state, input) {
  const want = readInput(input);

  // 1. A finished game returns the state unchanged but with events [].
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause flips paused and ends the step.
  if (want.pause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // 3. While paused nothing moves and no tick passes.
  if (state.paused) return { ...state, events: [] };

  // 4. A playing step ticks, and events start empty.
  let s = { ...state, events: [] };
  s.tick += 1;
  s.levelTicks += 1;

  // 5. Conflicts age; those at 0 go.
  s.conflicts = s.conflicts
    .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. The player moves one cell when the target is passable to the
  // player.
  const playerBefore = { x: s.player.x, y: s.player.y };
  if (want.move) {
    const d = DIRS[want.move];
    const tx = playerBefore.x + d[0];
    const ty = playerBefore.y + d[1];
    if (openToPlayer(s.level, tx, ty, s.open, s.conflicts)) {
      s.player = { x: tx, y: ty };
    }
  }

  // 7. Pickup: a patch on the player's cell is carried, up to CARRY_MAX.
  const on = s.patches.findIndex((p) => sameCell(p, s.player));
  if (on >= 0 && s.carried.length < CARRY_MAX) {
    s.patches = s.patches.filter((p, i) => i !== on);
    s.carried = [...s.carried, state.patches[on].color];
    s.events.push('pickup');
  }

  // 8. Merge: on an M with patches carried.
  if (tileTerrain(s.level, s.player.x, s.player.y) === 'M' && s.carried.length > 0) {
    const n = s.carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && s.carried.every((c) => c === s.carried[0])) gain += SAME_COLOR_BONUS * n;
    s.score += gain;
    s.merges += n;
    s.carried = [];
    s.events.push('merge');
    if (s.merges >= s.level.quorum && !s.open) {
      s.open = true;
      s.events.push('quorum');
    }
  }

  // 9. Exit: with the quorum reached, the exit ships the level.
  if (s.open && tileTerrain(s.level, s.player.x, s.player.y) === 'X') {
    s.score += Math.max(0, s.level.par - s.levelTicks) * TIME_BONUS_PER_TICK;
    if (s.levelIndex + 1 < s.levels.length) {
      const next = loadLevel(s.seed, s.levels[s.levelIndex + 1]);
      s = {
        ...s, ...next,
        levelIndex: s.levelIndex + 1,
        score: s.score, lives: s.lives, tick: s.tick,
        status: s.status, paused: s.paused, levels: s.levels,
        events: [...s.events, 'level'],
      };
      return s;
    }
    s.status = 'won';
    s.events.push('won');
    return s;
  }

  // 10. Drifts move when tick % driftPeriod === 0: their own direction,
  // then each next clockwise until one is passable; otherwise stay.
  const driftsMoved = s.tick % s.level.driftPeriod === 0;
  const driftBefore = [];
  if (driftsMoved) {
    const drifts = [];
    for (const drift of s.drifts) {
      driftBefore.push({ x: drift.x, y: drift.y });
      const from = CLOCKWISE.indexOf(drift.dir);
      let moved = false;
      for (let i = 0; i < CLOCKWISE.length && !moved; i++) {
        const dir = CLOCKWISE[(from + i) % CLOCKWISE.length];
        const d = DIRS[dir];
        const tx = drift.x + d[0];
        const ty = drift.y + d[1];
        if (openToDrift(s.level, tx, ty, s.conflicts)) {
          drifts.push({ x: tx, y: ty, dir });
          moved = true;
        }
      }
      if (!moved) drifts.push({ x: drift.x, y: drift.y, dir: drift.dir });
    }
    s.drifts = drifts;
  }

  // 11. Drift collisions, only on a tick when drifts moved: cells in
  // reading order; every drift on a cell reverses its direction, and one
  // conflict and one event appear for the cell.
  if (driftsMoved) {
    const count = new Map();
    for (const d of s.drifts) {
      const key = `${d.x},${d.y}`;
      count.set(key, (count.get(key) || 0) + 1);
    }
    const cells = [...count.keys()]
      .map((k) => k.split(',').map(Number))
      .sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]))
      .filter(([cx, cy]) => count.get(`${cx},${cy}`) >= 2);
    for (const [cx, cy] of cells) {
      s.drifts = s.drifts.map((d) => !sameCell(d, { x: cx, y: cy }) ? d : {
        x: d.x, y: d.y,
        dir: d.dir === 'up' ? 'down' : d.dir === 'down' ? 'up'
          : d.dir === 'left' ? 'right' : 'left',
      });
      if (!conflictAt(s.conflicts, cx, cy)) {
        s.conflicts = [...s.conflicts, { x: cx, y: cy, ttl: CONFLICT_TICKS }];
      }
      s.events = [...s.events, 'conflict'];
    }
  }

  // 12. Hits. Invuln counts down and blocks hits meanwhile. The player is
  // hit when a drift is on the player's cell, or when a drift that moved
  // this step swapped cells with the player.
  if (s.invuln > 0) {
    s.invuln -= 1;
  } else {
    const swap = driftsMoved && s.drifts.some((d, i) =>
      sameCell(d, playerBefore) && sameCell(driftBefore[i], s.player));
    if (s.drifts.some((d) => sameCell(d, s.player)) || swap) {
      if (s.carried.length > 0) {
        // carrying: the patches drop, no life is lost
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

  // 13. Spawns: at spawnEvery levelTicks while there is room, one free
  // spawn point gets one patch; the point then the colour come from the
  // seed.
  if (s.status === 'playing' && s.levelTicks % s.level.spawnEvery === 0 &&
      s.patches.length + s.carried.length < s.level.spawns.length) {
    const driftCells = new Set(s.drifts.map((d) => `${d.x},${d.y}`));
    const free = s.level.spawns.filter((sp) =>
      !s.patches.some((p) => sameCell(p, sp)) &&
      !sameCell(sp, s.player) &&
      !driftCells.has(`${sp.x},${sp.y}`));
    if (free.length > 0) {
      const spot = rngInt(s.seed, free.length);
      s.seed = spot.seed;
      const color = rngInt(s.seed, COLORS);
      s.seed = color.seed;
      s.patches = [...s.patches, { x: free[spot.value].x, y: free[spot.value].y, color: color.value }];
      s.events = [...s.events, 'spawn'];
    }
  }

  return s;
}
