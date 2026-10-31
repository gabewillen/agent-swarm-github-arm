// Quorum Run — the rules (DESIGN.md §5, §6, §7).
// Pure: init and step build new plain-JSON states and never change the
// state or input they are given. Randomness comes only from state.seed
// through the PRNG of §3.

import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';

// The shipped level pack is everyone's default: import it when it
// exists, without breaking this module while it does not.
let SHIPPED_LEVELS = null;
try {
  SHIPPED_LEVELS = (await import('../data/levels.js')).LEVELS;
} catch {
  SHIPPED_LEVELS = null;
}

const MOVE_LIST = ['up', 'right', 'down', 'left'];
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

function defaultLevels() {
  return SHIPPED_LEVELS ?? [];
}

// Load a level definition into the state: parse it, place the player,
// copy the drifts, and draw one fresh patch colour per spawn point in
// reading order, advancing state.seed with every draw. Per-level fields
// reset; score, lives, tick, and the seed chain survive.
function loadLevel(state, def) {
  const parsed = parseLevel(def);
  state.level = parsed;
  state.levelIndex = state.levelIndex ?? 0;
  state.player = { x: parsed.start.x, y: parsed.start.y };
  state.drifts = parsed.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  state.patches = parsed.spawns.map((sp) => {
    const drawn = rngInt(state.seed, COLORS);
    state.seed = drawn.seed;
    return { x: sp.x, y: sp.y, color: drawn.value };
  });
  state.carried = [];
  state.conflicts = [];
  state.merges = 0;
  state.open = false;
  state.invuln = 0;
  state.levelTicks = 0;
}

// init(seed, options) returns the first state. options.levels chooses the
// level definitions (default the shipped LEVELS); options.level the
// starting level index (default 0).
export function init(seed, options) {
  const opts = options ?? {};
  const defs = opts.levels === undefined ? defaultLevels() : opts.levels;
  const state = {
    seed: seed >>> 0,
    tick: 0,
    levelTicks: 0,
    levels: defs,
    levelIndex: opts.level === undefined ? 0 : opts.level,
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
  loadLevel(state, defs[state.levelIndex]);
  return state;
}

// The level's terrain at a cell: '#', '.', 'M', 'X', or 'H'; '#' outside.
export function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined) return '#';
  const ch = row[x];
  return ch === undefined ? '#' : ch;
}

function conflictKeys(state) {
  return new Set(state.conflicts.map((c) => c.x + ',' + c.y));
}

const keyOf = (x, y) => x + ',' + y;

function playerEnterable(ch, open) {
  return ch === '.' || ch === 'M' || (open === true && (ch === 'H' || ch === 'X'));
}

// A cell a drift may enter: floor or merge pad only. Holds and the exit
// block drifts whatever the level's open state is.
function driftEnterable(ch) {
  return ch === '.' || ch === 'M';
}

export function step(state, input) {
  const src = input ?? {};
  const move = MOVE_LIST.includes(src.move) ? src.move : null;
  const pause = src.pause === true;

  // 1. A finished game returns the state, events empty.
  if (state.status !== 'playing') return { ...state, events: [] };

  // 2. A pause request flips paused and ends the step.
  if (pause) {
    const paused = !state.paused;
    return { ...state, paused, events: [paused ? 'pause' : 'resume'] };
  }

  // 3. Paused: nothing moves, no tick passes.
  if (state.paused) return { ...state, events: [] };

  // A working copy of every mutable part; shared read-only parts stay.
  const s = {
    ...state,
    player: { ...state.player },
    carried: [...state.carried],
    patches: state.patches.map((p) => ({ ...p })),
    drifts: state.drifts.map((d) => ({ ...d })),
    conflicts: state.conflicts.map((c) => ({ ...c })),
    events: [],
  };
  s.level = state.level;

  // 4. Time passes only while playing.
  s.tick += 1;
  s.levelTicks += 1;

  // 5. Existing conflicts age by one; those at 0 go.
  const aged = [];
  for (const c of s.conflicts) {
    if (c.ttl > 1) aged.push({ ...c, ttl: c.ttl - 1 });
  }
  s.conflicts = aged;
  const walls = conflictKeys(s);

  // 6. The player moves when the target cell is passable.
  const playerPre = { x: s.player.x, y: s.player.y };
  if (move !== null) {
    const [dx, dy] = DIRS[move];
    const nx = s.player.x + dx;
    const ny = s.player.y + dy;
    if (playerEnterable(tileAt(s, nx, ny), s.open) && !walls.has(keyOf(nx, ny))) {
      s.player.x = nx;
      s.player.y = ny;
    }
  }

  // 7. Pickup: a patch under the player joins the carried, in order.
  if (s.carried.length < CARRY_MAX) {
    const i = s.patches.findIndex((p) => p.x === s.player.x && p.y === s.player.y);
    if (i !== -1) {
      s.carried.push(s.patches[i].color);
      s.patches.splice(i, 1);
      s.events.push('pickup');
    }
  }

  // 8. Merge on a pad: score by squared count, plus the same-colour bonus.
  if (tileAt(s, s.player.x, s.player.y) === 'M' && s.carried.length > 0) {
    const n = s.carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && s.carried.every((c) => c === s.carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    s.score += gain;
    s.merges += n;
    s.carried = [];
    s.events.push('merge');
    if (!s.open && s.merges >= s.level.quorum) {
      s.open = true;
      s.events.push('quorum');
    }
  }

  // 9. Exit: open and reached ships the level, ends the step here.
  if (s.open && tileAt(s, s.player.x, s.player.y) === 'X') {
    s.score += Math.max(0, s.level.par - s.levelTicks) * TIME_BONUS_PER_TICK;
    if (s.levelIndex + 1 < s.levels.length) {
      s.levelIndex += 1;
      loadLevel(s, s.levels[s.levelIndex]);
      s.events.push('level');
    } else {
      s.status = 'won';
      s.events.push('won');
    }
    return s;
  }

  // 10. Drifts move on their period's ticks.
  const driftsMove = s.tick % s.level.driftPeriod === 0;
  const driftsPre = s.drifts.map((d) => ({ x: d.x, y: d.y }));
  const driftMoved = [];
  if (driftsMove) {
    for (const d of s.drifts) {
      const from = CLOCKWISE.indexOf(d.dir);
      let moved = false;
      for (let i = 0; i < 4; i++) {
        const dir = CLOCKWISE[(from + i) % 4];
        const [dx, dy] = DIRS[dir];
        const nx = d.x + dx;
        const ny = d.y + dy;
        if (!driftEnterable(tileAt(s, nx, ny))) continue;
        if (walls.has(keyOf(nx, ny))) continue;
        d.dir = dir;
        d.x = nx;
        d.y = ny;
        moved = true;
        break;
      }
      driftMoved.push(moved);
    }
  }

  // 11. Collisions on moving ticks: every cell holding two or more
  // drifts, in reading order, reverses them and leaves a conflict.
  if (driftsMove && s.drifts.length > 0) {
    const at = new Map();
    for (const d of s.drifts) {
      const k = keyOf(d.x, d.y);
      if (!at.has(k)) at.set(k, []);
      at.get(k).push(d);
    }
    for (let y = 0; y < s.level.height; y++) {
      for (let x = 0; x < s.level.width; x++) {
        const cell = at.get(keyOf(x, y));
        if (cell === undefined || cell.length < 2) continue;
        for (const d of cell) d.dir = REVERSE[d.dir];
        if (!walls.has(keyOf(x, y))) {
          s.conflicts.push({ x, y, ttl: CONFLICT_TICKS });
          walls.add(keyOf(x, y));
        }
        s.events.push('conflict');
      }
    }
  }

  // 12. Hits: a drift under the player, or one that swapped cells with
  // the player this step. Invulnerable, nothing hits.
  let hit = false;
  if (s.invuln > 0) {
    s.invuln -= 1;
  } else {
    for (let i = 0; i < s.drifts.length && !hit; i++) {
      const d = s.drifts[i];
      if (d.x === s.player.x && d.y === s.player.y) {
        hit = true;
        break;
      }
      if (driftsMove && driftMoved[i]
          && d.x === playerPre.x && d.y === playerPre.y
          && driftsPre[i].x === s.player.x && driftsPre[i].y === s.player.y) {
        hit = true;
        break;
      }
    }
    if (hit) {
      if (s.carried.length > 0) {
        s.carried = [];
        s.invuln = INVULN_TICKS;
        s.events.push('drop');
      } else {
        s.lives -= 1;
        s.events.push('hit');
        if (s.lives <= 0) {
          s.status = 'lost';
          s.events.push('lost');
        } else {
          s.player.x = s.level.start.x;
          s.player.y = s.level.start.y;
          s.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. Spawn: one patch per spawn-when tick, below the point count.
  if (s.status === 'playing'
      && s.levelTicks % s.level.spawnEvery === 0
      && s.patches.length + s.carried.length < s.level.spawns.length) {
    const patchAt = new Set(s.patches.map((p) => keyOf(p.x, p.y)));
    const driftAt = new Set(s.drifts.map((d) => keyOf(d.x, d.y)));
    const free = [];
    for (const sp of s.level.spawns) {
      const k = keyOf(sp.x, sp.y);
      if (patchAt.has(k) || driftAt.has(k)) continue;
      if (sp.x === s.player.x && sp.y === s.player.y) continue;
      free.push(sp);
    }
    if (free.length > 0) {
      const spot = rngInt(s.seed, free.length);
      s.seed = spot.seed;
      const color = rngInt(s.seed, COLORS);
      s.seed = color.seed;
      const at = free[spot.value];
      s.patches.push({ x: at.x, y: at.y, color: color.value });
      s.events.push('spawn');
    }
  }

  return s;
}
