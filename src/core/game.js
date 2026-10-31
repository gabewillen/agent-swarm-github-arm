// The rules (DESIGN.md §5 to §7). Pure: nothing touches the DOM, the clock,
// or randomness outside the state's seed, and nothing changes the state it
// is given. Every state returned is plain JSON.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

// The direction a colliding drift is turned to face (§6 step 11).
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The terrain character of a cell: level.tiles hold it because the map's
// '@', 'P', and drift starts all became floor at parse (§4). Outside is wall.
function tileOf(level, x, y) {
  if (y < 0 || y >= level.height || x < 0 || x >= level.width) return '#';
  return level.tiles[y][x];
}

// One lying patch per spawn point, in reading order, each colour drawn from
// the seed in that order; every draw hands back the next seed (§3, §5).
function patchesFor(spawns, seed) {
  const patches = [];
  for (const sp of spawns) {
    const draw = rngInt(seed, COLORS);
    seed = draw.seed;
    patches.push({ x: sp.x, y: sp.y, color: draw.value });
  }
  return { patches, seed };
}

// Load the level at s.levelIndex into the state: parse it, place fresh
// patches, copy the drifts, and reset everything a level owns (§5). Score,
// lives, tick, and the PRNG state are kept.
function enterLevel(s) {
  const level = parseLevel(s.levels[s.levelIndex]);
  const { patches, seed } = patchesFor(level.spawns, s.seed);
  return {
    ...s,
    seed,
    level,
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    player: { x: level.start.x, y: level.start.y },
    carried: [],
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
    levelTicks: 0,
  };
}

// init(seed, options) builds the first state; options.levels holds the
// definitions to play (default LEVELS) and options.level the start index.
export function init(seed, options = {}) {
  return enterLevel({
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    levels: options.levels === undefined ? LEVELS : options.levels,
    levelIndex: options.level === undefined ? 0 : options.level,
    lives: START_LIVES,
    score: 0,
    merges: 0,
    open: false,
    invuln: 0,
    status: 'playing',
    paused: false,
    events: [],
    carried: [],
    conflicts: [],
  });
}

// tileAt(state, x, y) reads the level's terrain: '#', '.', 'M', 'X', 'H',
// and '#' outside the map.
export function tileAt(state, x, y) {
  return tileOf(state.level, x, y);
}

// step(state, input) returns the next state following §6's thirteen steps
// in order. input is { move, pause }; a missing or null input, or a missing
// field, means no move and no pause.
export function step(state, input) {
  // 1. A finished game returns the state as it is, events emptied.
  if (state.status !== 'playing') return { ...state, events: [] };

  const move = input && input.move ? input.move : null;
  const pause = !!(input && input.pause);

  // 2. Pause flips paused and does nothing else, not even tick.
  if (pause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }

  // 3. A paused state ignores everything else.
  if (state.paused) return { ...state, events: [] };

  const level = state.level;
  const events = [];

  // 4. The clocks advance on every playing step.
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;

  // 5. Conflicts age by one each tick and leave at zero.
  const conflicts = state.conflicts
    .map((c) => ({ ...c, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);
  const conflictAt = (x, y) => conflicts.some((c) => c.x === x && c.y === y);

  // 6. The player moves one cell when the target is passable to the player:
  //    no wall, no hold and no exit unless open, and no conflict on it.
  const playerBefore = state.player;
  let player = { ...playerBefore };
  if (move && DIRS[move]) {
    const [dx, dy] = DIRS[move];
    const nx = player.x + dx;
    const ny = player.y + dy;
    const t = tileOf(level, nx, ny);
    if (t !== '#' && (t !== 'H' || state.open) && (t !== 'X' || state.open) && !conflictAt(nx, ny)) {
      player = { x: nx, y: ny };
    }
  }

  // 7. Pickup: the patch under the player joins the hands, within
  //    CARRY_MAX, in pickup order.
  let carried = [...state.carried];
  let patches = state.patches.map((p) => ({ ...p }));
  if (carried.length < CARRY_MAX) {
    const i = patches.findIndex((p) => p.x === player.x && p.y === player.y);
    if (i !== -1) {
      carried = [...carried, patches[i].color];
      patches = patches.filter((_, j) => j !== i);
      events.push('pickup');
    }
  }

  // 8. Merge on a merge pad with patches carried: PATCH_BASE per patch,
  //    squared over the hand, plus the same-colour bonus for n >= 2.
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  if (tileOf(level, player.x, player.y) === 'M' && carried.length > 0) {
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

  // 9. Exit: with quorum open on the exit cell, the time bonus is par's
  //    remainder; another level is loaded, or the last one wins the game.
  //    Either way the step ends here, before the drifts move.
  if (open && tileOf(level, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      const loaded = enterLevel({ ...state, levelIndex: state.levelIndex + 1, score, tick });
      return { ...loaded, events: [...events, 'level'] };
    }
    return {
      ...state,
      tick,
      levelTicks,
      score,
      carried,
      conflicts,
      status: 'won',
      events: [...events, 'won'],
    };
  }

  // 10. Drifts move only every driftPeriod ticks. Each drift, in order,
  //     turns clockwise from its own direction to the first passable target:
  //     no wall, no hold, no exit (open or not), no conflict. They ignore
  //     the player, patches, and each other; boxed in, it stays and keeps
  //     its direction.
  const preDrifts = state.drifts;
  const drifts = state.drifts.map((d) => ({ ...d }));
  const driftsMoved = tick % level.driftPeriod === 0;
  if (driftsMoved) {
    for (const d of drifts) {
      const from = CLOCKWISE.indexOf(d.dir);
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(from + k) % 4];
        const [dx, dy] = DIRS[dir];
        const nx = d.x + dx;
        const ny = d.y + dy;
        const t = tileOf(level, nx, ny);
        if (t !== '#' && t !== 'H' && t !== 'X' && !conflictAt(nx, ny)) {
          d.x = nx;
          d.y = ny;
          d.dir = dir;
          break;
        }
      }
    }

    // 11. On a moving tick, every cell in reading order holding two or more
    //     drifts reverses them all, and leaves a conflict unless one is
    //     already there; one conflict event per colliding cell.
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const here = drifts.filter((d) => d.x === x && d.y === y);
        if (here.length < 2) continue;
        for (const d of here) d.dir = REVERSE[d.dir];
        if (!conflictAt(x, y)) conflicts.push({ x, y, ttl: CONFLICT_TICKS });
        events.push('conflict');
      }
    }
  }

  // 12. Hits. An invulnerable tick only counts down; otherwise a drift on
  //     the player's cell, or a moved drift that swapped cells with the
  //     player, hits: carrying, the hands are lost; otherwise a life is.
  let lives = state.lives;
  let invuln = state.invuln;
  let status = state.status;
  if (invuln > 0) {
    invuln = invuln - 1;
  } else {
    const overlapped = drifts.some((d) => d.x === player.x && d.y === player.y);
    const swapped = driftsMoved && drifts.some((d, i) =>
      (d.x !== preDrifts[i].x || d.y !== preDrifts[i].y) &&
      d.x === playerBefore.x && d.y === playerBefore.y &&
      preDrifts[i].x === player.x && preDrifts[i].y === player.y);
    if (overlapped || swapped) {
      if (carried.length > 0) {
        carried = [];
        invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        lives = lives - 1;
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

  // 13. Spawns, while still playing: on the beat of levelTicks, one patch
  //     for a free spawn point, chosen first, then its colour, both draws
  //     from the running seed. Carried patches count against the spawns.
  let seed = state.seed;
  if (status === 'playing' && levelTicks % level.spawnEvery === 0 &&
      patches.length + carried.length < level.spawns.length) {
    const free = level.spawns.filter((sp) =>
      !patches.some((p) => p.x === sp.x && p.y === sp.y) &&
      !(player.x === sp.x && player.y === sp.y) &&
      !drifts.some((d) => d.x === sp.x && d.y === sp.y));
    if (free.length > 0) {
      const place = rngInt(seed, free.length);
      seed = place.seed;
      const hue = rngInt(seed, COLORS);
      seed = hue.seed;
      const spot = free[place.value];
      patches = [...patches, { x: spot.x, y: spot.y, color: hue.value }];
      events.push('spawn');
    }
  }

  return {
    ...state,
    tick,
    levelTicks,
    score,
    lives,
    merges,
    open,
    invuln,
    status,
    events,
    carried,
    patches,
    player,
    conflicts,
    drifts,
    seed,
  };
}
