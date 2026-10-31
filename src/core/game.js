// Quorum Run's rules (DESIGN.md §5, §6, §7): the state, one tick of the
// game, and terrain lookups. Pure: a step returns the next state and never
// changes the state (or anything in it) that it was given.

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
const MOVES = ['up', 'right', 'down', 'left'];

// Terrain at a cell; '#' outside the map.
export function tileAt(state, x, y) {
  const level = state.level;
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return '#';
  return level.tiles[y][x];
}

// A drift's target is passable when it is not a wall, not a hold, not the
// exit (open or not), and no conflict sits on it. Drifts ignore the
// player, patches, and each other while moving.
function driftPassable(state, x, y) {
  const t = tileAt(state, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !state.conflicts.some((c) => c.x === x && c.y === y);
}

// The player's target is passable when it is not a wall, not a hold or the
// exit while the level is closed, and no conflict sits on it.
function playerPassable(state, x, y) {
  const t = tileAt(state, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !state.open) return false;
  return !state.conflicts.some((c) => c.x === x && c.y === y);
}

// Loads a level into the state: the parsed level, the player at its start,
// a patch per spawn point (fresh colour draws, in reading order), copies
// of its drifts, and the per-level fields reset. Keeps score, lives, tick,
// and the PRNG state; the colour draws consume and replace it.
function loadLevel(state, def) {
  state.level = parseLevel(def);
  state.player = { x: state.level.start.x, y: state.level.start.y };
  state.patches = state.level.spawns.map((sp) => {
    const r = rngInt(state.seed, COLORS);
    state.seed = r.seed;
    return { x: sp.x, y: sp.y, color: r.value };
  });
  state.drifts = state.level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  state.carried = [];
  state.conflicts = [];
  state.merges = 0;
  state.open = false;
  state.invuln = 0;
  state.levelTicks = 0;
}

// Reads one input: a missing or null input, an invalid move, or a missing
// field means no move and no pause.
function readInput(input) {
  const inp = input !== null && typeof input === 'object' ? input : {};
  const move = MOVES.includes(inp.move) ? inp.move : null;
  return { move, pause: Boolean(inp.pause) };
}

export function init(seed, options) {
  const opts = options !== null && typeof options === 'object' ? options : {};
  const state = {
    seed: (seed === null || seed === undefined ? 0 : seed) >>> 0,
    tick: 0,
    levelTicks: 0,
    levels: opts.levels ?? LEVELS,
    levelIndex: opts.level ?? 0,
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
  loadLevel(state, state.levels[state.levelIndex]);
  return state;
}

export function step(state, input) {
  const { move, pause } = readInput(input);

  // 1. A game that is over returns itself with an empty event list.
  if (state.status !== 'playing') return { ...state, events: [] };

  // Fresh copies of everything a step may touch; state stays untouched.
  const s = {
    ...state,
    player: { ...state.player },
    carried: [...state.carried],
    patches: state.patches.map((p) => ({ ...p })),
    drifts: state.drifts.map((d) => ({ ...d })),
    conflicts: state.conflicts.map((c) => ({ ...c })),
    events: [],
  };

  // 2. A pause input flips paused and ends the step.
  if (pause) {
    s.paused = !s.paused;
    s.events = [s.paused ? 'pause' : 'resume'];
    return s;
  }
  // 3. While paused, the game idles.
  if (s.paused) return s;

  // 4. The clock ticks.
  s.tick++;
  s.levelTicks++;

  // 5. Conflicts age.
  s.conflicts = s.conflicts
    .map((c) => ({ ...c, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. The player moves one cell when the target is passable.
  const before = { x: s.player.x, y: s.player.y };
  if (move) {
    const [dx, dy] = DIRS[move];
    const tx = s.player.x + dx;
    const ty = s.player.y + dy;
    if (playerPassable(s, tx, ty)) {
      s.player.x = tx;
      s.player.y = ty;
    }
  }

  // 7. Pickup: a lying patch on the player's cell, while there is room.
  const pi = s.patches.findIndex((p) => p.x === s.player.x && p.y === s.player.y);
  if (pi !== -1 && s.carried.length < CARRY_MAX) {
    const [patch] = s.patches.splice(pi, 1);
    s.carried.push(patch.color);
    s.events.push('pickup');
  }

  // 8. Merge: everything carried merges on a pad; the quorum may open.
  if (tileAt(s, s.player.x, s.player.y) === 'M' && s.carried.length > 0) {
    const n = s.carried.length;
    s.score += PATCH_BASE * n * n;
    if (n >= 2 && s.carried.every((c) => c === s.carried[0])) {
      s.score += SAME_COLOR_BONUS * n;
    }
    s.merges += n;
    s.carried = [];
    s.events.push('merge');
    if (s.merges >= s.level.quorum && !s.open) {
      s.open = true;
      s.events.push('quorum');
    }
  }

  // 9. Exit: an open exit ships the level. The step ends here.
  if (s.open && tileAt(s, s.player.x, s.player.y) === 'X') {
    s.score += Math.max(0, s.level.par - s.levelTicks) * TIME_BONUS_PER_TICK;
    if (s.levelIndex + 1 < s.levels.length) {
      s.levelIndex++;
      loadLevel(s, s.levels[s.levelIndex]);
      s.events.push('level');
    } else {
      s.status = 'won';
      s.events.push('won');
    }
    return s;
  }

  // 10. Drifts move on their beat, in array order, trying their direction
  // first and then clockwise, up to four.
  const driftsMoved = s.tick % s.level.driftPeriod === 0;
  const beforeDrifts = s.drifts.map((d) => ({ x: d.x, y: d.y }));
  if (driftsMoved) {
    for (const d of s.drifts) {
      const from = CLOCKWISE.indexOf(d.dir);
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(from + k) % 4];
        const [dx, dy] = DIRS[dir];
        const tx = d.x + dx;
        const ty = d.y + dy;
        if (driftPassable(s, tx, ty)) {
          d.x = tx;
          d.y = ty;
          d.dir = dir;
          break;
        }
      }
    }

    // 11. On a movement tick, cells holding two or more drifts make a
    // conflict; every drift there reverses its direction. Cells in reading
    // order, one conflict event each.
    const cells = new Map();
    s.drifts.forEach((d, i) => {
      const key = `${d.y},${d.x}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(i);
    });
    const hitsCells = [...cells.keys()]
      .map((key) => {
        const [y, x] = key.split(',').map(Number);
        return { x, y };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);
    for (const cell of hitsCells) {
      const group = cells.get(`${cell.y},${cell.x}`);
      if (group.length < 2) continue;
      for (const i of group) s.drifts[i].dir = OPPOSITE[s.drifts[i].dir];
      if (!s.conflicts.some((c) => c.x === cell.x && c.y === cell.y)) {
        s.conflicts.push({ x: cell.x, y: cell.y, ttl: CONFLICT_TICKS });
      }
      s.events.push('conflict');
    }
  }

  // 12. Hits: immune while invulnerable, otherwise a drift on the player,
  // or a drift that swapped cells with the player this step, hits once.
  if (s.invuln > 0) {
    s.invuln--;
  } else {
    const touch = s.drifts.some((d) => d.x === s.player.x && d.y === s.player.y);
    let swap = false;
    if (driftsMoved) {
      for (let i = 0; i < s.drifts.length; i++) {
        const d = s.drifts[i];
        const o = beforeDrifts[i];
        if (d.x === before.x && d.y === before.y && o.x === s.player.x && o.y === s.player.y) {
          swap = true;
          break;
        }
      }
    }
    if (touch || swap) {
      if (s.carried.length > 0) {
        s.carried = [];
        s.invuln = INVULN_TICKS;
        s.events.push('drop');
      } else {
        s.lives--;
        s.events.push('hit');
        if (s.lives <= 0) {
          s.status = 'lost';
          s.events.push('lost');
        } else {
          s.player = { ...s.level.start };
          s.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. A patch respawns on a free spawn point, point first, then colour.
  if (
    s.status === 'playing' &&
    s.levelTicks % s.level.spawnEvery === 0 &&
    s.patches.length + s.carried.length < s.level.spawns.length
  ) {
    const free = s.level.spawns.filter(
      (sp) =>
        !s.patches.some((p) => p.x === sp.x && p.y === sp.y) &&
        !(sp.x === s.player.x && sp.y === s.player.y) &&
        !s.drifts.some((d) => d.x === sp.x && d.y === sp.y),
    );
    if (free.length > 0) {
      const spot = rngInt(s.seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      s.seed = color.seed;
      const sp = free[spot.value];
      s.patches.push({ x: sp.x, y: sp.y, color: color.value });
      s.events.push('spawn');
    }
  }

  return s;
}
