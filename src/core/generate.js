// Quorum Run's generated levels and the daily run (DESIGN.md §19).
//
// A generated level is drawn only from the seeded PRNG of §3, so the same
// seed with the same options always builds the same place — no stored
// map, and everyone's daily run comes from the date alone.

import { rngNext } from './rng.js';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

// 32-bit FNV-1a over the string's UTF-16 code units: start at the offset
// basis; for each code unit, xor it in, then multiply by the prime with
// Math.imul and keep a 32-bit unsigned state.
export function hashSeed(text) {
  let h = FNV_OFFSET;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

// The daily run's seed: a fixed salt over a YYYY-MM-DD date. Anything
// that isn't of that form is no run at all.
export function dailySeed(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return hashSeed('quorum-run:' + date);
}

// An integer option with a default; anything but a fitting integer (an
// object field of the wrong type, an unknown key, nothing) falls back.
function optionCount(o, key, dflt, min) {
  const v = o[key];
  return Number.isInteger(v) && v >= min ? v : dflt;
}

// A 4-way flood from one cell through cells that are not walls. The
// result comes back in reading order so later draws stay deterministic.
function component(grid, width, height, start) {
  const out = [];
  const seen = new Uint8Array(width * height);
  const stack = [start];
  seen[start.y * width + start.x] = 1;
  while (stack.length > 0) {
    const c = stack.pop();
    out.push(c);
    const steps = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (let i = 0; i < 4; i++) {
      const nx = c.x + steps[i][0];
      const ny = c.y + steps[i][1];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (grid[ny][nx] === '#') continue;
      const k = ny * width + nx;
      if (seen[k]) continue;
      seen[k] = 1;
      stack.push({ x: nx, y: ny });
    }
  }
  const read = (a, b) => a.y - b.y || a.x - b.x;
  return out.sort(read);
}

// The shallowest... deepest band: the far slice of a distance-sorted list.
// A stable sort keeps reading order inside a band, so each draw stays
// deterministic.
const byDistance = (cells, from) =>
  cells
    .map((c) => ({ c, d: Math.abs(c.x - from.x) + Math.abs(c.y - from.y) }))
    .sort((a, b) => b.d - a.d || a.c.y - b.c.y || a.c.x - b.c.x)
    .map((e) => e.c);

export function generateLevel(seed, options) {
  const o = options ?? {};
  const width = o.width ?? 15;
  const height = o.height ?? 11;
  if (!Number.isInteger(width) || width < 7 || width > 32) {
    throw new RangeError('generateLevel: width must be 7 to 32, got ' + width);
  }
  if (!Number.isInteger(height) || height < 7 || height > 24) {
    throw new RangeError('generateLevel: height must be 7 to 24, got ' + height);
  }
  const driftsWanted = optionCount(o, 'drifts', 2, 0);
  const spawnsWanted = optionCount(o, 'spawns', 4, 1);
  const quorum = optionCount(o, 'quorum', 5, 1);
  const s = seed >>> 0;

  // The level's whole random content comes from this stream, in a fixed
  // order: build, try, place. Same seed, same draws, same level.
  let st = s;
  const draw = () => {
    const r = rngNext(st);
    st = r.seed;
    return r.value;
  };
  const drawInt = (n) => Math.floor(draw() * n);

  const iw = width - 2;
  const ih = height - 2;
  const interior = [];
  for (let y = 1; y <= ih; y++) {
    for (let x = 1; x <= iw; x++) interior.push({ x, y });
  }

  // Small wall islands make corridors matter without starving a grid of
  // room to dodge in. Their size and spot are drawn, so each seed
  // breathes differently.
  const clusters = Math.min(24, Math.floor((iw * ih) / 26));
  const DRIFT_CHARS = ['^', '>', 'v', '<'];

  let grid = null;
  let cells = null; // the connected island the features live on
  let at = null; // the player's start

  // A cluttered grid can wall a pocket in; when the flood from a drawn
  // pivot isn't generous, draw another attempt. The last attempt (64) is
  // a plain open room, which always passes: the generator never fails.
  for (let attempt = 0; attempt <= 64; attempt++) {
    const count = attempt === 64 ? 0 : clusters;
    const g = [];
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
        row.push(border ? '#' : '.');
      }
      g.push(row);
    }
    for (let i = 0; i < count; i++) {
      const w = 1 + drawInt(2);
      const h = 1 + drawInt(2);
      const x0 = 1 + drawInt(iw - w + 1);
      const y0 = 1 + drawInt(ih - h + 1);
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) g[y0 + dy][x0 + dx] = '#';
      }
    }
    const open = [];
    for (const c of interior) if (g[c.y][c.x] !== '#') open.push(c);
    if (open.length === 0) continue;
    const flood = component(g, width, height, open[drawInt(open.length)]);
    const roomy = attempt === 64 || flood.length >= Math.ceil(open.length * 0.9);
    if (!roomy) continue;
    grid = g;
    cells = flood;
    at = cells[drawInt(cells.length)];
    break;
  }

  const taken = new Set();
  const keyOf = (c) => c.y * width + c.x;
  const free = () => cells.filter((c) => !taken.has(keyOf(c)));
  const set = (c, ch) => {
    grid[c.y][c.x] = ch;
    taken.add(keyOf(c));
  };

  set(at, '@');

  // The exit is far: among the farthest quarter of the island.
  const farBand = byDistance(free(), at).slice(0, Math.max(1, Math.floor(cells.length / 4)));
  set(farBand[drawInt(farBand.length)], 'X');

  // Merge pads sit mid-way, so a carried run has a short errand back.
  const mPads = interior.length >= 40 ? 2 : 1;
  const nearSorted = byDistance(free(), at).reverse();
  const lo = Math.floor(nearSorted.length * 0.2);
  const hi = Math.max(lo + 1, Math.floor(nearSorted.length * 0.55));
  const midBand = nearSorted.slice(lo, hi);
  for (let i = 0; i < mPads; i++) {
    if (midBand.length === 0) break;
    const pool = midBand.filter((c) => !taken.has(keyOf(c)));
    if (pool.length === 0) break;
    const c = pool[drawInt(pool.length)];
    set(c, 'M');
  }

  // Spawn points spread over the island; every one must be able to hold
  // a patch the player can walk to.
  for (let i = 0; i < spawnsWanted; i++) {
    const pool = free();
    if (pool.length === 0) break;
    const c = pool[drawInt(pool.length)];
    set(c, 'P');
  }

  // Drifts patrol: none starts closer than 3 steps (Manhattan) to the
  // player, preferring 4, wherever the island is small.
  for (let i = 0; i < driftsWanted; i++) {
    const pool = free();
    if (pool.length === 0) break;
    let band = pool.filter((c) => Math.abs(c.x - at.x) + Math.abs(c.y - at.y) >= 4);
    if (band.length === 0) band = pool.filter((c) => Math.abs(c.x - at.x) + Math.abs(c.y - at.y) >= 3);
    const from = band.length > 0 ? band : pool;
    const c = from[drawInt(from.length)];
    set(c, DRIFT_CHARS[drawInt(4)]);
  }

  const map = grid.map((row) => row.join(''));
  return {
    name: 'Generated ' + s,
    quorum,
    par: 30 + width + height,
    driftPeriod: 2,
    spawnEvery: 12,
    map,
  };
}
