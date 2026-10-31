// Generated levels and the daily run (DESIGN.md §19).
//
// A generated level is built only from the PRNG of §3 started at
// `seed >>> 0`: the same seed and options always give the same level.
// Placement retries just draw further along the same stream, so they keep
// every result deterministic. `dailySeed` names a day's seed; `main` uses
// it for the daily run.

import { rngInt } from './rng.js';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const DRIFT_CHARS = ['^', '>', 'v', '<'];
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// FNV-1a over the text's UTF-16 code units.
export function hashSeed(text) {
  let h = FNV_OFFSET;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

// hashSeed('quorum-run:' + date) for a YYYY-MM-DD string, else null.
export function dailySeed(date) {
  return typeof date === 'string' && DATE_PATTERN.test(date)
    ? hashSeed('quorum-run:' + date)
    : null;
}

// width and height throw a RangeError when they are out of range.
function sizeOption(value, fallback, low, high, name) {
  const v = value === undefined || value === null ? fallback : value;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < low || v > high) {
    throw new RangeError(
      `generateLevel: ${name} must be an integer from ${low} to ${high}, got ${v}`,
    );
  }
  return v;
}

// The other options fall back to their defaults when they are not sane.
function countOption(value, fallback, low) {
  const v = value === undefined || value === null ? fallback : value;
  return typeof v === 'number' && Number.isInteger(v) && v >= low ? v : fallback;
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// true when every special cell is reachable from the start through the
// interior cells that are not walls (the §4 unreachable check).
function allSpotsReachable(marked, start, spots, iw, ih) {
  const seen = new Array(marked.length).fill(false);
  seen[start.i] = true;
  const queue = [start.i];
  while (queue.length > 0) {
    const i = queue.pop();
    const x = (i % iw) + 1;
    const y = Math.floor(i / iw) + 1;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 1 || nx > iw || ny < 1 || ny > ih) continue;
      const j = (nx - 1) + (ny - 1) * iw;
      if (marked[j] || seen[j]) continue;
      seen[j] = true;
      queue.push(j);
    }
  }
  return spots.every((c) => seen[c.i]);
}

// Marks wall cells on the interior. The styles vary with a draw:
// 0 scattered single walls, 1 one or two wall lines with gaps so routes
// matter, 2 scattered dominoes. No more than `budget` cells are marked,
// leaving room for the specials.
function drawWalls(marked, draw, iw, ih, density, budget) {
  const interior = iw * ih;
  if (budget <= 0) return;
  const style = draw(3);
  const scatter = (count) => {
    for (let k = 0; k < count; k++) marked[draw(interior)] = true;
  };
  if (style === 1) {
    let scattered = false;
    for (let line = 0, lines = 1 + draw(2); line < lines; line++) {
      const vertical = draw(2) === 0;
      const span = vertical ? ih : iw;
      if (span > budget + 2) {
        scatter(Math.min(Math.round(interior * density), budget));
        scattered = true;
        break;
      }
      const pos = 1 + draw(vertical ? iw : ih);
      const g1 = draw(span);
      let g2 = -1;
      if (span >= 5 && draw(2) === 0) {
        g2 = draw(span - 1);
        if (g2 >= g1) g2 += 1; // a second gap, distinct from the first
      }
      for (let t = 0; t < span; t++) {
        if (t === g1 || t === g2) continue;
        marked[vertical ? (pos - 1) + t * iw : t + (pos - 1) * iw] = true;
      }
    }
    if (!scattered && draw(2) === 0) {
      // a sprinkle of single walls alongside the lines
      scatter(Math.min(Math.round(interior * density * 0.3), budget));
    }
  } else if (style === 2) {
    const pairs = Math.min(
      Math.max(1, Math.round((interior * density) / 2)),
      Math.floor(budget / 2),
    );
    for (let k = 0; k < pairs; k++) {
      const i = draw(interior);
      if (marked[i]) continue;
      const [dx, dy] = NEIGHBOURS[draw(4)];
      const nx = (i % iw) + 1 + dx;
      const ny = Math.floor(i / iw) + 1 + dy;
      if (nx < 1 || nx > iw || ny < 1 || ny > ih) continue;
      marked[i] = true;
      marked[(nx - 1) + (ny - 1) * iw] = true;
    }
  } else {
    scatter(Math.min(Math.round(interior * density) + draw(3), budget));
  }
}

export function generateLevel(seed, options) {
  const opts = options ?? {};
  const width = sizeOption(opts.width, 15, 7, 32, 'width');
  const height = sizeOption(opts.height, 11, 7, 24, 'height');
  let driftCount = countOption(opts.drifts, 2, 0);
  let spawnCount = countOption(opts.spawns, 4, 1);
  const quorum = countOption(opts.quorum, 5, 1);

  const iw = width - 2; // interior width
  const ih = height - 2; // interior height
  const interior = iw * ih;
  let padCount = interior >= 99 ? 2 : 1;
  // Fit the specials into the interior: trim drifts first, then spawns.
  while (1 + 1 + padCount + spawnCount + driftCount > interior) {
    if (driftCount > 0) driftCount -= 1;
    else if (spawnCount > 1) spawnCount -= 1;
    else if (padCount > 1) padCount -= 1;
    else break;
  }
  const needed = 1 + 1 + padCount + spawnCount + driftCount;
  const wallBudget = Math.max(0, interior - needed - 2);

  let prng = seed >>> 0;
  const draw = (n) => {
    const r = rngInt(prng, n);
    prng = r.seed;
    return r.value;
  };

  const cells = [];
  for (let y = 1; y <= ih; y++) {
    for (let x = 1; x <= iw; x++) cells.push({ x, y, i: (x - 1) + (y - 1) * iw });
  }

  // Placement tiers: the first asks for the most interesting maps, the
  // later tiers relax the room required so a level always comes out. The
  // drifts' 3 steps from the start are never relaxed on any tier.
  const tiers = [
    { walls: 0.12, exitSteps: Math.max(3, Math.round((width + height) / 4)), padSteps: 2, attempts: 40 },
    { walls: 0.08, exitSteps: 2, padSteps: 1, attempts: 40 },
    { walls: 0, exitSteps: 2, padSteps: 1, attempts: 20 },
  ];

  function attemptLevel(tier) {
    const marked = new Array(interior).fill(false);
    if (tier.walls > 0) drawWalls(marked, draw, iw, ih, tier.walls, wallBudget);
    const free = [];
    for (const c of cells) if (!marked[c.i]) free.push(c);
    if (free.length < needed) return null;
    const take = (filter) => {
      const spots = [];
      for (let i = 0; i < free.length; i++) if (filter(free[i])) spots.push(i);
      if (spots.length === 0) return null;
      const at = spots[draw(spots.length)];
      return free.splice(at, 1)[0];
    };
    const start = take(() => true);
    if (!start) return null;
    const exit = take((c) => manhattan(c, start) >= tier.exitSteps);
    if (!exit) return null;
    const pads = [];
    for (let k = 0; k < padCount; k++) {
      const pad = take((c) => manhattan(c, start) >= tier.padSteps);
      if (!pad) return null;
      pads.push(pad);
    }
    const patchCells = [];
    for (let k = 0; k < spawnCount; k++) {
      const c = take(() => true);
      if (!c) return null;
      patchCells.push(c);
    }
    const driftCells = [];
    for (let k = 0; k < driftCount; k++) {
      const c = take((c) => manhattan(c, start) >= 3);
      if (!c) return null;
      driftCells.push(c);
    }
    if (tier.walls > 0 && !allSpotsReachable(marked, start, [...pads, exit, ...patchCells], iw, ih)) {
      return null;
    }
    const grid = [];
    for (let y = 0; y < height; y++) grid.push(new Array(width).fill('#'));
    for (const c of cells) grid[c.y][c.x] = marked[c.i] ? '#' : '.';
    grid[start.y][start.x] = '@';
    grid[exit.y][exit.x] = 'X';
    for (const p of pads) grid[p.y][p.x] = 'M';
    for (const p of patchCells) grid[p.y][p.x] = 'P';
    for (const d of driftCells) grid[d.y][d.x] = DRIFT_CHARS[draw(4)];
    return {
      name: 'Generated ' + (seed >>> 0),
      quorum,
      par: Math.max(30, (width + height) * 8),
      driftPeriod: 2,
      spawnEvery: 12,
      map: grid.map((row) => row.join('')),
    };
  }

  for (const tier of tiers) {
    for (let attempt = 0; attempt < tier.attempts; attempt++) {
      const level = attemptLevel(tier);
      if (level) return level;
    }
  }
  throw new Error('generateLevel: could not place a level for these options');
}
