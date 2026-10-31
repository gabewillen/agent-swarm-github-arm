// The rules of Quorum Run (DESIGN.md §5 to §7): the first state, one step,
// and the terrain accessor. `step` is pure — it never changes the state it
// is given, and everything it returns is plain JSON data.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

// A drift's direction and the one across from it.
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// Parse the level at `index`, then cover every spawn point with a patch
// (reading order) whose colour is drawn from the seed, and copy the
// level's drifts. Returns the level, the patches, the drifts, and the
// PRNG state after the draws.
function loadLevel(levels, index, seed) {
  const level = parseLevel(levels[index]);
  let next = seed >>> 0;
  const patches = level.spawns.map((spawn) => {
    const draw = rngInt(next, COLORS);
    next = draw.seed;
    return { x: spawn.x, y: spawn.y, color: draw.value };
  });
  const drifts = level.drifts.map((drift) => ({ x: drift.x, y: drift.y, dir: drift.dir }));
  return { level, patches, drifts, seed: next };
}

// The first state (§5). `options.levels` defaults to the shipped LEVELS
// and `options.level` to the first level.
export function init(seed, options) {
  const opts = options ?? {};
  const levels = opts.levels ?? LEVELS;
  const levelIndex = opts.level ?? 0;
  const loaded = loadLevel(levels, levelIndex, seed >>> 0);
  return {
    seed: loaded.seed,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level: loaded.level,
    player: { x: loaded.level.start.x, y: loaded.level.start.y },
    carried: [],
    patches: loaded.patches,
    drifts: loaded.drifts,
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

// The terrain character of a parsed level at a cell, '#' outside the map.
function terrainOf(level, x, y) {
  const tiles = level.tiles;
  if (y < 0 || y >= tiles.length) return '#';
  const row = tiles[y];
  if (x < 0 || x >= row.length) return '#';
  return row[x];
}

// The level's terrain character at a cell, '#' outside the map.
export function tileAt(state, x, y) {
  return terrainOf(state.level, x, y);
}

// A cell the player can enter: never a wall, holds and the exit only when
// open, and never a conflict.
function passableForPlayer(level, open, conflicts, x, y) {
  const ch = terrainOf(level, x, y);
  if (ch === '#') return false;
  if ((ch === 'H' || ch === 'X') && !open) return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// A cell a drift can enter: a hold or the exit is a wall, open or not,
// and so is any conflict.
function passableForDrift(level, conflicts, x, y) {
  const ch = terrainOf(level, x, y);
  if (ch === '#' || ch === 'H' || ch === 'X') return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// The next state for one `input` `{ move, pause }` (§6's thirteen steps,
// in order).
export function step(state, input) {
  const hasInput = input !== null && typeof input === 'object';
  const move = hasInput ? input.move : null;
  const pause = hasInput && input.pause === true;

  // 1. A game that is over no longer changes.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause input flips `paused`, nothing else changes.
  if (pause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }

  // 3. While paused, nothing happens.
  if (state.paused) return { ...state, events: [] };

  // 4. The clock ticks.
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;
  const level = state.level;
  const events = [];

  // 5. Conflicts age; those at 0 go.
  const conflicts = state.conflicts
    .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. The player moves one cell when the target is passable.
  const px = state.player.x;
  const py = state.player.y;
  let player = { x: px, y: py };
  const playerMoved = typeof move === 'string' && move in DIRS;
  if (playerMoved) {
    const [dx, dy] = DIRS[move];
    if (passableForPlayer(level, state.open, conflicts, px + dx, py + dy)) {
      player = { x: px + dx, y: py + dy };
    }
  }

  // 7. Pickup: the floor patch on the player's cell while hands are free.
  let patches = state.patches.map((p) => ({ x: p.x, y: p.y, color: p.color }));
  let carried = state.carried.slice();
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  const spot = patches.findIndex((p) => p.x === player.x && p.y === player.y);
  if (spot >= 0 && carried.length < CARRY_MAX) {
    const [patch] = patches.splice(spot, 1);
    carried.push(patch.color);
    events.push('pickup');
  }

  // 8. Merge: on the pad, every carried patch merges and scores.
  if (carried.length > 0 && tileAt(state, player.x, player.y) === 'M') {
    const n = carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    score += gain;
    merges += n;
    carried = [];
    events.push('merge');
    if (merges >= level.quorum && !open) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. Exit: standing on an open exit ships the level, and the next one
  // loads — or the game is won. Either way the step ends here.
  if (open && tileAt(state, player.x, player.y) === 'X') {
    const finalScore = score + Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      const loaded = loadLevel(state.levels, state.levelIndex + 1, state.seed);
      events.push('level');
      return {
        seed: loaded.seed,
        tick,
        levelTicks: 0,
        levels: state.levels,
        levelIndex: state.levelIndex + 1,
        level: loaded.level,
        player: { x: loaded.level.start.x, y: loaded.level.start.y },
        carried: [],
        patches: loaded.patches,
        drifts: loaded.drifts,
        conflicts: [],
        score: finalScore,
        lives: state.lives,
        merges: 0,
        open: false,
        invuln: 0,
        status: 'playing',
        paused: false,
        events,
      };
    }
    events.push('won');
    return {
      seed: state.seed,
      tick,
      levelTicks,
      levels: state.levels,
      levelIndex: state.levelIndex,
      level,
      player,
      carried,
      patches,
      drifts: state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
      conflicts,
      score: finalScore,
      lives: state.lives,
      merges,
      open,
      invuln: state.invuln,
      status: 'won',
      paused: false,
      events,
    };
  }

  // 10. Drifts move on every driftPeriod-th tick, in array order, trying
  // their own direction first and then each next direction clockwise.
  const driftsMoved = tick % level.driftPeriod === 0;
  const drifts = state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  const oldCells = drifts.map((d) => ({ x: d.x, y: d.y }));
  if (driftsMoved) {
    for (const drift of drifts) {
      const facing = CLOCKWISE.indexOf(drift.dir);
      for (let turn = 0; turn < 4; turn++) {
        const dir = CLOCKWISE[(facing + turn) % 4];
        const [dx, dy] = DIRS[dir];
        if (passableForDrift(level, conflicts, drift.x + dx, drift.y + dy)) {
          drift.x += dx;
          drift.y += dy;
          drift.dir = dir;
          break;
        }
      }
    }

    // 11. On a moved tick, any cell holding two or more drifts clashes:
    // each drift there reverses, a conflict appears unless one is already
    // on the cell, and one conflict event is added per cell, cells read in
    // reading order.
    const cells = [];
    for (const drift of drifts) {
      if (!cells.some((c) => c.x === drift.x && c.y === drift.y)) {
        cells.push({ x: drift.x, y: drift.y });
      }
    }
    cells.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const cell of cells) {
      const here = drifts.filter((d) => d.x === cell.x && d.y === cell.y);
      if (here.length < 2) continue;
      for (const d of here) d.dir = OPPOSITE[d.dir];
      if (!conflicts.some((c) => c.x === cell.x && c.y === cell.y)) {
        conflicts.push({ x: cell.x, y: cell.y, ttl: CONFLICT_TICKS });
      }
      events.push('conflict');
    }
  }

  // 12. Hits: immunity drops by one and blocks them; otherwise a drift on
  // the player's cell, or one that swapped cells with the player on a tick
  // the drifts moved, hits. Carrying, it costs the patches; empty-handed,
  // a life.
  let invuln = state.invuln;
  let lives = state.lives;
  let status = 'playing';
  const hit = invuln <= 0 && drifts.some((d, i) =>
    (d.x === player.x && d.y === player.y) ||
    (driftsMoved && d.x === px && d.y === py &&
      oldCells[i].x === player.x && oldCells[i].y === player.y));
  if (invuln > 0) {
    invuln -= 1;
  } else if (hit) {
    if (carried.length > 0) {
      carried = [];
      events.push('drop');
    } else {
      lives -= 1;
      events.push('hit');
      if (lives <= 0) {
        status = 'lost';
        events.push('lost');
      } else {
        player = { x: level.start.x, y: level.start.y };
      }
    }
    invuln = INVULN_TICKS;
  }

  // 13. Spawns: on every spawnEvery-th level tick, while playing, when the
  // floor plus hands hold fewer patches than there are spawn points, spawn
  // one on a free point (its draw picks the point, then the colour).
  let seed = state.seed;
  if (status === 'playing' && levelTicks % level.spawnEvery === 0 &&
      patches.length + carried.length < level.spawns.length) {
    const free = level.spawns.filter((spawn) =>
      !patches.some((p) => p.x === spawn.x && p.y === spawn.y) &&
      !(player.x === spawn.x && player.y === spawn.y) &&
      !drifts.some((d) => d.x === spawn.x && d.y === spawn.y));
    if (free.length > 0) {
      const where = rngInt(seed, free.length);
      seed = where.seed;
      const colour = rngInt(where.seed, COLORS);
      patches.push({ x: free[where.value].x, y: free[where.value].y, color: colour.value });
      events.push('spawn');
      seed = colour.seed;
    }
  }

  return {
    seed,
    tick,
    levelTicks,
    levels: state.levels,
    levelIndex: state.levelIndex,
    level,
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
    paused: state.paused,
    events,
  };
}
