// Quorum Run — the rules (DESIGN.md §5 to §7). Pure: every step builds new
// state and never changes the state or the input it is given. Randomness
// comes only from the state's seed through the §3 PRNG.
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

// The terrain character of a cell of a parsed level ('#', '.', 'M', 'X', 'H').
function terrainOf(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined) return '#';
  const ch = row[x];
  return ch === undefined ? '#' : ch;
}

// A cell a player may enter: not a wall, a hold or the exit only when the
// level is open, and not a conflict cell.
function passableToPlayer(level, open, conflicts, x, y) {
  const t = terrainOf(level, x, y);
  if (t === '#' || ((t === 'H' || t === 'X') && !open)) return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// A cell a drift may enter: not a wall, hold, or exit (open or not), and
// not a conflict cell. Drifts ignore the player, patches, and drifts.
function passableToDrift(level, conflicts, x, y) {
  const t = terrainOf(level, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// Parses one definition and draws the first generation of patches from the
// seed: one patch per spawn point, in reading order, one colour draw each.
function buildLevelState(levels, index, seed) {
  const level = parseLevel(levels[index]);
  let s = seed >>> 0;
  const patches = level.spawns.map((sp) => {
    const draw = rngInt(s, COLORS);
    s = draw.seed;
    return { x: sp.x, y: sp.y, color: draw.value };
  });
  return {
    level,
    player: { x: level.start.x, y: level.start.y },
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    seed: s,
  };
}

function firstState(levels, level, seed) {
  const drawn = buildLevelState(levels, level, seed);
  return {
    seed: drawn.seed,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex: level,
    level: drawn.level,
    player: drawn.player,
    carried: [],
    patches: drawn.patches,
    drifts: drawn.drifts,
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

export function init(seed, options) {
  const levels = (options && options.levels) || LEVELS;
  const starting = options && options.level !== undefined ? options.level : 0;
  return firstState(levels, starting, seed >>> 0);
}

export function tileAt(state, x, y) {
  return terrainOf(state.level, x, y);
}

export function step(state, input) {
  // 1. A game that is not playing no longer changes.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause input flips paused and returns. A pause wins over a move.
  if (input !== null && input !== undefined && input.pause === true) {
    const nowPaused = !state.paused;
    return { ...state, paused: nowPaused, events: [nowPaused ? 'pause' : 'resume'] };
  }
  // 3. While paused nothing moves and no tick passes.
  if (state.paused) return { ...state, events: [] };

  const moveName = input && DIRS[input.move] ? input.move : null;

  // 4. The clocks grow by one; the step's events start empty. Every array
  // the step touches is copied first (§14).
  const level = state.level;
  let seed = state.seed;
  let conflicts = state.conflicts.map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }));

  // 5. Conflicts age: each ttl drops by one, and conflicts at 0 go.
  conflicts = conflicts.filter((c) => c.ttl > 0);

  const events = [];

  // 6. The player moves one cell when the target is passable to the player.
  const playerBefore = { x: state.player.x, y: state.player.y };
  let player = { ...playerBefore };
  if (moveName) {
    const [dx, dy] = DIRS[moveName];
    const tx = playerBefore.x + dx;
    const ty = playerBefore.y + dy;
    if (passableToPlayer(level, state.open, conflicts, tx, ty)) player = { x: tx, y: ty };
  }

  let carried = state.carried.slice();
  let patches = state.patches.map((p) => ({ ...p }));
  let merges = state.merges;
  let open = state.open;
  let score = state.score;
  let status = 'playing';

  // 7. Pickup: a patch on the player's cell leaves the floor while fewer
  // than CARRY_MAX are carried.
  const onPatch = patches.findIndex((p) => p.x === player.x && p.y === player.y);
  if (onPatch !== -1 && carried.length < CARRY_MAX) {
    carried.push(patches[onPatch].color);
    patches = patches.filter((_, i) => i !== onPatch);
    events.push('pickup');
  }

  // 8. Merge: on a merge pad with n carried, score
  // PATCH_BASE * n * n (+ SAME_COLOR_BONUS * n for a same-colour merge of
  // n >= 2); merges grows by n and carried empties.
  if (terrainOf(level, player.x, player.y) === 'M' && carried.length > 0) {
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

  // 9. Exit: on the exit of an open level the time bonus applies, then the
  // next level loads, or the game is won. The step ends here either way.
  if (open && terrainOf(level, player.x, player.y) === 'X') {
    score += Math.max(0, level.par - state.levelTicks - 1) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      // Loading a level keeps score, lives, tick, and the PRNG state, and
      // resets the per-level fields.
      const next = buildLevelState(state.levels, state.levelIndex + 1, seed);
      return {
        ...state,
        seed: next.seed,
        tick: state.tick + 1,
        levelTicks: 0,
        levelIndex: state.levelIndex + 1,
        level: next.level,
        player: next.player,
        patches: next.patches,
        drifts: next.drifts,
        carried: [],
        conflicts: [],
        merges: 0,
        open: false,
        invuln: 0,
        status: 'playing',
        paused: false,
        events: [...events, 'level'],
        score,
      };
    }
    return {
      ...state,
      tick: state.tick + 1,
      levelTicks: state.levelTicks + 1,
      score,
      status: 'won',
      paused: false,
      events: [...events, 'won'],
      carried: [],
    };
  }

  // 10. Drifts move when tick % driftPeriod === 0. Each drift, in array
  // order, tries its own direction and then clockwise.
  const drifts = state.drifts.map((d) => ({ ...d }));
  const driftsBefore = state.drifts.map((d) => ({ x: d.x, y: d.y }));
  const movedTick = (state.tick + 1) % level.driftPeriod === 0;
  if (movedTick) {
    for (const d of drifts) {
      const facing = CLOCKWISE.indexOf(d.dir);
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(facing + k) % 4];
        const [dx, dy] = DIRS[dir];
        const tx = d.x + dx;
        const ty = d.y + dy;
        if (passableToDrift(level, conflicts, tx, ty)) {
          d.x = tx;
          d.y = ty;
          d.dir = dir;
          break;
        }
      }
    }
  }

  // 11. Drift collisions, only on a tick when drifts moved: per cell, in
  // reading order, every drift reverses and a conflict appears unless one
  // is already there, once an event per cell.
  if (movedTick) {
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const here = drifts.filter((d) => d.x === x && d.y === y);
        if (here.length < 2) continue;
        for (const d of here) d.dir = REVERSE[d.dir];
        if (!conflicts.some((c) => c.x === x && c.y === y)) conflicts.push({ x, y, ttl: CONFLICT_TICKS });
        events.push('conflict');
      }
    }
  }

  // 12. Hits: invuln above zero drops by one and nothing hits. A drift on
  // the player, or one that swapped cells with the player while moving,
  // hits: carrying drops the carried, and an empty-handed hit costs a life.
  let lives = state.lives;
  let invuln = state.invuln;
  if (invuln > 0) {
    invuln -= 1;
  } else {
    const touched = drifts.some((d, i) => touchOf(d, driftsBefore[i], playerBefore, player));
    if (touched) {
      if (carried.length > 0) {
        carried = [];
        invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        lives -= 1;
        events.push('hit');
        if (lives <= 0) {
          lives = 0;
          status = 'lost';
          events.push('lost');
        } else {
          player = { x: level.start.x, y: level.start.y };
          invuln = INVULN_TICKS;
        }
      }
    }
  }

  const done = {
    ...state,
    seed,
    tick: state.tick + 1,
    levelTicks: state.levelTicks + 1,
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

  // 13. Spawns, on levelTicks % spawnEvery === 0 while playing, when more
  // patches can lie on the spawn points: one free point and its colour
  // drawn from the seed, the patch appended.
  if (
    done.status === 'playing'
    && done.levelTicks % level.spawnEvery === 0
    && done.patches.length + done.carried.length < level.spawns.length
  ) {
    const free = level.spawns.filter(
      (sp) => !done.patches.some((p) => p.x === sp.x && p.y === sp.y)
        && !(done.player.x === sp.x && done.player.y === sp.y)
        && !done.drifts.some((d) => d.x === sp.x && d.y === sp.y),
    );
    if (free.length > 0) {
      const spot = rngInt(done.seed, free.length);
      const color = rngInt(spot.seed, COLORS);
      done.patches.push({ x: free[spot.value].x, y: free[spot.value].y, color: color.value });
      done.seed = color.seed;
      done.events.push('spawn');
    }
  }
  return done;
}

// A drift touches the player when it stands on the player's cell, or when
// it swapped cells with the player: the drift is now where the player was
// before step 6, and was where the player is now. `before` is the drift's
// pre-move cell of the same index.
function touchOf(drift, before, playerBefore, playerNow) {
  if (drift.x === playerNow.x && drift.y === playerNow.y) return true;
  return drift.x === playerBefore.x && drift.y === playerBefore.y
    && before.x === playerNow.x && before.y === playerNow.y;
}
