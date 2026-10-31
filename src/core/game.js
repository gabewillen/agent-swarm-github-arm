// The rules (DESIGN.md §5 to §7): init, step, tileAt.
//
// step(state, input) runs one tick: pause handling, conflict ageing, the
// player's move, pickups, merges and score, the open exit, drift movement
// and conflicts, hits and drops, and patch respawns. It is pure: neither
// the state nor the input is written, and every field of the state it
// returns is plain JSON data. Randomness comes only from the state's
// seed, through the draw of §3: every draw replaces it.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

// The direction a drift turns to when two meet: pairs across the square.
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The terrain character of a cell, '#' when the cell is off the map.
function terrainOf(level, x, y) {
  const row = level && level.tiles ? level.tiles[y] : undefined;
  if (typeof row !== 'string') return '#';
  const ch = row[x];
  return ch === undefined ? '#' : ch;
}

// A conflict lies on a cell?
function conflictOn(list, x, y) {
  return list.some((c) => c.x === x && c.y === y);
}

// Cells the player cannot enter: walls, closed holds and exit, and
// conflict cells.
function blockedForPlayer(level, open, conflicts, x, y) {
  const t = terrainOf(level, x, y);
  if (t === '#') return true;
  if ((t === 'H' || t === 'X') && !open) return true;
  return conflictOn(conflicts, x, y);
}

// Cells drifts cannot enter: walls, holds and the exit (open or not),
// and conflict cells. Pads, patches and other agents leave them free.
function blockedForDrift(level, conflicts, x, y) {
  const t = terrainOf(level, x, y);
  if (t === '#' || t === 'H' || t === 'X') return true;
  return conflictOn(conflicts, x, y);
}

// Loads level index's definition into the state: parses it, places the
// player at its start, draws one patch per spawn point in reading order
// from the running seed, and copies the drifts. Everything per level
// resets; score, lives, tick, levels, and the seed keep their value.
function loadLevel(state, index) {
  const level = parseLevel(state.levels[index]);
  let seed = state.seed;
  const patches = [];
  for (const spot of level.spawns) {
    const draw = rngInt(seed, COLORS);
    patches.push({ x: spot.x, y: spot.y, color: draw.value });
    seed = draw.seed;
  }
  return {
    ...state,
    levelIndex: index,
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

export function init(seed, options) {
  const opts = options && typeof options === 'object' && !Array.isArray(options)
    ? options : {};
  const levels = opts.levels === undefined ? LEVELS : opts.levels;
  const levelIndex = opts.level === undefined ? 0 : opts.level;
  if (!Number.isInteger(levelIndex) || !Array.isArray(levels)) {
    throw new TypeError('init needs levels (an array) and a level index');
  }
  return loadLevel(
    { seed: seed >>> 0, tick: 0, levels, levelIndex, score: 0,
      lives: START_LIVES, status: 'playing', paused: false, events: [] },
    levelIndex,
  );
}

export function tileAt(state, x, y) {
  return terrainOf(state && state.level, x, y);
}

export function step(state, input) {
  // A missing or null input, or a missing field, means no move, no pause.
  const given = input && typeof input === 'object' && !Array.isArray(input)
    ? input : {};
  const move = typeof given.move === 'string' && DIRS[given.move]
    ? given.move : null;
  const pause = given.pause === true;

  return playStep(state, move, pause);
}

function playStep(state, move, pause) {
  // 1. A game that is over stands still: same values, no events.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause input flips the flag and ends the tick right there.
  if (pause) {
    return {
      ...state,
      paused: !state.paused,
      events: [state.paused ? 'resume' : 'pause'],
    };
  }

  // 3. Nothing moves while paused.
  if (state.paused) return { ...state, events: [] };

  const evts = [];

  // 4. The tick passes.
  let s = { ...state, tick: state.tick + 1, levelTicks: state.levelTicks + 1 };

  // 5. Conflicts age: each loses one tick of life; spent ones go.
  const conflicts = [];
  for (const c of state.conflicts) {
    if (c.ttl - 1 > 0) conflicts.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }

  // 6. The player moves one cell when the target is passable.
  const playerBefore = { x: state.player.x, y: state.player.y };
  let player = { x: playerBefore.x, y: playerBefore.y };
  if (move) {
    const nx = player.x + DIRS[move][0];
    const ny = player.y + DIRS[move][1];
    if (!blockedForPlayer(state.level, state.open, conflicts, nx, ny)) {
      player = { x: nx, y: ny };
    }
  }

  // 7. Pickup: a patch underfoot is taken while there is carry room.
  let patches = state.patches;
  let carried = state.carried.slice();
  if (carried.length < CARRY_MAX && patches.length > 0) {
    const at = patches.findIndex((p) => p.x === player.x && p.y === player.y);
    if (at >= 0) {
      const taken = patches[at].color;
      patches = patches.slice(0, at).concat(patches.slice(at + 1));
      carried = carried.concat([taken]);
      evts.push('pickup');
    }
  }

  // 8. Merge: patches carried onto a pad land; the quorum may open.
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  if (carried.length > 0 && terrainOf(state.level, player.x, player.y) === 'M') {
    const n = carried.length;
    score += PATCH_BASE * n * n;
    let mono = n >= 2;
    for (const c of carried) if (c !== carried[0]) mono = false;
    if (mono) score += SAME_COLOR_BONUS * n;
    merges += n;
    carried = [];
    evts.push('merge');
    if (!open && merges >= state.level.quorum) {
      open = true;
      evts.push('quorum');
    }
  }
  s = { ...s, player, patches, carried, conflicts, score, merges, open };

  // 9. Exit: an open exit ends the step right there, drifts included.
  if (open && terrainOf(state.level, player.x, player.y) === 'X') {
    score += Math.max(0, state.level.par - s.levelTicks) * TIME_BONUS_PER_TICK;
    if (s.levelIndex + 1 < s.levels.length) {
      return { ...loadLevel({ ...s, score }, s.levelIndex + 1), events: ['level'] };
    }
    return { ...s, score, status: 'won', events: ['won'] };
  }

  // 10. On their period ticks, drifts move in array order into the first
  // passable direction from their own turning clockwise; stuck ones keep
  // their direction.
  const driftTick = (s.tick % state.level.driftPeriod) === 0;
  const driftsBefore = state.drifts;
  let drifts = driftsBefore;
  if (driftTick) {
    const moved = [];
    for (const d of driftsBefore) {
      const from = Math.max(0, CLOCKWISE.indexOf(d.dir));
      let spot = null;
      for (let k = 0; k < 4 && spot === null; k++) {
        const dir = CLOCKWISE[(from + k) % 4];
        const nx = d.x + DIRS[dir][0];
        const ny = d.y + DIRS[dir][1];
        if (!blockedForDrift(state.level, conflicts, nx, ny)) {
          spot = { x: nx, y: ny, dir };
        }
      }
      moved.push(spot || { x: d.x, y: d.y, dir: d.dir });
    }
    drifts = moved;

    // 11. Every cell, in reading order, that now holds two or more drifts
    // reverses them, leaves a conflict (unless one lies there already),
    // and reports once for the cell.
    for (let y = 0; y < state.level.height; y++) {
      for (let x = 0; x < state.level.width; x++) {
        let crowd = 0;
        for (const d of drifts) if (d.x === x && d.y === y) crowd++;
        if (crowd < 2) continue;
        for (const d of drifts) {
          if (d.x === x && d.y === y) d.dir = OPPOSITE[d.dir];
        }
        evts.push('conflict');
        if (!conflictOn(conflicts, x, y)) {
          conflicts.push({ x, y, ttl: CONFLICT_TICKS });
        }
      }
    }
  }
  s = { ...s, conflicts, drifts };

  // 12. Hits. While immune, immunity only spends itself; otherwise the
  // player is hit when a drift stands on them, or — on a tick drifts
  // moved — when one swapped cells with them.
  let lives = state.lives;
  let invuln = state.invuln;
  let status = state.status;
  if (invuln > 0) {
    invuln -= 1;
  } else {
    let hit = false;
    for (const d of s.drifts) {
      if (d.x === player.x && d.y === player.y) { hit = true; break; }
    }
    if (!hit && driftTick) {
      for (let i = 0; i < s.drifts.length; i++) {
        const post = s.drifts[i];
        const pre = driftsBefore[i];
        if (post.x === playerBefore.x && post.y === playerBefore.y &&
            pre.x === player.x && pre.y === player.y) { hit = true; break; }
      }
    }
    if (hit) {
      if (s.carried.length > 0) {
        s = { ...s, carried: [] };
        invuln = INVULN_TICKS;
        evts.push('drop');
      } else {
        lives -= 1;
        evts.push('hit');
        if (lives <= 0) {
          lives = 0;
          status = 'lost';
          evts.push('lost');
        } else {
          player = { x: state.level.start.x, y: state.level.start.y };
          invuln = INVULN_TICKS;
        }
      }
    }
  }
  s = { ...s, player, lives, invuln, status };

  // 13. Spawns: below capacity and on the period, a free spot draws a spot
  // then a colour, one patch, appended; no draw at all happens otherwise.
  if (s.status === 'playing' && (s.levelTicks % state.level.spawnEvery) === 0) {
    const spots = state.level.spawns;
    if (s.patches.length + s.carried.length < spots.length) {
      const patchCells = [];
      const driftCells = [];
      for (const p of s.patches) patchCells.push(p.x + ',' + p.y);
      for (const d of s.drifts) driftCells.push(d.x + ',' + d.y);
      const free = [];
      for (const spot of spots) {
        const cell = spot.x + ',' + spot.y;
        if (!patchCells.includes(cell) && !driftCells.includes(cell) &&
            !(s.player.x === spot.x && s.player.y === spot.y)) {
          free.push(spot);
        }
      }
      if (free.length > 0) {
        const where = rngInt(s.seed, free.length);
        const spot = free[where.value];
        const paint = rngInt(where.seed, COLORS);
        s = {
          ...s,
          patches: s.patches.concat([{ x: spot.x, y: spot.y, color: paint.value }]),
          seed: paint.seed,
        };
        evts.push('spawn');
      }
    }
  }

  // The events of this step, in the order they happened.
  return { ...s, events: evts };
}
