// Quorum Run — the rules (DESIGN.md §5, §6, §7).
//
// `init` and `step` are pure: every state they return is plain JSON data,
// nothing they build shares structure with the state passed in, and no
// state passed in is ever changed. All randomness flows through the
// state's seed with `rngInt`, exactly as §3 prescribes.

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

const MOVES = new Set(Object.keys(DIRS));
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// A fresh, structure-independent copy of a state (§6: step "never changes
// state or anything in it").
function copyState(s) {
  return {
    ...s,
    player: { ...s.player },
    carried: [...s.carried],
    patches: s.patches.map((p) => ({ ...p })),
    drifts: s.drifts.map((d) => ({ ...d })),
    conflicts: s.conflicts.map((c) => ({ ...c })),
  };
}

// Load level `state.levelIndex` of `state.levels`: parse it, place the
// player on the start, draw one fresh colour per spawn point in reading
// order from the running seed, and reset everything per-level. Keeps
// score, lives, tick, and the seed (§5).
function loadLevel(state, events) {
  const level = parseLevel(state.levels[state.levelIndex]);
  let seed = state.seed;
  const patches = [];
  for (const sp of level.spawns) {
    const r = rngInt(seed, COLORS);
    patches.push({ x: sp.x, y: sp.y, color: r.value });
    seed = r.seed;
  }
  return {
    ...state,
    level,
    player: { x: level.start.x, y: level.start.y },
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    conflicts: [],
    carried: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
    seed,
    events: events ?? state.events,
  };
}

// The first state for a seed and options. `options.levels` defaults to
// the shipped pack and `options.level` to the first level (§5).
export function init(seed, options = {}) {
  const base = {
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    levels: options.levels ?? LEVELS,
    levelIndex: options.level ?? 0,
    score: 0,
    lives: START_LIVES,
    merges: 0,
    open: false,
    invuln: 0,
    status: 'playing',
    paused: false,
    events: [],
  };
  return loadLevel(base);
}

// The level's terrain at a cell, `#` outside the map (§5).
export function tileAt(state, x, y) {
  if (y < 0 || y >= state.level.height || x < 0 || x >= state.level.width) return '#';
  return state.level.tiles[y][x];
}

// Where the player may stand: not a wall, a hold, or the exit unless the
// quorum is open, and never on a conflict.
function passableForPlayer(s, x, y) {
  const t = tileAt(s, x, y);
  if (t === '#' || ((t === 'H' || t === 'X') && !s.open)) return false;
  return !s.conflicts.some((c) => c.x === x && c.y === y);
}

// Where a drift may go: not a wall, a hold, or the exit — open or not —
// and never on a conflict. Patches, merge pads, and the player mean
// nothing to a drift (§6 step 10).
function passableForDrift(s, x, y) {
  const t = tileAt(s, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !s.conflicts.some((c) => c.x === x && c.y === y);
}

// One step of the game (§6), in the order the design fixes.
export function step(state, input) {
  // 1. A finished game does nothing but empty its events.
  if (state.status !== 'playing') return { ...state, events: [] };

  const move = input && MOVES.has(input.move) ? input.move : null;
  const pause = Boolean(input && input.pause);

  // 2. A pause request flips `paused` and changes nothing else.
  if (pause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }

  // 3. While paused, nothing happens.
  if (state.paused) return { ...state, events: [] };

  // 4. Time passes exactly once per playing step.
  const s = copyState(state);
  s.tick = state.tick + 1;
  s.levelTicks = state.levelTicks + 1;
  const events = [];

  // 5. Conflicts age; a conflict at 0 is gone.
  s.conflicts = s.conflicts
    .map((c) => ({ ...c, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. The player moves when the target cell is passable.
  const prevX = s.player.x;
  const prevY = s.player.y;
  if (move) {
    const [dx, dy] = DIRS[move];
    if (passableForPlayer(s, prevX + dx, prevY + dy)) {
      s.player = { x: prevX + dx, y: prevY + dy };
    }
  }

  // 7. Pickup: a patch under the player joins the carry when there is
  // room; otherwise it stays on the floor.
  if (s.carried.length < CARRY_MAX) {
    const i = s.patches.findIndex((p) => p.x === s.player.x && p.y === s.player.y);
    if (i >= 0) {
      const color = s.patches[i].color;
      s.patches = s.patches.filter((p, j) => j !== i);
      s.carried = [...s.carried, color];
      events.push('pickup');
    }
  }

  // 8. Merge: on a pad with a full belly, score and empty the carry.
  if (s.carried.length > 0 && tileAt(s, s.player.x, s.player.y) === 'M') {
    const n = s.carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && s.carried.every((c) => c === s.carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    s.score += gain;
    s.merges += n;
    s.carried = [];
    events.push('merge');
    if (!s.open && s.merges >= state.level.quorum) {
      s.open = true;
      events.push('quorum');
    }
  }

  // 9. Exit: with the quorum open, ship the level for its time bonus and
  // either load the next one or win the game. The step ends here.
  if (s.open && tileAt(s, s.player.x, s.player.y) === 'X') {
    s.score += Math.max(0, state.level.par - s.levelTicks) * TIME_BONUS_PER_TICK;
    const next = s.levelIndex + 1;
    if (next < s.levels.length) {
      events.push('level');
      return loadLevel({ ...s, levelIndex: next }, events);
    }
    s.status = 'won';
    events.push('won');
    return { ...s, events };
  }

  // 10. On a drift tick every drift, in array order, takes the first of
  // its direction and the three clockwise turns that is passable; boxed
  // in, it stays and keeps its direction. Where every drift stood is
  // remembered for the swap check below.
  const wasAt = s.drifts.map((d) => ({ x: d.x, y: d.y }));
  const driftsMoved = s.tick % state.level.driftPeriod === 0;
  if (driftsMoved) {
    for (const d of s.drifts) {
      const from = CLOCKWISE.indexOf(d.dir);
      for (let k = 0; k < CLOCKWISE.length; k++) {
        const dir = CLOCKWISE[(from + k) % CLOCKWISE.length];
        const [dx, dy] = DIRS[dir];
        if (passableForDrift(s, d.x + dx, d.y + dy)) {
          d.dir = dir;
          d.x += dx;
          d.y += dy;
          break;
        }
      }
    }

    // 11. Two or more drifts on one cell reverse there and mark the cell,
    // handled cell by cell in reading order.
    const counts = new Map();
    for (const d of s.drifts) {
      const key = `${d.x},${d.y}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const cells = [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .map(([key]) => key.split(',').map(Number))
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [cx, cy] of cells) {
      for (const d of s.drifts) {
        if (d.x === cx && d.y === cy) d.dir = REVERSE[d.dir];
      }
      if (!s.conflicts.some((c) => c.x === cx && c.y === cy)) {
        s.conflicts = [...s.conflicts, { x: cx, y: cy, ttl: CONFLICT_TICKS }];
      }
      events.push('conflict');
    }
  }

  // 12. Hits, every step: while immune they cannot land, and immunity
  // wears off here. A drift standing on the player, or one that swapped
  // cells with them, hits.
  if (s.invuln > 0) {
    s.invuln -= 1;
  } else {
    const crushed = s.drifts.some((d) => d.x === s.player.x && d.y === s.player.y);
    const swapped = s.drifts.some((d, i) =>
      d.x === prevX && d.y === prevY && wasAt[i].x === s.player.x && wasAt[i].y === s.player.y);
    if (crushed || swapped) {
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
          s.player = { x: state.level.start.x, y: state.level.start.y };
          s.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns: on schedule and with a spawn point to spare, the seed
  // picks the point first and then the colour.
  if (s.status === 'playing' && s.levelTicks % state.level.spawnEvery === 0) {
    if (s.patches.length + s.carried.length < state.level.spawns.length) {
      const free = state.level.spawns.filter(
        (sp) =>
          !s.patches.some((p) => p.x === sp.x && p.y === sp.y) &&
          !(s.player.x === sp.x && s.player.y === sp.y) &&
          !s.drifts.some((d) => d.x === sp.x && d.y === sp.y));
      if (free.length > 0) {
        const pick = rngInt(s.seed, free.length);
        s.seed = pick.seed;
        const spot = free[pick.value];
        const color = rngInt(s.seed, COLORS);
        s.seed = color.seed;
        s.patches = [...s.patches, { x: spot.x, y: spot.y, color: color.value }];
        events.push('spawn');
      }
    }
  }

  return { ...s, events };
}
