// Quorum Run's rules (DESIGN.md §5 to §7): the state shape, init, tileAt,
// and one game step. The core is pure and render-free: it touches no DOM,
// no clock, and no Math.random; every random draw replaces state.seed
// through the PRNG of §3. A step never changes the state it is given.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';

// The shipped levels (§10) are their own module. It is separate work, so
// this read stays soft: until data/levels.js lands, init simply has no
// default levels. A relative dynamic import keeps every import naming .js.
let SHIPPED_LEVELS = [];
try {
  ({ LEVELS: SHIPPED_LEVELS } = await import('../data/levels.js'));
} catch {
  SHIPPED_LEVELS = [];
}

const MOVE_KEYS = ['up', 'right', 'down', 'left'];

const key = (x, y) => x + ',' + y;

function conflictOn(conflicts, x, y) {
  return conflicts.some((c) => c.x === x && c.y === y);
}

// terrain at a cell ('#', '.', 'M', 'X', 'H'), '#' outside the map
function tileCh(tiles, x, y) {
  const row = tiles[y];
  const ch = row === undefined ? undefined : row[x];
  return ch === undefined ? '#' : ch;
}

export function tileAt(state, x, y) {
  return tileCh(state.level.tiles, x, y);
}

// Trim the draw of an init or a level load to the fields that belong to a
// level: returns them plus the seed state after the colour draws.
function levelFields(levels, levelIndex, seed) {
  const level = parseLevel(levels[levelIndex]);
  const player = { x: level.start.x, y: level.start.y };
  const patches = [];
  let s = seed;
  for (const spawn of level.spawns) {
    const r = rngInt(s, COLORS);
    patches.push({ x: spawn.x, y: spawn.y, color: r.value });
    s = r.seed;
  }
  const drifts = level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  return { level, player, patches, drifts, seed: s };
}

export function init(seed, options) {
  const levels = options === undefined || options.levels === undefined
    ? SHIPPED_LEVELS
    : options.levels;
  const levelIndex = options === undefined || options.level === undefined
    ? 0
    : options.level;
  const fields = levelFields(levels, levelIndex, seed >>> 0);
  return {
    seed: fields.seed,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level: fields.level,
    player: fields.player,
    carried: [],
    patches: fields.patches,
    drifts: fields.drifts,
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

// A cell a drift can enter or sit on: no wall, no hold, no exit (open or
// not), and no conflict on it. Merge pads, patches, and the player count
// as open ground (§6).
function driftPassable(tiles, conflicts, x, y) {
  const t = tileCh(tiles, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !conflictOn(conflicts, x, y);
}

export function step(state, input) {
  // §6 steps 1 to 3: a finished game, a pause flip, or a paused game.
  if (state.status !== 'playing') return { ...state, events: [] };
  const pause = !!(input && input.pause);
  if (pause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }
  if (state.paused) return { ...state, events: [] };

  const move = input && MOVE_KEYS.includes(input.move) ? input.move : null;

  // §6 step 4: the clocks.
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;
  const events = [];
  let seed = state.seed;

  // §6 step 5: conflicts age, those at 0 go.
  const conflicts = [];
  for (const c of state.conflicts) {
    if (c.ttl > 1) conflicts.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }

  // §6 step 6: the player moves one cell when the target is passable.
  const before = state.player;
  let player = { x: state.player.x, y: state.player.y };
  if (move !== null) {
    const dx = DIRS[move][0];
    const dy = DIRS[move][1];
    const nx = player.x + dx;
    const ny = player.y + dy;
    const t = tileAt(state, nx, ny);
    const gated = (t === 'H' || t === 'X') && !state.open;
    if (t !== '#' && !gated && !conflictOn(conflicts, nx, ny)) {
      player = { x: nx, y: ny };
    }
  }

  // §6 step 7: pickup.
  let carried = state.carried.slice();
  let patches = state.patches.map((p) => ({ x: p.x, y: p.y, color: p.color }));
  let hitPatch = -1;
  if (carried.length < CARRY_MAX) {
    hitPatch = patches.findIndex((p) => p.x === player.x && p.y === player.y);
  }
  if (hitPatch !== -1) {
    carried = carried.concat(patches[hitPatch].color);
    patches = patches.filter((_, i) => i !== hitPatch);
    events.push('pickup');
  }

  // §6 step 8: merge, and the quorum once.
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  if (tileAt(state, player.x, player.y) === 'M' && carried.length > 0) {
    const n = carried.length;
    score += PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) {
      score += SAME_COLOR_BONUS * n;
    }
    merges += n;
    carried = [];
    events.push('merge');
    if (!open && merges >= state.level.quorum) {
      open = true;
      events.push('quorum');
    }
  }

  // §6 step 9: the exit ends the step, shipping the level or the game.
  if (open && tileAt(state, player.x, player.y) === 'X') {
    score += Math.max(0, state.level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      const next = levelFields(state.levels, state.levelIndex + 1, seed);
      events.push('level');
      return {
        seed: next.seed,
        tick,
        levelTicks: 0,
        levels: state.levels,
        levelIndex: state.levelIndex + 1,
        level: next.level,
        player: next.player,
        carried: [],
        patches: next.patches,
        drifts: next.drifts,
        conflicts: [],
        score,
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
      seed,
      tick,
      levelTicks,
      levels: state.levels,
      levelIndex: state.levelIndex,
      level: state.level,
      player,
      carried,
      patches,
      drifts: state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
      conflicts,
      score,
      lives: state.lives,
      merges,
      open,
      invuln: state.invuln,
      status: 'won',
      paused: false,
      events,
    };
  }

  // §6 step 10: drifts move, when it is their tick.
  const drifts = state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  const was = state.drifts.map((d) => ({ x: d.x, y: d.y }));
  const moved = state.drifts.map(() => false);
  const driftsMoved = tick % state.level.driftPeriod === 0;
  if (driftsMoved) {
    for (let i = 0; i < drifts.length; i++) {
      const d = drifts[i];
      const at = CLOCKWISE.indexOf(d.dir);
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(at + k) % 4];
        const nx = d.x + DIRS[dir][0];
        const ny = d.y + DIRS[dir][1];
        if (driftPassable(state.level.tiles, conflicts, nx, ny)) {
          d.x = nx;
          d.y = ny;
          d.dir = dir;
          moved[i] = true;
          break;
        }
      }
    }
  }

  // §6 step 11: collisions, only on a tick when drifts moved. Cells in
  // reading order; every drift on a shared cell reverses, one conflict per
  // cell that holds none yet, one event per cell.
  if (driftsMoved) {
    const cells = [];
    for (const d of drifts) {
      let cell = cells.find((c) => c.x === d.x && c.y === d.y);
      if (cell === undefined) {
        cell = { x: d.x, y: d.y, members: [] };
        cells.push(cell);
      }
      cell.members.push(d);
    }
    cells
      .filter((c) => c.members.length >= 2)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .forEach((cell) => {
        for (const d of cell.members) {
          d.dir = d.dir === 'up' ? 'down'
            : d.dir === 'down' ? 'up'
            : d.dir === 'left' ? 'right'
            : 'left';
        }
        if (!conflictOn(conflicts, cell.x, cell.y)) {
          conflicts.push({ x: cell.x, y: cell.y, ttl: CONFLICT_TICKS });
        }
        events.push('conflict');
      });
  }

  // §6 step 12: hits, unless immunity is still up.
  let lives = state.lives;
  let invuln = state.invuln;
  let status = state.status;
  if (invuln > 0) {
    invuln -= 1;
  } else {
    let hit = drifts.some((d) => d.x === player.x && d.y === player.y);
    if (!hit && driftsMoved) {
      for (let i = 0; i < drifts.length && !hit; i++) {
        hit = moved[i]
          && drifts[i].x === before.x && drifts[i].y === before.y
          && was[i].x === player.x && was[i].y === player.y;
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
        if (lives === 0) {
          status = 'lost';
          events.push('lost');
        } else {
          player = { x: state.level.start.x, y: state.level.start.y };
          invuln = INVULN_TICKS;
        }
      }
    }
  }

  // §6 step 13: spawns, when status is still playing.
  if (
    status === 'playing'
    && levelTicks % state.level.spawnEvery === 0
    && patches.length + carried.length < state.level.spawns.length
  ) {
    const taken = new Set(patches.map((p) => key(p.x, p.y)));
    const free = state.level.spawns.filter((spawn) => {
      if (taken.has(key(spawn.x, spawn.y))) return false;
      if (player.x === spawn.x && player.y === spawn.y) return false;
      return !drifts.some((d) => d.x === spawn.x && d.y === spawn.y);
    });
    if (free.length > 0) {
      const spot = rngInt(seed, free.length);
      seed = spot.seed;
      const color = rngInt(seed, COLORS);
      seed = color.seed;
      patches = patches.concat([{ x: free[spot.value].x, y: free[spot.value].y, color: color.value }]);
      events.push('spawn');
    }
  }

  return {
    seed,
    tick,
    levelTicks,
    levels: state.levels,
    levelIndex: state.levelIndex,
    level: state.level,
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
