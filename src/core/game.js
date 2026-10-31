// Quorum Run — the rules (DESIGN.md §5 state, §6 a step, §7 events).
// Pure core: no DOM, no Math.random; every draw flows from state.seed.

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

const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const EMPTY_INPUT = { move: null, pause: false };

// §5: build the per-level slice of a state — the parsed level, one patch
// per spawn point (colours drawn in reading order), and copies of drifts.
// The seed carries the draws forward.
function buildLevelState(levels, levelIndex, seed) {
  const level = parseLevel(levels[levelIndex]);
  let s = seed;
  const patches = level.spawns.map((sp) => {
    const r = rngInt(s, COLORS);
    s = r.seed;
    return { x: sp.x, y: sp.y, color: r.value };
  });
  const drifts = level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  return { level, patches, drifts, seed: s };
}

export function init(seed, options) {
  const opts = options || {};
  const levels = opts.levels === undefined ? LEVELS : opts.levels;
  const levelIndex = opts.level === undefined ? 0 : opts.level;
  const built = buildLevelState(levels, levelIndex, (seed || 0) >>> 0);
  return {
    seed: built.seed,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level: built.level,
    player: { x: built.level.start.x, y: built.level.start.y },
    carried: [],
    patches: built.patches,
    drifts: built.drifts,
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

// §5: terrain at a cell, '#' outside the map.
export function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined) return '#';
  const ch = row[x];
  return ch === undefined ? '#' : ch;
}

// A player may enter everything but walls, closed holds and exits, and
// cells holding a conflict.
function playerCanEnter(state, conflicts, x, y) {
  const t = tileAt(state, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !state.open) return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// A drift may enter neither walls nor holds nor the exit (open or not),
// and not a conflict. Patches, merge pads, and other drifts mean nothing
// to it.
function driftCanEnter(state, conflicts, x, y) {
  const t = tileAt(state, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

function conflictsOn(conflicts, x, y) {
  return conflicts.some((c) => c.x === x && c.y === y);
}

// §6 step 10: each drift tries its own direction, then the next clockwise,
// up to four, taking the first passable target; boxed in, it stays.
function moveDrifts(state, conflicts) {
  return state.drifts.map((d) => {
    const at = CLOCKWISE.indexOf(d.dir);
    for (let i = 0; i < CLOCKWISE.length; i++) {
      const dir = CLOCKWISE[(at + i) % CLOCKWISE.length];
      const nx = d.x + DIRS[dir][0];
      const ny = d.y + DIRS[dir][1];
      if (driftCanEnter(state, conflicts, nx, ny)) return { x: nx, y: ny, dir };
    }
    return { x: d.x, y: d.y, dir: d.dir };
  });
}

export function step(state, input) {
  const inp = input === null || input === undefined ? EMPTY_INPUT : input;
  const move = typeof inp.move === 'string' && DIRS[inp.move] ? inp.move : null;
  const pause = inp.pause === true;

  // 1. a finished game no longer changes (its events list is emptied).
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. a pause flips the flag and does nothing else; no tick passes.
  if (pause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // 3. everything waits while paused.
  if (state.paused) return { ...state, events: [] };

  const level = state.level;
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;
  const events = [];

  // 5. conflicts age one tick; those that reach 0 are gone.
  const conflicts = [];
  for (const c of state.conflicts) {
    const ttl = c.ttl - 1;
    if (ttl > 0) conflicts.push({ x: c.x, y: c.y, ttl });
  }

  // 6. the player moves one cell when the target is passable.
  const from = { x: state.player.x, y: state.player.y };
  let player = { ...from };
  if (move !== null) {
    const tx = from.x + DIRS[move][0];
    const ty = from.y + DIRS[move][1];
    if (playerCanEnter(state, conflicts, tx, ty)) player = { x: tx, y: ty };
  }

  let carried = state.carried.slice();
  let patches = state.patches.map((p) => ({ ...p }));

  // 7. a patch under the player, with hands free, is picked up.
  if (carried.length < CARRY_MAX) {
    const i = patches.findIndex((p) => p.x === player.x && p.y === player.y);
    if (i !== -1) {
      carried = [...carried, patches[i].color];
      patches = patches.filter((_, j) => j !== i);
      events.push('pickup');
    }
  }

  // 8. a merge pad under a carrying player merges every carried patch.
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  if (carried.length > 0 && tileAt(state, player.x, player.y) === 'M') {
    const n = carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) gain += SAME_COLOR_BONUS * n;
    score += gain;
    merges += n;
    carried = [];
    events.push('merge');
    if (!open && merges >= level.quorum) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. an open exit under the player ships the level — or wins the game —
  //    and ends the step before drifts move.
  if (open && tileAt(state, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      const built = buildLevelState(state.levels, state.levelIndex + 1, state.seed);
      return {
        ...state,
        seed: built.seed,
        tick,
        levelIndex: state.levelIndex + 1,
        level: built.level,
        player: { x: built.level.start.x, y: built.level.start.y },
        carried: [],
        patches: built.patches,
        drifts: built.drifts,
        conflicts: [],
        score,
        merges: 0,
        open: false,
        invuln: 0,
        levelTicks: 0,
        events: [...events, 'level'],
      };
    }
    return {
      ...state,
      tick,
      levelTicks,
      player,
      carried,
      patches,
      conflicts,
      score,
      status: 'won',
      events: [...events, 'won'],
    };
  }

  // 10. drifts move on their period's ticks, in array order, ignoring
  //     everything but terrain and conflicts.
  const driftsMoved = tick % level.driftPeriod === 0;
  let drifts = state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  if (driftsMoved) drifts = moveDrifts(state, conflicts);

  // 11. on a moving tick, cells holding two or more drifts leave a
  //     conflict and reverse every drift on them, cells in reading order.
  if (driftsMoved) {
    const groups = new Map();
    for (let i = 0; i < drifts.length; i++) {
      const d = drifts[i];
      const key = d.x + ':' + d.y;
      let g = groups.get(key);
      if (!g) {
        g = [];
        groups.set(key, g);
      }
      g.push(i);
    }
    const cells = [...groups.entries()]
      .map(([k, g]) => {
        const i = k.indexOf(':');
        return { x: Number(k.slice(0, i)), y: Number(k.slice(i + 1)), g };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);
    for (const cell of cells) {
      if (cell.g.length < 2) continue;
      for (const i of cell.g) drifts[i].dir = REVERSE[drifts[i].dir];
      if (!conflictsOn(conflicts, cell.x, cell.y)) {
        conflicts.push({ x: cell.x, y: cell.y, ttl: CONFLICT_TICKS });
      }
      events.push('conflict');
    }
  }

  // 12. hits: a drift on the player, or one that swapped cells with them.
  let lives = state.lives;
  let invuln = state.invuln;
  let status = state.status;
  if (invuln > 0) {
    invuln -= 1;
  } else {
    const onPlayer = drifts.some((d) => d.x === player.x && d.y === player.y);
    const swap = driftsMoved
      && drifts.some((d, i) => {
        const was = state.drifts[i];
        const moved = d.x !== was.x || d.y !== was.y;
        return moved
          && d.x === from.x && d.y === from.y
          && was.x === player.x && was.y === player.y;
      });
    if (onPlayer || swap) {
      if (carried.length > 0) {
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

  // 13. spawns: one patch at most per tick, on a free spawn point, drawn
  //     from the seed — the point first, then the colour.
  let seed = state.seed;
  if (
    status === 'playing'
    && levelTicks % level.spawnEvery === 0
    && patches.length + carried.length < level.spawns.length
  ) {
    const free = level.spawns.filter(
      (sp) => !patches.some((p) => p.x === sp.x && p.y === sp.y)
        && !(player.x === sp.x && player.y === sp.y)
        && !drifts.some((d) => d.x === sp.x && d.y === sp.y),
    );
    if (free.length > 0) {
      const spot = rngInt(seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      seed = color.seed;
      const place = free[spot.value];
      patches = [...patches, { x: place.x, y: place.y, color: color.value }];
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
    merges,
    open,
    lives,
    invuln,
    status,
    events,
  };
}
