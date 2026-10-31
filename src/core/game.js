// §5 to §7: the game state and the rules of a step. Pure: no DOM, no
// Math.random, no clocks — every draw comes from state.seed (§3).
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

// loadLevel draws a level's fresh state block from the running PRNG seed:
// the parsed level, the player at the start, one patch per spawn point
// (its colour drawn in reading order), and copies of the drifts.
function loadLevel(defs, index, seed) {
  const level = parseLevel(defs[index]);
  let s = seed;
  const patches = [];
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

// init(seed, options) returns the first state: seed >>> 0, the starting
// level loaded, counters at zero, lives at START_LIVES.
export function init(seed, options) {
  const levels = (options && options.levels) || LEVELS;
  const levelIndex = (options && options.level) || 0;
  const fresh = loadLevel(levels, levelIndex, seed >>> 0);
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

// terrain of a cell: '#' outside the map.
export function tileAt(state, x, y) {
  const tiles = state.level.tiles;
  if (y < 0 || y >= tiles.length) return '#';
  const row = tiles[y];
  if (x < 0 || x >= row.length) return '#';
  return row[x];
}

// step(state, input) returns the next state; it never changes state or
// anything in it (§6).
export function step(state, input) {
  const move = (input && input.move) || null;
  const pause = !!(input && input.pause);

  // 1. A finished game no longer changes.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2-3. Pause flips and freezes; nothing else runs.
  if (pause) {
    const paused = !state.paused;
    return { ...state, paused, events: paused ? ['pause'] : ['resume'] };
  }
  if (state.paused) return { ...state, events: [] };

  const d = { ...state, events: [] };

  // 4. The tick passes.
  d.tick = state.tick + 1;
  d.levelTicks = state.levelTicks + 1;

  // 5. Conflicts age; a conflict whose depth of life runs out goes.
  d.conflicts = [];
  for (const c of state.conflicts) {
    const ttl = c.ttl - 1;
    if (ttl > 0) d.conflicts.push({ x: c.x, y: c.y, ttl });
  }

  const conflictOn = (x, y) => {
    for (const c of d.conflicts) if (c.x === x && c.y === y) return true;
    return false;
  };

  // 6. The player moves one cell when the target is passable: not a wall,
  //    not a hold or the exit unless open, and no conflict on it.
  const px0 = state.player.x;
  const py0 = state.player.y;
  let px = px0;
  let py = py0;
  const dir = Object.prototype.hasOwnProperty.call(DIRS, move) ? DIRS[move] : null;
  if (dir) {
    const tx = px0 + dir[0];
    const ty = py0 + dir[1];
    const t = tileAt(d, tx, ty);
    if ((t === '.' || t === 'M' || t === 'P' || ((t === 'X' || t === 'H') && d.open)) &&
        !conflictOn(tx, ty)) {
      px = tx;
      py = ty;
    }
  }
  d.player = { x: px, y: py };

  // 7. Pickup: a patch under the player and hands with room.
  if (d.carried.length < CARRY_MAX) {
    const i = d.patches.findIndex((p) => p.x === px && p.y === py);
    if (i !== -1) {
      d.carried = d.carried.concat([d.patches[i].color]);
      d.patches = d.patches.slice(0, i).concat(d.patches.slice(i + 1));
      d.events.push('pickup');
    }
  }

  // 8. Merge: on a pad with hands full, score by the square of n.
  const n = d.carried.length;
  if (n > 0 && tileAt(d, px, py) === 'M') {
    const same = d.carried.every((c) => c === d.carried[0]);
    d.score = d.score + PATCH_BASE * n * n + (n >= 2 && same ? SAME_COLOR_BONUS * n : 0);
    d.merges = d.merges + n;
    d.carried = [];
    d.events.push('merge');
    if (d.merges >= d.level.quorum && !d.open) {
      d.open = true;
      d.events.push('quorum');
    }
  }

  // 9. Exit: an open exit ships the level, with the time bonus first. The
  //    next level loads, or the game is won.
  if (d.open && tileAt(d, px, py) === 'X') {
    d.score = d.score + Math.max(0, d.level.par - d.levelTicks) * TIME_BONUS_PER_TICK;
    if (d.levelIndex + 1 < d.levels.length) {
      const next = loadLevel(d.levels, d.levelIndex + 1, d.seed);
      d.level = next.level;
      d.player = next.player;
      d.patches = next.patches;
      d.drifts = next.drifts;
      d.seed = next.seed;
      d.levelIndex = d.levelIndex + 1;
      d.carried = [];
      d.conflicts = [];
      d.merges = 0;
      d.open = false;
      d.invuln = 0;
      d.levelTicks = 0;
      d.events.push('level');
    } else {
      d.status = 'won';
      d.events.push('won');
    }
    return d;
  }

  // 10. Drifts move on their period: each drift tries its own direction
  //     and then clockwise, up to four, into a passable cell.
  const driftTurn = d.tick % d.level.driftPeriod === 0;
  const driftHand = (x, y) => {
    const t = tileAt(d, x, y);
    return t !== '#' && t !== 'H' && t !== 'X' && !conflictOn(x, y);
  };
  if (driftTurn) {
    const moved = d.drifts.map((dr) => {
      const from = CLOCKWISE.indexOf(dr.dir) < 0 ? 0 : CLOCKWISE.indexOf(dr.dir);
      for (let i = 0; i < 4; i++) {
        const name = CLOCKWISE[(from + i) % 4];
        const vec = DIRS[name];
        const tx = dr.x + vec[0];
        const ty = dr.y + vec[1];
        if (driftHand(tx, ty)) return { x: tx, y: ty, dir: name };
      }
      return { x: dr.x, y: dr.y, dir: dr.dir };
    });

    // 11. Collisions, in reading order of cells: two or more drifts on a
    //     cell reverse, a conflict starts on it (unless there already is
    //     one), and one conflict event per cell.
    const cells = new Map(); // cell key -> indexes into moved
    for (let i = 0; i < moved.length; i++) {
      const key = moved[i].y * 33 + moved[i].x;
      const own = cells.get(key);
      if (own) own.push(i);
      else cells.set(key, [i]);
    }
    const keys = [...cells.keys()].sort((a, b) => a - b);
    for (const key of keys) {
      const at = cells.get(key);
      if (at.length < 2) continue;
      const x = moved[at[0]].x;
      const y = moved[at[0]].y;
      for (const i of at) {
        moved[i] = { x: moved[i].x, y: moved[i].y, dir: OPPOSITE[moved[i].dir] ?? moved[i].dir };
      }
      if (!conflictOn(x, y)) d.conflicts.push({ x, y, ttl: CONFLICT_TICKS });
      d.events.push('conflict');
    }
    d.drifts = moved;
  }

  // 12. Hits, unless invulnerable: a drift on the player, or a drift that
  //     swapped cells with the player this step.
  if (d.invuln > 0) {
    d.invuln = d.invuln - 1;
  } else {
    const standing = d.drifts.some((dr) => dr.x === px && dr.y === py);
    const swapped = d.drifts.some((dr, i) => {
      const p = state.drifts[i];
      return p && dr.x === px0 && dr.y === py0 && p.x === px && p.y === py &&
        (dr.x !== p.x || dr.y !== p.y);
    });
    if (standing || swapped) {
      if (d.carried.length > 0) {
        d.carried = [];
        d.invuln = INVULN_TICKS;
        d.events.push('drop');
      } else {
        d.lives = d.lives - 1;
        d.events.push('hit');
        if (d.lives <= 0) {
          d.status = 'lost';
          d.events.push('lost');
        } else {
          d.player = { x: d.level.start.x, y: d.level.start.y };
          d.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns: on the period, when the level is short of patches, one
  //     free spawn point and one colour are drawn.
  if (d.status === 'playing' && d.levelTicks % d.level.spawnEvery === 0 &&
      d.patches.length + d.carried.length < d.level.spawns.length) {
    const taken = new Set(d.patches.map((p) => p.y * 33 + p.x));
    const free = [];
    for (const sp of d.level.spawns) {
      const key = sp.y * 33 + sp.x;
      if (taken.has(key)) continue;
      if (sp.x === d.player.x && sp.y === d.player.y) continue;
      if (d.drifts.some((dr) => dr.x === sp.x && dr.y === sp.y)) continue;
      free.push(sp);
    }
    if (free.length > 0) {
      const spot = rngInt(d.seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      const at = free[spot.value];
      d.patches = d.patches.concat([{ x: at.x, y: at.y, color: color.value }]);
      d.seed = color.seed;
      d.events.push('spawn');
    }
  }

  return d;
}
