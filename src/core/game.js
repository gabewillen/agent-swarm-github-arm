// Quorum Run — the rules (DESIGN.md §5 to §7).
// Pure: the state is plain JSON data, `step` never mutates the state or
// input it is given, and randomness comes only from the state's seed.

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

// A drift that hit another reverses: up with down, left with right.
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined) return '#';
  const ch = row[x];
  return ch === undefined ? '#' : ch;
}

// A level's fresh fields: parse the definition and draw one colour per
// spawn point, in reading order, replacing the seed as it goes. Used at
// `init` and whenever an open exit loads the next level.
function freshLevelFields(def, seed) {
  const level = parseLevel(def);
  let s = seed;
  const patches = level.spawns.map((spot) => {
    const r = rngInt(s, COLORS);
    s = r.seed;
    return { x: spot.x, y: spot.y, color: r.value };
  });
  return { level, seed: s, patches };
}

export function init(seed, options) {
  const opts = options ?? {};
  const levels = opts.levels ?? LEVELS;
  const levelIndex = opts.level ?? 0;
  const fields = freshLevelFields(levels[levelIndex], seed >>> 0);
  const level = fields.level;
  return {
    seed: fields.seed,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level,
    player: { x: level.start.x, y: level.start.y },
    carried: [],
    patches: fields.patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
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

function conflictAt(list, x, y) {
  return list.some((c) => c.x === x && c.y === y);
}

function loadNextLevel(step) {
  const fields = freshLevelFields(step.levels[step.levelIndex + 1], step.seed);
  step.level = fields.level;
  step.seed = fields.seed;
  step.patches = fields.patches;
  step.levelIndex += 1;
  step.player = { x: fields.level.start.x, y: fields.level.start.y };
  step.carried = [];
  step.drifts = fields.level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  step.conflicts = [];
  step.merges = 0;
  step.open = false;
  step.invuln = 0;
  step.levelTicks = 0;
}

export function step(state, input) {
  // 1. A game that is over no longer changes.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause input flips `paused`; nothing else happens.
  if (input != null && input.pause === true) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // 3. While paused, nothing moves and no tick passes.
  if (state.paused) return { ...state, events: [] };

  const level = state.level;

  // 4. The new state starts as a copy; arrays are copied too.
  const next = {
    ...state,
    tick: state.tick + 1,
    levelTicks: state.levelTicks + 1,
    player: { ...state.player },
    carried: [...state.carried],
    patches: [...state.patches],
    drifts: state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    conflicts: [],
    events: [],
  };

  // 5. Conflicts age; the ones at 0 go.
  const conflicts = [];
  for (const c of state.conflicts) {
    if (c.ttl > 1) conflicts.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }
  next.conflicts = conflicts;

  // 6. The player moves one cell, when the target is passable: not a
  // wall, not a hold or the exit unless open, and no conflict on it (a
  // conflict that aged away this step has already gone).
  const oldPlayer = { x: state.player.x, y: state.player.y };
  const vec = input == null ? null : DIRS[input.move];
  if (vec !== undefined && vec !== null) {
    const nx = oldPlayer.x + vec[0];
    const ny = oldPlayer.y + vec[1];
    const t = tileAt(state, nx, ny);
    const passable = t !== '#'
      && ((t !== 'H' && t !== 'X') || state.open)
      && !conflictAt(conflicts, nx, ny);
    if (passable) {
      next.player = { x: nx, y: ny };
    }
  }

  // 7. Pickup: one patch under the player joins the carried ones.
  for (let i = 0; i < next.patches.length; i++) {
    const p = next.patches[i];
    if (p.x === next.player.x && p.y === next.player.y) {
      if (next.carried.length < CARRY_MAX) {
        next.patches = next.patches.filter((_, j) => j !== i);
        next.carried = [...next.carried, p.color];
        next.events.push('pickup');
      }
      break;
    }
  }

  // 8. Merge: the patches carried land on a merge pad.
  if (next.carried.length > 0 && tileAt(next, next.player.x, next.player.y) === 'M') {
    const n = next.carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && next.carried.every((c) => c === next.carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    next.score = state.score + gain;
    next.merges = state.merges + n;
    next.carried = [];
    next.events.push('merge');
    if (next.merges >= level.quorum && !next.open) {
      next.open = true;
      next.events.push('quorum');
    }
  }

  // 9. Exit: ship the level, load the next, or win.
  if (next.open && tileAt(next, next.player.x, next.player.y) === 'X') {
    next.score += Math.max(0, level.par - next.levelTicks) * TIME_BONUS_PER_TICK;
    if (next.levelIndex + 1 < next.levels.length) {
      loadNextLevel(next);
      next.events.push('level');
      return next;
    }
    next.status = 'won';
    next.events.push('won');
    return next;
  }

  // 10. On a drift tick each drift, in array order, tries its direction
  // then the next ones clockwise.
  const driftTick = next.tick % level.driftPeriod === 0;
  let driftedPre = null;
  if (driftTick) {
    driftedPre = next.drifts.map((d) => ({ x: d.x, y: d.y }));
    for (const d of next.drifts) {
      const from = CLOCKWISE.indexOf(d.dir);
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(from + k) % 4];
        const [dx, dy] = DIRS[dir];
        const nx = d.x + dx;
        const ny = d.y + dy;
        const t = tileAt(state, nx, ny);
        // A drift never crosses a hold or the exit, open or not.
        if (t === '#' || t === 'H' || t === 'X') continue;
        if (conflictAt(conflicts, nx, ny)) continue;
        d.x = nx;
        d.y = ny;
        d.dir = dir;
        break;
      }
    }

    // 11. Drifts sharing a cell collide: they reverse, a conflict starts,
    // and the conflict event fires once for the cell.
    const byCell = new Map();
    for (let i = 0; i < next.drifts.length; i++) {
      const d = next.drifts[i];
      const key = d.y + ',' + d.x;
      let ids = byCell.get(key);
      if (ids === undefined) byCell.set(key, (ids = []));
      ids.push(i);
    }
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const ids = byCell.get(y + ',' + x);
        if (ids === undefined || ids.length < 2) continue;
        for (const id of ids) next.drifts[id].dir = REVERSE[next.drifts[id].dir];
        if (!conflictAt(next.conflicts, x, y)) {
          next.conflicts.push({ x, y, ttl: CONFLICT_TICKS });
        }
        next.events.push('conflict');
      }
    }
  }

  // 12. Hits: invulnerability counts down; otherwise the drift on the
  // player, or one that swapped cells with them, hits.
  let hit = false;
  for (const d of next.drifts) {
    if (d.x === next.player.x && d.y === next.player.y) {
      hit = true;
      break;
    }
  }
  if (!hit && driftedPre !== null) {
    for (let i = 0; i < next.drifts.length; i++) {
      const d = next.drifts[i];
      const pre = driftedPre[i];
      const swapped = d.x === oldPlayer.x && d.y === oldPlayer.y
        && pre.x === next.player.x && pre.y === next.player.y;
      if (swapped && (oldPlayer.x !== next.player.x || oldPlayer.y !== next.player.y)) {
        hit = true;
        break;
      }
    }
  }

  if (next.invuln > 0) {
    next.invuln = next.invuln - 1;
  } else if (hit) {
    if (next.carried.length > 0) {
      // Carrying, the patches drop and the player stays put.
      next.carried = [];
      next.invuln = INVULN_TICKS;
      next.events.push('drop');
    } else {
      next.lives = state.lives - 1;
      next.events.push('hit');
      if (next.lives <= 0) {
        next.lives = 0;
        next.status = 'lost';
        next.events.push('lost');
      } else {
        next.player = { x: level.start.x, y: level.start.y };
        next.invuln = INVULN_TICKS;
      }
    }
  }

  // 13. Spawns: on the level's beat, at most one patch appears.
  if (next.status === 'playing' && next.levelTicks % level.spawnEvery === 0
    && next.patches.length + next.carried.length < level.spawns.length) {
    const free = level.spawns.filter(
      (spot) => !next.patches.some((p) => p.x === spot.x && p.y === spot.y)
        && !(next.player.x === spot.x && next.player.y === spot.y)
        && !next.drifts.some((d) => d.x === spot.x && d.y === spot.y),
    );
    if (free.length > 0) {
      const rSpot = rngInt(next.seed, free.length);
      const spot = free[rSpot.value];
      const rColor = rngInt(rSpot.seed, COLORS);
      next.seed = rColor.seed;
      next.patches = [...next.patches, { x: spot.x, y: spot.y, color: rColor.value }];
      next.events.push('spawn');
    }
  }

  return next;
}
