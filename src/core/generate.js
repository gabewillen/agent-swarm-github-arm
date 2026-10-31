// Quorum Run — generated levels and the daily run (DESIGN.md §19).
// Pure: every draw comes from the mulberry32 PRNG of §3, started at
// seed >>> 0, and the same seed and options build the same level.

import { rngInt } from './rng.js';

// FNV-1a over the string's UTF-16 code units, keeping the state unsigned.
export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h = h ^ text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// The daily run's seed is a hash of the calendar date string.
export function dailySeed(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return hashSeed('quorum-run:' + date);
}

const MANHATTAN = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function shuffled(s, cells) {
  const out = cells.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const draw = rngInt(s, i + 1);
    s = draw.seed;
    const j = draw.value;
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return { cells: out, seed: s };
}

// Every cell inside the border, an interior of (width-2) by (height-2).
function interiorCells(width, height) {
  const cells = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) cells.push({ x, y });
  }
  return cells;
}

// Can every special cell still be reached from the '@' through cells that
// are not '#'? One flood fill decides whether a wall candidate may stay.
function allReachable(grid, width, height, from, targets) {
  const seen = new Set([from.y + ':' + from.x]);
  const queue = [from];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const key = ny + ':' + nx;
      if (seen.has(key)) continue;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (grid[ny][nx] === '#') continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return targets.every((t) => seen.has(t.y + ':' + t.x));
}

export function generateLevel(seed, options) {
  const o = options === null || options === undefined ? {} : options;
  const width = o.width === undefined ? 15 : o.width;
  const height = o.height === undefined ? 11 : o.height;
  const drifts = o.drifts === undefined ? 2 : o.drifts;
  const spawns = o.spawns === undefined ? 4 : o.spawns;
  const quorum = o.quorum === undefined ? 5 : o.quorum;

  // Sizes are clamped 7..32 by 7..24 and anything else is a RangeError.
  if (!Number.isInteger(width) || width < 7 || width > 32) throw new RangeError('width must be an integer from 7 to 32');
  if (!Number.isInteger(height) || height < 7 || height > 24) throw new RangeError('height must be an integer from 7 to 24');
  if (!Number.isInteger(drifts) || drifts < 0) throw new RangeError('drifts must be a non-negative integer');
  if (!Number.isInteger(spawns) || spawns < 1) throw new RangeError('spawns must be a positive integer');
  if (!Number.isInteger(quorum) || quorum < 1) throw new RangeError('quorum must be a positive integer');

  const cells = interiorCells(width, height);
  if (2 + 1 + spawns + drifts > cells.length) throw new RangeError('not enough room for that many drifts and spawns');

  let s = seed >>> 0;
  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = new Array(width).fill('.');
    for (let x = 0; x < width; x++) {
      if (y === 0 || y === height - 1 || x === 0 || x === width - 1) row[x] = '#';
    }
    grid.push(row);
  }

  // The '@' first, anywhere in the interior.
  let order = shuffled(s, cells);
  s = order.seed;
  const at = order.cells[0];
  grid[at.y][at.x] = '@';

  const placed = [at];
  const taken = new Set([at.y + ':' + at.x]);
  const isFree = (c) => !taken.has(c.y + ':' + c.x);

  // The exit, preferring a cell well away from the start.
  order = shuffled(s, cells);
  s = order.seed;
  let spot = order.cells.find((c) => isFree(c) && MANHATTAN(c, at) >= 5);
  if (!spot) spot = order.cells.find(isFree);
  if (!spot) throw new RangeError('not enough room for the exit');
  const exit = spot;
  grid[exit.y][exit.x] = 'X';
  placed.push(exit);
  taken.add(exit.y + ':' + exit.x);

  // A merge pad a walk away from the start.
  order = shuffled(s, cells);
  s = order.seed;
  spot = order.cells.find((c) => isFree(c) && MANHATTAN(c, at) >= 3);
  if (!spot) spot = order.cells.find(isFree);
  if (!spot) throw new RangeError('not enough room for the merge pad');
  const merge = spot;
  grid[merge.y][merge.x] = 'M';
  placed.push(merge);
  taken.add(merge.y + ':' + merge.x);

  // Patch spawn points, kept a step apart where the map allows.
  const patchSpots = [];
  for (let i = 0; i < spawns; i++) {
    order = shuffled(s, cells);
    s = order.seed;
    let pick = null;
    for (const c of order.cells) {
      if (!isFree(c)) continue;
      if (patchSpots.every((p) => MANHATTAN(p, c) >= 2)) { pick = c; break; }
    }
    if (!pick) pick = order.cells.find(isFree);
    if (!pick) throw new RangeError('not enough room for the spawn points');
    patchSpots.push(pick);
    grid[pick.y][pick.x] = 'P';
    placed.push(pick);
    taken.add(pick.y + ':' + pick.x);
  }

  // Internal walls: sparse pillars, kept only when every special cell
  // stays reachable from the '@'.
  const wallTarget = Math.max(1, Math.floor(cells.length / 12));
  const freeFloor = cells.filter(isFree);
  order = shuffled(s, freeFloor);
  s = order.seed;
  let walls = 0;
  for (const c of order.cells) {
    if (walls >= wallTarget) break;
    const keep = grid[c.y][c.x];
    if (keep !== '.') continue;
    grid[c.y][c.x] = '#';
    if (allReachable(grid, width, height, at, placed)) walls++;
    else grid[c.y][c.x] = keep;
  }

  // Drift starts on floor cells, at least 3 steps (Manhattan) from '@'.
  const driftSpots = [];
  order = shuffled(s, cells);
  s = order.seed;
  for (const c of order.cells) {
    if (driftSpots.length >= drifts) break;
    if (grid[c.y][c.x] !== '.') continue;
    if (MANHATTAN(c, at) < 3) continue;
    driftSpots.push(c);
    grid[c.y][c.x] = 'v';
  }
  if (driftSpots.length < drifts) throw new RangeError('not enough room for the drift starts');

  const map = grid.map((row) => row.join(''));
  return {
    name: 'Generated ' + (seed >>> 0),
    quorum,
    par: 30 + width * 10 + height * 6,
    driftPeriod: 2,
    spawnEvery: 12,
    map,
  };
}
