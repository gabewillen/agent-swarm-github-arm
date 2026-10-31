// A hand implementation of DESIGN.md §5-§7 used ONLY to develop
// src/core/bot.js while the real src/core/game.js and src/data/levels.js
// have not landed on main yet. Nothing in src/ or tests/ loads this; it is
// a development harness, best-effort faithful to the contract, and every
// conclusion here is re-checked against the real modules later.
import { parseLevelLite } from './parselevel.mjs';

const CARRY_MAX = 3;
const INVULN_TICKS = 6;
const CONFLICT_TICKS = 10;
const PATCH_BASE = 100;
const SAME_COLOR_BONUS = 50;
const TIME_BONUS_PER_TICK = 10;
const COLORS = 4;
const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const CLOCKWISE = ['up', 'right', 'down', 'left'];
const DRIFT_CHARS = { '^': 'up', '>': 'right', v: 'down', '<': 'left' };

// mulberry32 exactly as §3 (copied; the harness stays dependency-free).
function rngNext(seed) {
  const t = (seed + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}
function rngInt(seed, n) {
  const r = rngNext(seed);
  return { value: Math.floor(r.value * n), seed: r.seed };
}

function tileChar(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined) return '#';
  if (x < 0 || x >= row.length) return '#';
  return row[x];
}

function playerPassable(level, x, y, open, conflicts) {
  const ch = tileChar(level, x, y);
  if (ch === '#') return false;
  if ((ch === 'H' || ch === 'X') && !open) return false;
  for (const c of conflicts) if (c.x === x && c.y === y) return false;
  return true;
}

function driftPassable(level, x, y, conflicts) {
  const ch = tileChar(level, x, y);
  if (ch === '#' || ch === 'H' || ch === 'X') return false;
  for (const c of conflicts) if (c.x === x && c.y === y) return false;
  return true;
}

// Fresh patches: one per spawn point in reading order, each colour drawn
// with the PRNG as it stands.
function freshPatches(level, seed) {
  const patches = [];
  for (const s of level.spawns) {
    const d = rngInt(seed, COLORS);
    patches.push({ x: s.x, y: s.y, color: d.value });
    seed = d.seed;
  }
  return { patches, seed };
}

function loadLevel(levels, index, seed) {
  const level = parseLevelLite(levels[index]);
  const drawn = freshPatches(level, seed);
  return {
    level,
    patches: drawn.patches,
    nextSeed: drawn.seed,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
  };
}

export function init(seed, options = {}) {
  const levels = options.levels;
  if (!Array.isArray(levels) || levels.length === 0) throw new Error('levels required (harness)');
  const levelIndex = options.level | 0;
  seed = seed >>> 0;
  const loaded = loadLevel(levels, levelIndex, seed);
  return {
    seed: loaded.nextSeed,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level: loaded.level,
    player: { x: loaded.level.start.x, y: loaded.level.start.y },
    carried: [],
    patches: loaded.patches,
    drifts: loaded.drifts,
    conflicts: [],
    score: 0,
    lives: 3,
    merges: 0,
    open: false,
    invuln: 0,
    status: 'playing',
    paused: false,
    events: [],
  };
}

export function tileAt(state, x, y) {
  return tileChar(state.level, x, y);
}

export function step(state, input) {
  const inp = input && typeof input === 'object' ? input : {};
  const move = typeof inp.move === 'string' && inp.move in DIRS ? inp.move : null;
  const pause = inp.pause === true;

  if (state.status !== 'playing') return { ...state, events: [] };
  if (pause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }
  if (state.paused) return { ...state, events: [] };

  const s = {
    ...state,
    tick: state.tick + 1,
    levelTicks: state.levelTicks + 1,
    carried: [...state.carried],
    patches: state.patches.map((p) => ({ ...p })),
    drifts: state.drifts.map((d) => ({ ...d })),
    conflicts: state.conflicts.map((c) => ({ ...c })),
    player: { ...state.player },
    events: [],
  };

  // 5. conflicts age
  s.conflicts = s.conflicts.filter((c) => c.ttl > 1).map((c) => ({ ...c, ttl: c.ttl - 1 }));

  // 6. player move
  if (move) {
    const [dx, dy] = DIRS[move];
    const nx = s.player.x + dx;
    const ny = s.player.y + dy;
    if (playerPassable(s.level, nx, ny, s.open, s.conflicts)) {
      s.player = { x: nx, y: ny };
    }
  }
  const preX = state.player.x; // where the player was before step 6
  const preY = state.player.y;

  // 7. pickup
  const idx = s.patches.findIndex((p) => p.x === s.player.x && p.y === s.player.y);
  if (idx >= 0 && s.carried.length < CARRY_MAX) {
    const [taken] = s.patches.splice(idx, 1);
    s.carried.push(taken.color);
    s.events.push('pickup');
  }

  // 8. merge
  if (tileChar(s.level, s.player.x, s.player.y) === 'M' && s.carried.length > 0) {
    const n = s.carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && s.carried.every((c) => c === s.carried[0])) gain += SAME_COLOR_BONUS * n;
    s.score += gain;
    s.merges += n;
    s.carried = [];
    s.events.push('merge');
    if (s.merges >= s.level.quorum && !s.open) {
      s.open = true;
      s.events.push('quorum');
    }
  }

  // 9. exit
  if (s.open && tileChar(s.level, s.player.x, s.player.y) === 'X') {
    if (s.levelTicks < s.level.par) {
      s.score += (s.level.par - s.levelTicks) * TIME_BONUS_PER_TICK;
    }
    if (s.levelIndex + 1 < s.levels.length) {
      const loaded = loadLevel(s.levels, s.levelIndex + 1, s.seed);
      s.levelIndex += 1;
      s.level = loaded.level;
      s.patches = loaded.patches;
      s.drifts = loaded.drifts;
      s.seed = loaded.nextSeed;
      s.player = { x: loaded.level.start.x, y: loaded.level.start.y };
      s.carried = [];
      s.conflicts = [];
      s.merges = 0;
      s.open = false;
      s.invuln = 0;
      s.levelTicks = 0;
      s.events.push('level');
    } else {
      s.status = 'won';
      s.events.push('won');
    }
    return s; // the step ends here
  }

  // 10. drifts move, each in array order, then clockwise for the target
  const moved = s.tick % s.level.driftPeriod === 0;
  const prePos = new Map(); // moved drift -> pre-move cell (fy*1000+fx)
  if (moved) {
    for (const d of s.drifts) {
      const startDir = CLOCKWISE.indexOf(d.dir);
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(startDir + k) % 4];
        const [dx, dy] = DIRS[dir];
        const nx = d.x + dx;
        const ny = d.y + dy;
        if (!driftPassable(s.level, nx, ny, s.conflicts)) continue;
        prePos.set(d, d.y * 1000 + d.x);
        d.x = nx;
        d.y = ny;
        d.dir = dir;
        break;
      }
    }
    // 11. collisions, per cell in reading order
    const byCell = new Map();
    for (const d of s.drifts) {
      const key = d.y * 1000 + d.x;
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key).push(d);
    }
    const keys = [...byCell.keys()].sort((a, b) => {
      const ya = (a / 1000) | 0;
      const yb = (b / 1000) | 0;
      return ya - yb || (a % 1000) - (b % 1000);
    });
    for (const key of keys) {
      const group = byCell.get(key);
      if (group.length < 2) continue;
      const cx = key % 1000;
      const cy = (key / 1000) | 0;
      for (const d of group) {
        d.dir =
          d.dir === 'up' ? 'down'
          : d.dir === 'down' ? 'up'
          : d.dir === 'left' ? 'right'
          : 'left';
      }
      if (!s.conflicts.some((c) => c.x === cx && c.y === cy)) {
        s.conflicts.push({ x: cx, y: cy, ttl: CONFLICT_TICKS });
      }
      s.events.push('conflict'); // once for the cell (this loop visits it once)
    }
  }

  // 12. hits
  let hitNow = false;
  if (s.invuln === 0) {
    for (const d of s.drifts) {
      if (d.x === s.player.x && d.y === s.player.y) {
        hitNow = true;
        break;
      }
    }
    if (!hitNow && moved) {
      for (const d of s.drifts) {
        const from = prePos.get(d);
        if (from === undefined) continue;
        const fx = from % 1000;
        const fy = (from / 1000) | 0;
        // the drift went from where the player is to where the player was
        if (fx === s.player.x && fy === s.player.y && d.x === preX && d.y === preY) {
          hitNow = true;
          break;
        }
      }
    }
  }
  if (hitNow) {
    if (s.carried.length > 0) {
      s.carried = [];
      s.invuln = INVULN_TICKS;
      s.events.push('drop');
    } else {
      s.lives -= 1;
      if (s.lives <= 0) {
        s.lives = 0;
        s.status = 'lost';
        s.events.push('hit');
        s.events.push('lost');
      } else {
        s.player = { x: s.level.start.x, y: s.level.start.y };
        s.invuln = INVULN_TICKS;
        s.events.push('hit');
      }
    }
  } else if (s.invuln > 0) {
    s.invuln -= 1;
  }

  // 13. spawns
  if (
    s.status === 'playing' &&
    s.levelTicks % s.level.spawnEvery === 0 &&
    s.patches.length + s.carried.length < s.level.spawns.length
  ) {
    const occupied = new Set(s.patches.map((p) => p.y * 1000 + p.x));
    const driftCells = new Set(s.drifts.map((d) => d.y * 1000 + d.x));
    const free = s.level.spawns.filter((sp) => {
      const key = sp.y * 1000 + sp.x;
      return !occupied.has(key) && !(sp.x === s.player.x && sp.y === s.player.y) && !driftCells.has(key);
    });
    if (free.length > 0) {
      const pick = rngInt(s.seed, free.length);
      s.seed = pick.seed;
      const spot = free[pick.value];
      const color = rngInt(s.seed, COLORS);
      s.seed = color.seed;
      s.patches.push({ x: spot.x, y: spot.y, color: color.value });
      s.events.push('spawn');
    }
  }
  return s;
}
