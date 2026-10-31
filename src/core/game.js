// The rules (DESIGN.md §5 to §7): init, step, tileAt. Pure: step never
// changes the state or anything reachable from it, and every state it
// returns is plain JSON. All randomness comes from the state's seed.

import { LEVELS } from '../data/levels.js';
import { parseLevel } from './level.js';
import { rngInt } from './rng.js';
import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';

const OPPOSITE = Object.freeze({ up: 'down', down: 'up', left: 'right', right: 'left' });

// The terrain character at a cell ('#' off the map).
export function tileAt(state, x, y) {
  const tiles = state && state.level ? state.level.tiles : undefined;
  const row = Array.isArray(tiles) ? tiles[y] : undefined;
  return typeof row === 'string' && Number.isInteger(x) && x >= 0 && x < row.length ? row[x] : '#';
}

// Build the per-level fields of a state for levels[levelIndex], drawing
// one fresh patch colour per spawn point from the state's seed.
function loadLevelInto(s) {
  const level = parseLevel(s.levels[s.levelIndex]);
  const next = {
    ...s,
    level,
    player: { ...level.start },
    carried: [],
    patches: [],
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
  };
  let seed = next.seed;
  next.patches = level.spawns.map((p) => {
    const r = rngInt(seed, COLORS);
    seed = r.seed;
    return { x: p.x, y: p.y, color: r.value };
  });
  next.seed = seed;
  return next;
}

// init(seed, options): the first state.
export function init(seed, options = {}) {
  const levels = options.levels !== undefined ? options.levels : LEVELS;
  const levelIndex = options.level !== undefined ? options.level : 0;
  return loadLevelInto({
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    score: 0,
    lives: START_LIVES,
    status: 'playing',
    paused: false,
    events: [],
  });
}

// step(state, input): the next state (§6, in order).
export function step(state, input) {
  // 1. A game that is not playing no longer changes.
  if (!state) return state;
  if (state.status !== 'playing') return { ...state, events: [] };

  const inMove = input && typeof input === 'object' && DIRS[input.move] ? input.move : null;
  const inPause = input && typeof input === 'object' && input.pause === true;
  // 2. A pause flips paused and nothing else.
  if (inPause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }
  // 3. A paused game does nothing.
  if (state.paused) return { ...state, events: [] };

  const level = state.level;
  const levels = state.levels;
  const levelIndex = state.levelIndex;

  // 4. The tick and the level tick grow by one; events start empty.
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;
  const events = [];

  // 5. Conflicts age: each ttl drops by one, and conflicts at 0 go.
  const conflicts = [];
  for (const c of state.conflicts) {
    const ttl = (typeof c.ttl === 'number' ? c.ttl : 0) - 1;
    if (ttl > 0) conflicts.push({ x: c.x, y: c.y, ttl });
  }
  const onConflict = (x, y) => conflicts.some((c) => c.x === x && c.y === y);

  // 6. The player moves one cell when the target is passable to the player.
  const playerBefore = { ...state.player };
  let player = { ...state.player };
  if (inMove) {
    const [dx, dy] = DIRS[inMove];
    const x = state.player.x + dx;
    const y = state.player.y + dy;
    const t = tileAt(state, x, y);
    if (t !== '#' && (t === '.' || t === 'M' || ((t === 'H' || t === 'X') && state.open))
      && !onConflict(x, y)) {
      player = { x, y };
    }
  }

  // 7. Pickup: the patch under the player leaves the floor, ordered.
  let carried = [...state.carried];
  let patches = state.patches.map((p) => ({ x: p.x, y: p.y, color: p.color }));
  if (carried.length < CARRY_MAX) {
    const i = patches.findIndex((p) => p.x === player.x && p.y === player.y);
    if (i >= 0) {
      carried.push(patches[i].color);
      patches.splice(i, 1);
      events.push('pickup');
    }
  }

  // 8. Merge: patches on a merge pad score, count, and may open the level.
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  const here = tileAt(state, player.x, player.y);
  if (here === 'M' && carried.length > 0) {
    const n = carried.length;
    score += PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) score += SAME_COLOR_BONUS * n;
    merges += n;
    carried = [];
    events.push('merge');
    if (!open && merges >= level.quorum) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. Exit: an open exit ships the level, or wins the game.
  if (open && here === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (levelIndex + 1 < levels.length) {
      const fresh = loadLevelInto({
        ...state,
        tick,
        seed: state.seed,
        score,
        lives: state.lives,
        status: 'playing',
        paused: false,
        levelIndex: levelIndex + 1,
        events: ['level'],
      });
      return fresh;
    }
    return {
      ...state,
      score,
      player,
      carried,
      patches,
      status: 'won',
      paused: false,
      events: ['won'],
    };
  }

  // 10. Drifts move on their period, in array order, clockwise fallback.
  let drifts;
  const driftsMoved = tick % level.driftPeriod === 0;
  if (driftsMoved) {
    drifts = state.drifts.map((d) => {
      const start = Math.max(0, CLOCKWISE.indexOf(d.dir));
      for (let k = 0; k < CLOCKWISE.length; k++) {
        const dir = CLOCKWISE[(start + k) % CLOCKWISE.length];
        const [dx, dy] = DIRS[dir];
        const x = d.x + dx;
        const y = d.y + dy;
        const t = tileAt(state, x, y);
        if (t === '#' || t === 'H' || t === 'X') continue;
        if (onConflict(x, y)) continue;
        return { x, y, dir };
      }
      return { x: d.x, y: d.y, dir: d.dir };
    });
  } else {
    drifts = state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  }

  // 11. Collisions, only on a tick when drifts moved, in reading order.
  if (driftsMoved) {
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const group = drifts.filter((d) => d.x === x && d.y === y);
        if (group.length < 2) continue;
        for (const d of group) {
          if (OPPOSITE[d.dir]) d.dir = OPPOSITE[d.dir];
        }
        if (!conflicts.some((c) => c.x === x && c.y === y)) {
          conflicts.push({ x, y, ttl: CONFLICT_TICKS });
        }
        events.push('conflict');
      }
    }
  }

  // 12. Hits: invulnerability ticks down, otherwise the player is hit.
  let invuln = state.invuln;
  let lives = state.lives;
  let status = 'playing';
  if (invuln > 0) {
    invuln -= 1;
  } else {
    let hit = drifts.some((d) => d.x === player.x && d.y === player.y);
    if (!hit) {
      for (let i = 0; i < drifts.length; i++) {
        const d = drifts[i];
        const before = state.drifts[i];
        if (d.x === playerBefore.x && d.y === playerBefore.y
          && before && before.x === player.x && before.y === player.y) {
          hit = true;
          break;
        }
      }
    }
    if (hit) {
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
          player = { ...level.start };
          invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawns, at most one patch per step, from the seed.
  let seed = state.seed;
  if (status === 'playing' && levelTicks % level.spawnEvery === 0
    && patches.length + carried.length < level.spawns.length) {
    const onPatch = (sx, sy) => patches.some((p) => p.x === sx && p.y === sy);
    const onDrift = (sx, sy) => drifts.some((d) => d.x === sx && d.y === sy);
    const free = level.spawns.filter((p) => !onPatch(p.x, p.y) && !onDrift(p.x, p.y)
      && !(player.x === p.x && player.y === p.y));
    if (free.length > 0) {
      const spot = rngInt(seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      const chosen = free[spot.value];
      patches = [...patches, { x: chosen.x, y: chosen.y, color: color.value }];
      seed = color.seed;
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
    paused: false,
    events,
  };
}
