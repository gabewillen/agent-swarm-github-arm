// Quorum Run — generated levels and the daily run (DESIGN.md §19).
// Pure and deterministic: the level is built only from the PRNG of §3
// started at `seed >>> 0`, so the same seed and options build the same
// level. Validation comes from core/level.js, so a generated level is a
// valid level by the rules of §4.

import { rngInt } from './rng.js';
import { validateLevel } from './level.js';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// hashSeed(text) is 32-bit FNV-1a over the string's UTF-16 code units.
export function hashSeed(text) {
  let h = FNV_OFFSET;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

// dailySeed(date) hashes 'quorum-run:' + the date, or null when the text
// is not a YYYY-MM-DD string.
export function dailySeed(date) {
  if (typeof date !== 'string' || !DATE_RE.test(date)) return null;
  return hashSeed('quorum-run:' + date);
}

// Interior width or height beyond these bounds is a RangeError.
const MIN_W = 7;
const MAX_W = 32;
const MIN_H = 7;
const MAX_H = 24;

// Wall share of the interior per attempt: a dense try first, then
// thinner ones, and finally none at all, which always builds.
const WALL_FRACTIONS = [0.16, 0.11, 0.07, 0.05, 0.03, 0.015, 0];

// Drifts start facing one of the four directions of §4.
const DIR_CHARS = ['^', '>', 'v', '<'];

function optionInt(value, fallback) {
  return value === undefined ? fallback : value;
}

// generateLevel(seed, options): a level definition built from the PRNG.
// Options and defaults: width 15, height 11, drifts 2, spawns 4,
// quorum 5. Width and height clamp by throwing a RangeError outside
// 7..32 and 7..24.
export function generateLevel(seed, options = {}) {
  const width = optionInt(options.width, 15);
  const height = optionInt(options.height, 11);
  const driftCount = optionInt(options.drifts, 2);
  const spawnCount = optionInt(options.spawns, 4);
  const quorum = optionInt(options.quorum, 5);
  if (!Number.isInteger(width) || width < MIN_W || width > MAX_W) {
    throw new RangeError('width must be between 7 and 32');
  }
  if (!Number.isInteger(height) || height < MIN_H || height > MAX_H) {
    throw new RangeError('height must be between 7 and 24');
  }

  const r0 = seed >>> 0;
  let r = r0;
  const draw = (n) => {
    const d = rngInt(r, n);
    r = d.seed;
    return d.value;
  };

  const iw = width - 2;
  const ih = height - 2;
  const area = iw * ih;
  const mergeCount = area >= 20 ? 2 : 1;

  const pick = (pool, count, taken) => {
    if (pool.length < count) return null;
    const out = [];
    let guard = pool.length * count + pool.length;
    while (out.length < count && guard-- > 0) {
      const id = pool[draw(pool.length)];
      if (taken.has(id) || out.includes(id)) continue;
      taken.add(id);
      out.push(id);
    }
    return out.length === count ? out : null;
  };

  // Components of the interior with 4-connectivity, walls aside.
  const components = (walls) => {
    const cells = [];
    for (let id = 0; id < area; id++) if (!walls.has(id)) cells.push(id);
    const seen = new Set();
    const comps = [];
    for (const id of cells) {
      if (seen.has(id)) continue;
      const comp = [];
      const stack = [id];
      seen.add(id);
      while (stack.length > 0) {
        const c = stack.pop();
        comp.push(c);
        const x = c % iw;
        for (const n of [c - iw, c + iw, x === 0 ? -1 : c - 1, x === iw - 1 ? -1 : c + 1]) {
          if (n < 0 || n >= area || seen.has(n) || walls.has(n)) continue;
          seen.add(n);
          stack.push(n);
        }
      }
      comps.push(comp);
    }
    return comps;
  };

  for (let attempt = 0; attempt < WALL_FRACTIONS.length; attempt++) {
    const walls = new Set();
    const wallTarget = Math.floor(area * WALL_FRACTIONS[attempt]);
    let guard = wallTarget * 32 + area;
    while (walls.size < wallTarget && guard-- > 0) walls.add(draw(area));

    const compCells = components(walls).reduce(
      (big, comp) => (comp.length > big.length ? comp : big),
    ); // the largest component's ids
    if (1 + 1 + mergeCount + spawnCount > compCells.length) continue;

    const taken = new Set(walls);

    // The player's start, anywhere in the big component.
    const at = pick(compCells, 1, taken)[0];
    const ax = at % iw;
    const ay = (at / iw) | 0;

    // Drifts anywhere interior, at least 3 steps from the player.
    const driftPool = [];
    for (let id = 0; id < area; id++) {
      if (taken.has(id)) continue;
      if (Math.abs((id % iw) - ax) + Math.abs(((id / iw) | 0) - ay) < 3) continue;
      driftPool.push(id);
    }
    const driftIds = pick(driftPool, driftCount, taken);
    if (driftIds === null) continue;
    const dirs = driftIds.map(() => DIR_CHARS[draw(4)]);

    // Exit, merge pads, and spawns all inside the player's component, so
    // everything matters and everything is reachable.
    const exitId = pick(compCells, 1, taken)[0];
    const mergeIds = pick(compCells, mergeCount, taken);
    const spawnIds = pick(compCells, spawnCount, taken);
    if (!mergeIds || !spawnIds) continue;

    const grid = [];
    for (let y = 0; y < height; y++) {
      const row = new Array(width).fill('.');
      row[0] = '#';
      row[width - 1] = '#';
      grid.push(row);
      if (y === 0 || y === height - 1) grid[y] = new Array(width).fill('#');
    }
    const put = (id, ch) => {
      grid[((id / iw) | 0) + 1][(id % iw) + 1] = ch;
    };
    for (const id of walls) put(id, '#');
    put(at, '@');
    driftIds.forEach((id, i) => put(id, dirs[i]));
    put(exitId, 'X');
    mergeIds.forEach((id) => put(id, 'M'));
    spawnIds.forEach((id) => put(id, 'P'));

    const def = {
      name: `Generated ${r0}`,
      quorum,
      par: 30 + quorum * 12 + Math.floor((width * height) / 4),
      driftPeriod: 2,
      spawnEvery: 12,
      map: grid.map((row) => row.join('')),
    };
    if (validateLevel(def).ok) return def;
  }

  throw new RangeError('cannot fit the requested drifts and spawns on the map');
}
