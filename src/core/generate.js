// Generated levels and the daily run of Quorum Run (DESIGN.md §19).
// Pure: every draw comes from the PRNG of §3, started at `seed >>> 0`, so
// the same seed and options always build the same level.

import { rngInt } from './rng.js';
import { validateLevel } from './level.js';

const DIR_CHARS = ['^', '>', 'v', '<'];
const DIR_NAMES = ['up', 'right', 'down', 'left'];
const NEIGHBORS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const SHAPES = [[1, 1], [2, 1], [1, 2], [2, 2]];

// 32-bit FNV-1a over the string's UTF-16 code units.
export function hashSeed(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// The seed of a day's run, or null for text that is not YYYY-MM-DD.
export function dailySeed(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return hashSeed('quorum-run:' + date);
}

export function generateLevel(seed, options) {
  const o = options || {};
  const width = o.width === undefined ? 15 : o.width;
  const height = o.height === undefined ? 11 : o.height;
  if (!Number.isInteger(width) || width < 7 || width > 32) {
    throw new RangeError(`generateLevel: width ${width} is not in 7..32`);
  }
  if (!Number.isInteger(height) || height < 7 || height > 24) {
    throw new RangeError(`generateLevel: height ${height} is not in 7..24`);
  }
  const driftCount = o.drifts === undefined ? 2 : o.drifts;
  const spawnCount = o.spawns === undefined ? 4 : o.spawns;
  const quorum = o.quorum === undefined ? 5 : o.quorum;

  let s = seed >>> 0;
  // One draw of an integer in [0, n); every draw advances the same stream.
  const next = (n) => {
    const r = rngInt(s, n);
    s = r.seed;
    return r.value;
  };

  // Retries continue the same stream: still deterministic, always changing.
  for (let attempt = 0; attempt < 200; attempt++) {
    const built = buildLevel(width, height, driftCount, spawnCount, quorum, `Generated ${(seed >>> 0)}`, next);
    if (built) return built;
  }
  throw new Error('generateLevel: could not build a level for these options');
}

function buildLevel(width, height, driftCount, spawnCount, quorum, name, next) {
  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push(x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.');
    }
    grid.push(row);
  }

  // Wall chunks: small rectangles that never touch another wall
  // orthogonally, carved one at a time with a connectivity check so the
  // floor always stays one room. Sparse walls keep corridors wide, which
  // makes the level easy for a bot to dodge drifts in.
  const interior = (width - 2) * (height - 2);
  const wallTarget = Math.max(1, Math.floor(interior * 0.12) + next(6) - 2);
  let placed = 0;
  for (let tries = 0; placed < wallTarget && tries < 500; tries++) {
    const [cw, ch] = SHAPES[next(4)];
    const x = 1 + next(width - 1 - cw);
    const y = 1 + next(height - 1 - ch);
    if (!fits(grid, width, height, x, y, cw, ch)) continue;
    const test = grid.map((row) => row.slice());
    for (let dy = 0; dy < ch; dy++) {
      for (let dx = 0; dx < cw; dx++) test[y + dy][x + dx] = '#';
    }
    if (!connectedFloors(test, width, height)) continue;
    for (let dy = 0; dy < ch; dy++) {
      for (let dx = 0; dx < cw; dx++) grid[y + dy][x + dx] = '#';
    }
    placed++;
  }

  // A floor cell with a single exit is a tip a drift could pin the player
  // against: open one of its walls. Opening floors never disconnects.
  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (grid[y][x] === '#') continue;
        const floors = [], walls = [];
        for (const [dx, dy] of NEIGHBORS) {
          const nx = x + dx, ny = y + dy;
          if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= height - 1) continue;
          (grid[ny][nx] === '#' ? walls : floors).push([nx, ny]);
        }
        if (floors.length === 1 && walls.length > 0) {
          const [wx, wy] = walls[next(walls.length)];
          grid[wy][wx] = '.';
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // Free floor cells, in reading order; features take them from the pool.
  const pool = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (grid[y][x] === '.') pool.push([x, y]);
    }
  }
  const takeWhere = (ok, tries = 40) => {
    if (pool.length === 0) return null;
    for (let t = 0; t < tries; t++) {
      const i = next(pool.length);
      if (ok(pool[i])) return pool.splice(i, 1)[0];
    }
    for (let i = 0; i < pool.length; i++) {
      if (ok(pool[i])) return pool.splice(i, 1)[0];
    }
    return null;
  };

  // The player starts anywhere that is left, and against drifts later.
  const start = takeWhere(() => true);
  if (!start) return null;

  // The exit wants to sit far from the start: best of forty draws, or the
  // furthest drawn.
  let exit = null, bestI = -1, bestD = -1;
  const far = Math.max(4, Math.floor((width + height) / 2));
  for (let t = 0; t < 40 && pool.length > 0; t++) {
    const i = next(pool.length);
    const [x, y] = pool[i];
    const d = Math.abs(x - start[0]) + Math.abs(y - start[1]);
    if (d >= far) {
      exit = pool.splice(i, 1)[0];
      break;
    }
    if (d > bestD) {
      bestD = d;
      bestI = i;
    }
  }
  if (!exit) {
    if (bestI < 0) return null;
    exit = pool.splice(bestI, 1)[0];
  }

  // A handful of merge pads, one or two more on big maps.
  const padCount = Math.max(2, Math.min(5, Math.floor(interior / 100))) + 1 + next(2);
  const pads = [];
  for (let i = 0; i < padCount; i++) {
    const c = takeWhere(() => true);
    if (!c) return null;
    pads.push(c);
  }

  // Patch spawn points.
  const spawnCells = [];
  for (let i = 0; i < spawnCount; i++) {
    const c = takeWhere(() => true);
    if (!c) return null;
    spawnCells.push(c);
  }

  // Drifts start at least 3 steps from the player (§19).
  const driftCells = [];
  for (let i = 0; i < driftCount; i++) {
    const c = takeWhere(([x, y]) => Math.abs(x - start[0]) + Math.abs(y - start[1]) >= 3);
    if (!c) return null;
    driftCells.push(c);
  }

  // Paint the features, drifts last with their facing drawn.
  grid[start[1]][start[0]] = '@';
  grid[exit[1]][exit[0]] = 'X';
  for (const [x, y] of pads) grid[y][x] = 'M';
  for (const [x, y] of spawnCells) grid[y][x] = 'P';
  for (const [x, y] of driftCells) grid[y][x] = DIR_CHARS[next(4)];

  // Par scales a little with the quorum and the map, always at least 30.
  const par = 60 + 3 * Math.max(0, quorum) + next(40);

  const def = {
    name,
    quorum,
    par,
    driftPeriod: 2,
    spawnEvery: 12,
    map: grid.map((row) => row.join('')),
  };
  return validateLevel(def).errors.length === 0 ? def : null;
}

function fits(grid, width, height, x, y, cw, ch) {
  for (let dy = -1; dy <= ch; dy++) {
    for (let dx = -1; dx <= cw; dx++) {
      const nx = x + dx, ny = y + dy;
      const inside = dx >= 0 && dx < cw && dy >= 0 && dy < ch;
      if (ny < 1 || ny >= height - 1 || nx < 1 || nx >= width - 1) {
        if (inside) return false; // the footprint must stay interior
        continue;
      }
      const c = grid[ny][nx];
      if (inside ? c !== '.' : c === '#') return false;
    }
  }
  return true;
}

function connectedFloors(grid, width, height) {
  let total = 0, start = -1;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (grid[y][x] !== '#') {
        total++;
        if (start < 0) start = y * width + x;
      }
    }
  }
  if (start < 0) return false;
  const seen = new Set([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = i % width, y = Math.floor(i / width);
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx, ny = y + dy, j = ny * width + nx;
      if (nx >= 1 && nx < width - 1 && ny >= 1 && ny < height - 1) {
        if (grid[ny][nx] !== '#' && !seen.has(j)) {
          seen.add(j);
          queue.push(j);
        }
      }
    }
  }
  return seen.size === total;
}
