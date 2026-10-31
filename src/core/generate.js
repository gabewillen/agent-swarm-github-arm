// Quorum Run — generated levels and the daily run (DESIGN.md §19).
//
// `generateLevel(seed, options)` builds a level definition from nothing but
// the PRNG of §3 started at `seed >>> 0`: every choice (the player start,
// the exit, merge pads, patch spawn points, drift starts and their
// directions, and the wall pillars) is a draw from one shuffled order of
// the interior cells, so the same seed and options always yield the same
// level, and most seeds yield different ones.

import { rngInt } from './rng.js';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

// FNV-1a over the string's UTF-16 code units, 32 bits.
export function hashSeed(text) {
  let h = FNV_OFFSET;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h = h ^ s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

// A date of the exact form YYYY-MM-DD hashed with a fixed prefix; anything
// else is refused.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function dailySeed(date) {
  if (typeof date !== 'string' || !DATE_RE.test(date)) return null;
  return hashSeed('quorum-run:' + date);
}

// Drift start characters, clockwise: up, right, down, left.
const DRIFT_CHARS = ['^', '>', 'v', '<'];
const DIRS4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const MIN_WIDTH = 7, MAX_WIDTH = 32, MIN_HEIGHT = 7, MAX_HEIGHT = 24;

function inRange(value, lo, hi) {
  return Number.isInteger(value) && value >= lo && value <= hi;
}

export function generateLevel(seedValue, optionsArg) {
  const options = optionsArg || {};
  const width = options.width === undefined ? 15 : options.width;
  const height = options.height === undefined ? 11 : options.height;
  if (!inRange(width, MIN_WIDTH, MAX_WIDTH)) {
    throw new RangeError(`generateLevel: width ${width} out of range ${MIN_WIDTH} to ${MAX_WIDTH}`);
  }
  if (!inRange(height, MIN_HEIGHT, MAX_HEIGHT)) {
    throw new RangeError(`generateLevel: height ${height} out of range ${MIN_HEIGHT} to ${MAX_HEIGHT}`);
  }
  const driftCount = options.drifts === undefined ? 2 : options.drifts;
  const spawnCount = options.spawns === undefined ? 4 : options.spawns;
  const quorum = options.quorum === undefined ? 5 : options.quorum;

  const innerW = width - 2;
  const innerH = height - 2;
  const size = innerW * innerH;

  const cellOf = (i) => ({ x: (i % innerW) + 1, y: ((i / innerW) | 0) + 1 });
  const between = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  // The PRNG of §3, started at seed >>> 0. Every choice below draws from it.
  let s = seedValue >>> 0;
  const draw = (n) => {
    const r = rngInt(s, n);
    s = r.seed;
    return r.value;
  };

  // A shuffled order of the interior cells drives every placement.
  const order = [];
  for (let i = 0; i < size; i++) order.push(i);
  for (let i = size - 1; i > 0; i--) {
    const j = draw(i + 1);
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }

  const taken = new Set();
  const take = (i) => {
    taken.add(i);
    return cellOf(i);
  };

  const start = take(order[0]);

  // The exit: another cell a few steps away, when the map is large enough
  // to have one at that distance.
  let exit = null;
  for (const i of order) {
    if (taken.has(i)) continue;
    const c = cellOf(i);
    if (between(c, start) < 3) continue;
    exit = take(i);
    break;
  }
  if (!exit) {
    for (const i of order) {
      if (taken.has(i)) continue;
      exit = take(i);
      break;
    }
  }

  // One merge pad per level, a second one once there is room to matter.
  const padCount = size >= 40 ? 2 : 1;
  const pads = [];
  for (const i of order) {
    if (pads.length >= padCount) break;
    if (taken.has(i)) continue;
    pads.push(take(i));
  }

  // Patch spawn points.
  const spawnsList = [];
  for (const i of order) {
    if (spawnsList.length >= spawnCount) break;
    if (taken.has(i)) continue;
    spawnsList.push(take(i));
  }

  // Drifts never start within 3 steps (Manhattan) of the player.
  const driftList = [];
  for (const i of order) {
    if (driftList.length >= driftCount) break;
    if (taken.has(i)) continue;
    const c = cellOf(i);
    if (between(c, start) < 3) continue;
    driftList.push(take(i));
  }

  // Terrain: walls on the border, floor inside, then the marked cells, then
  // the drifts with a drawn direction each.
  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      row.push(edge ? '#' : '.');
    }
    grid.push(row);
  }
  const stamp = (c, ch) => { grid[c.y][c.x] = ch; };
  stamp(start, '@');
  stamp(exit, 'X');
  for (const p of pads) stamp(p, 'M');
  for (const p of spawnsList) stamp(p, 'P');
  for (const d of driftList) stamp(d, DRIFT_CHARS[draw(4)]);

  // Wall pillars, a few detached obstacles: each placement is kept only if
  // every still-walkable cell (floor, pads, spawns, the exit, the player's
  // and the drifts' cells) stays connected through it.
  const wallTotal = Math.min(50, (size / 20) | 0);
  const walkable = (x, y) => {
    const row = grid[y];
    return y >= 0 && y < height && row !== undefined && x >= 0 && x < width && row[x] !== '#';
  };
  const connects = () => {
    let total = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) if (grid[y][x] !== '#') total++;
    }
    const seen = new Set();
    let counted = 0;
    const stack = [{ x: start.x, y: start.y }];
    while (stack.length) {
      const { x, y } = stack.pop();
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx;
        const ny = y + dy;
        if (!walkable(nx, ny)) continue;
        const key = ny * width + nx;
        if (seen.has(key)) continue;
        seen.add(key);
        counted++;
        stack.push({ x: nx, y: ny });
      }
    }
    return counted === total;
  };
  let placed = 0;
  for (const i of order) {
    if (placed >= wallTotal) break;
    const c = cellOf(i);
    if (grid[c.y][c.x] !== '.') continue; // keep the border and marked cells
    grid[c.y][c.x] = '#';
    if (connects()) placed++;
    else grid[c.y][c.x] = '.';
  }

  const map = grid.map((row) => row.join(''));
  return {
    name: 'Generated ' + (seedValue >>> 0),
    quorum,
    par: 30 + width * height,
    driftPeriod: 2,
    spawnEvery: 12,
    map,
  };
}
