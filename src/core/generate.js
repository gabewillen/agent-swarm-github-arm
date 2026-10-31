// Generated levels and the daily run (DESIGN.md §19).
//
// hashSeed is FNV-1a over a string's UTF-16 code units; dailySeed hashes
// 'quorum-run:<date>' for a YYYY-MM-DD string and returns null otherwise.
// generateLevel builds a level definition from the PRNG of §3 alone, so
// the same seed and options always give the same level. The map keeps its
// border of walls and scatters wall blocks that are at least two cells
// apart and never beside the border: with that clearance every wall keeps
// a ring of open floor around it and the interior stays one connected
// region, so no spawn, merge pad, or exit can be unreachable. The start
// goes anywhere free; drifts start at least 3 steps (Manhattan) from it;
// then come patch spawn points, the exit, and at least one merge pad.

import { rngInt } from './rng.js';

const MIN_WIDTH = 7;
const MAX_WIDTH = 32;
const MIN_HEIGHT = 7;
const MAX_HEIGHT = 24;
const DRIFT_CHARS = ['^', '>', 'v', '<'];

export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function dailySeed(date) {
  if (typeof date !== 'string' || !DATE.test(date)) return null;
  return hashSeed('quorum-run:' + date);
}

export function generateLevel(seed, options) {
  const opts = options || {};
  const width = opts.width === undefined ? 15 : opts.width;
  const height = opts.height === undefined ? 11 : opts.height;
  const drifts = opts.drifts === undefined ? 2 : opts.drifts;
  const spawns = opts.spawns === undefined ? 4 : opts.spawns;
  const quorum = opts.quorum === undefined ? 5 : opts.quorum;
  if (!Number.isInteger(width) || width < MIN_WIDTH || width > MAX_WIDTH) {
    throw new RangeError(`width ${width} is not an integer in [${MIN_WIDTH}, ${MAX_WIDTH}]`);
  }
  if (!Number.isInteger(height) || height < MIN_HEIGHT || height > MAX_HEIGHT) {
    throw new RangeError(`height ${height} is not an integer in [${MIN_HEIGHT}, ${MAX_HEIGHT}]`);
  }

  let s = seed >>> 0;
  const take = (n) => {
    if (n <= 0) return 0;
    const r = rngInt(s, n);
    s = r.seed;
    return r.value;
  };
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = take(i + 1);
      const t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
    return list;
  };

  const map = [];
  for (let y = 0; y < height; y++) map.push(new Array(width).fill('.'));
  for (let x = 0; x < width; x++) {
    map[0][x] = '#';
    map[height - 1][x] = '#';
  }
  for (let y = 0; y < height; y++) {
    map[y][0] = '#';
    map[y][width - 1] = '#';
  }

  // Wall blocks: runs of one or two cells, never on the outermost inner
  // row/column and at least one cleared ring from every other wall, so
  // the floor around each wall is open all the way and stays connected.
  const key = (x, y) => x + ',' + y;
  const wall = new Set();
  const ring = new Set();
  const stamp = (x, y) => {
    wall.add(key(x, y));
    map[y][x] = '#';
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) ring.add(key(x + dx, y + dy));
    }
  };
  const interior = [];
  for (let y = 2; y <= height - 3; y++) {
    for (let x = 2; x <= width - 3; x++) interior.push({ x, y });
  }
  const wanted = Math.floor(width * height / 16);
  if (wanted > 0 && interior.length > 0) {
    for (const c of shuffle(interior.slice())) {
      if (wall.size >= wanted) break;
      if (wall.has(key(c.x, c.y)) || ring.has(key(c.x, c.y))) continue;
      const horizontal = take(2) === 0;
      const dx = horizontal ? 1 : 0;
      const dy = horizontal ? 0 : 1;
      const second = { x: c.x + dx, y: c.y + dy };
      const run = take(4) === 0
        ? [c]
        : (second.x <= width - 3 && second.y <= height - 3 &&
           !wall.has(key(second.x, second.y)) && !ring.has(key(second.x, second.y))
          ? [c, second]
          : [c]);
      for (const cell of run) stamp(cell.x, cell.y);
    }
  }

  // Features spread over the remaining floor.
  const free = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (map[y][x] === '.') free.push({ x, y });
    }
  }
  const cells = shuffle(free);
  const used = new Set();
  const pick = (count, also = () => true) => {
    const out = [];
    while (out.length < count && cells.length > 0) {
      const c = cells.pop();
      if (used.has(key(c.x, c.y)) || !also(c)) continue;
      used.add(key(c.x, c.y));
      out.push(c);
    }
    return out;
  };

  const start = pick(1)[0];
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const driftCells = pick(drifts, (c) => dist(c, start) >= 3);
  const spawnCells = pick(spawns);
  const exit = pick(1)[0];
  const pads = pick(2 + take(3));

  map[start.y][start.x] = '@';
  for (const c of driftCells) {
    map[c.y][c.x] = DRIFT_CHARS[take(4)];
  }
  for (const c of spawnCells) map[c.y][c.x] = 'P';
  map[exit.y][exit.x] = 'X';
  for (const c of pads) map[c.y][c.x] = 'M';

  return {
    name: 'Generated ' + (seed >>> 0),
    quorum,
    par: 30 + 4 * quorum + Math.floor(width / 2),
    driftPeriod: 2,
    spawnEvery: 12,
    map: map.map((row) => row.join('')),
  };
}
