// Generated levels and the daily run (DESIGN.md §19). Pure: no clock, no
// DOM, and no randomness but the PRNG of §3; every draw replays from
// `seed >>> 0`, so the same seed and options always give the same level.

import { rngInt } from './rng.js';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

// 32-bit FNV-1a over the string's UTF-16 code units.
export function hashSeed(text) {
  let h = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The seed of the daily run for a 'YYYY-MM-DD' date string, or null when
// the text isn't of that form.
export function dailySeed(date) {
  if (typeof date !== 'string' || !DATE_RE.test(date)) return null;
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return hashSeed('quorum-run:' + date);
}

function intIn(name, value, min, max) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`generateLevel: ${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

// An integer in [0, n) from the PRNG state, replacing it.
function makeDraw(seed) {
  let s = seed >>> 0;
  return (n) => {
    const r = rngInt(s, n);
    s = r.seed;
    return r.value;
  };
}

// One pass of Fisher-Yates over a copy of the list, by the PRNG.
function shuffle(list, draw) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = draw(i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

// Scatter a few short wall segments inside the room for texture.
function addWalls(grid, width, height, draw) {
  const room = (width - 2) * (height - 2);
  const segments = Math.min(6, Math.floor(room / 24));
  for (let i = 0; i < segments; i++) {
    if (draw(2) === 0) continue; // some attempts place nothing, for variety
    const horizontal = draw(2) === 0;
    const len = 2 + draw(2);
    const maxX = horizontal ? width - 1 - len : width - 2;
    const maxY = horizontal ? height - 2 : height - 1 - len;
    if (maxX < 1 || maxY < 1) continue;
    const x0 = 1 + draw(maxX);
    const y0 = 1 + draw(maxY);
    let free = true;
    for (let k = 0; k < len && free; k++) {
      const x = horizontal ? x0 + k : x0;
      const y = horizontal ? y0 : y0 + k;
      if (grid[y][x] === '#') free = false;
    }
    if (!free) continue;
    for (let k = 0; k < len; k++) {
      const x = horizontal ? x0 + k : x0;
      const y = horizontal ? y0 : y0 + k;
      grid[y][x] = '#';
    }
  }
}

// The largest 4-connected group of floor cells (walls never join).
function largestRegion(grid, width, height) {
  const seen = grid.map((row) => row.map(() => false));
  let best = null;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (grid[y][x] === '#' || seen[y][x]) continue;
      const region = [];
      const stack = [[x, y]];
      seen[y][x] = true;
      while (stack.length > 0) {
        const [cx, cy] = stack.pop();
        region.push({ x: cx, y: cy });
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 1 || ny < 1 || nx > width - 2 || ny > height - 2) continue;
          if (grid[ny][nx] === '#' || seen[ny][nx]) continue;
          seen[ny][nx] = true;
          stack.push([nx, ny]);
        }
      }
      if (best === null || region.length > best.length) best = region;
    }
  }
  return best;
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// The first free cell that `from` keeps at least `min` steps away (no
// distance rule when `from` is null), walking the shuffled order; null
// when nothing qualifies.
function pickFirst(order, taken, min, from) {
  for (const cell of order) {
    if (taken.has(`${cell.x},${cell.y}`)) continue;
    if (from !== null && manhattan(cell, from) < min) continue;
    return cell;
  }
  return null;
}

const DRIFT_CHARS = ['^', '>', 'v', '<'];

// Choose @, X, the merge pads, the spawn points, and the drifts from one
// region so every feature stays reachable and drifts start 3 steps or
// more from the player. Returns the placements, or null when the region
// is too tight for them.
function layout(region, draw, driftCount, spawnCount, padCount) {
  const need = 2 + padCount + spawnCount + driftCount;
  if (region === null || region.length < Math.max(need, 6)) return null;
  const order = shuffle(region, draw);
  const taken = new Set();
  const take = (cell, ch) => ({ x: cell.x, y: cell.y, ch });

  const start = order[0];
  taken.add(`${start.x},${start.y}`);

  // Drifts first: they need room at 3 steps or more from the player.
  const drifts = [];
  for (const cell of order) {
    if (drifts.length === driftCount) break;
    if (manhattan(cell, start) >= 3 && !taken.has(`${cell.x},${cell.y}`)) {
      taken.add(`${cell.x},${cell.y}`);
      drifts.push(take(cell, DRIFT_CHARS[draw(4)]));
    }
  }
  if (drifts.length < driftCount) return null;

  // The exit, far from the player when the room allows it.
  const exit = (() => {
    for (const min of [4, 3, 2, 1]) {
      const cell = pickFirst(order, taken, min, start);
      if (cell !== null) return cell;
    }
    return null;
  })();
  if (exit === null) return null;
  taken.add(`${exit.x},${exit.y}`);

  // Merge pads, then the spawn points, off the player's start when they
  // can be.
  const pads = [];
  for (let i = 0; i < padCount; i++) {
    let cell = pickFirst(order, taken, 2, start);
    if (cell === null) cell = pickFirst(order, taken, 0, null);
    if (cell === null) return null;
    taken.add(`${cell.x},${cell.y}`);
    pads.push(take(cell, 'M'));
  }
  const spawns = [];
  for (let i = 0; i < spawnCount; i++) {
    let cell = pickFirst(order, taken, 2, start);
    if (cell === null) cell = pickFirst(order, taken, 0, null);
    if (cell === null) return null;
    taken.add(`${cell.x},${cell.y}`);
    spawns.push(take(cell, 'P'));
  }

  return { start: take(start, '@'), exit: take(exit, 'X'), pads, spawns, drifts };
}

// generateLevel(seed, options): a level definition (§4) of exactly the
// given width and height, named 'Generated <seed >>> 0'. Options and
// defaults: width 15, height 11 (7 to 32 and 7 to 24, else a RangeError),
// drifts 2, spawns 4, quorum 5. A few attempts scatter wall texture and
// lay the features out on the largest floor region; the last attempt is
// an open room, which the feasibility checks below always allow.
export function generateLevel(seed, options = {}) {
  const o = options === null || options === undefined ? {} : options;
  const width = intIn('width', o.width === undefined ? 15 : o.width, 7, 32);
  const height = intIn('height', o.height === undefined ? 11 : o.height, 7, 24);
  const room = (width - 2) * (height - 2);
  const padCount = Math.min(3, Math.max(1, Math.floor(room / 50)));
  const driftCount = intIn('drifts', o.drifts === undefined ? 2 : o.drifts, 0, Math.max(0, room));
  const spawnCount = intIn('spawns', o.spawns === undefined ? 4 : o.spawns, 1, Math.max(1, room));
  const quorum = intIn('quorum', o.quorum === undefined ? 5 : o.quorum, 1, Number.MAX_SAFE_INTEGER);
  if (driftCount + spawnCount + 2 + padCount > room) {
    throw new RangeError('generateLevel: drifts and spawns do not fit the map');
  }
  if (driftCount > room - 15) {
    throw new RangeError('generateLevel: too many drifts to start 3 steps from the player');
  }

  const draw = makeDraw(seed >>> 0);

  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) row.push(y === 0 || y === height - 1 || x === 0 || x === width - 1 ? '#' : '.');
    grid.push(row);
  }

  const floor = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) floor.push({ x, y });
  }

  let placed = null;
  for (let attempt = 0; attempt < 5 && placed === null; attempt++) {
    if (attempt > 0) for (const c of floor) grid[c.y][c.x] = '.';
    if (attempt < 4) addWalls(grid, width, height, draw);
    placed = layout(largestRegion(grid, width, height), draw, driftCount, spawnCount, padCount);
  }

  const put = (cell) => { grid[cell.y][cell.x] = cell.ch; };
  put(placed.start);
  put(placed.exit);
  for (const c of placed.pads) put(c);
  for (const c of placed.spawns) put(c);
  for (const c of placed.drifts) put(c);

  return {
    name: `Generated ${seed >>> 0}`,
    quorum,
    par: 30 + room,
    driftPeriod: 2,
    spawnEvery: 12,
    map: grid.map((row) => row.join('')),
  };
}
