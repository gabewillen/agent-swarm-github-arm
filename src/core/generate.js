// Generated levels and the daily run (DESIGN.md §19). A generated level
// is built only from the PRNG of §3 started at `seed >>> 0`, so the same
// seed and options build the same level every time.

import { rngInt } from './rng.js';
import { validateLevel } from './level.js';

// 32-bit FNV-1a over the string's UTF-16 code units.
export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// The daily run's seed: the date hashed with the game's tag, `null` when
// the text is not of the form YYYY-MM-DD.
const DATE_FORM = /^\d{4}-\d{2}-\d{2}$/;

export function dailySeed(date) {
  if (typeof date !== 'string' || !DATE_FORM.test(date)) return null;
  return hashSeed('quorum-run:' + date);
}

// One optional size, defaulting when absent, throwing a RangeError when
// it is not an integer inside its range.
function size(value, fallback, lo, hi, name) {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < lo || n > hi) {
    throw new RangeError(name + ' ' + n + ' out of range ' + lo + '..' + hi);
  }
  return n;
}

// One count option, defaulting when absent.
function count(value, fallback, name) {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(name + ' must be a non-negative integer');
  }
  return n;
}

// generateLevel(seed, options) builds a level definition from the PRNG
// alone. Layout: wall border, open floor, and in most levels a lattice of
// single-wall pillars. Pillars all share one row residue and one column
// residue, so whole rows stay wall-free corridors and the floor cannot
// disconnect; every item is placed on connected floor.
export function generateLevel(seed, options = {}) {
  const o = options || {};
  const width = size(o.width, 15, 7, 32, 'width');
  const height = size(o.height, 11, 7, 24, 'height');
  const driftCount = count(o.drifts, 2, 'drifts');
  const spawnCount = count(o.spawns, 4, 'spawns');
  const quorum = count(o.quorum, 5, 'quorum');

  const shown = seed >>> 0;
  let s = shown;
  const draw = (n) => {
    const r = rngInt(s, n);
    s = r.seed;
    return r.value;
  };

  // The map: border walls around open floor.
  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push(x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.');
    }
    grid.push(row);
  }

  // Pillars: style 0-1 none, 2-3 one pillar per 3x3 block, 4 one per 2x2
  // block. Pillar rows and columns each sit on one residue, so at least a
  // third of the inner rows have no pillar at all.
  const axleX = draw(2);
  const axleY = draw(2);
  const style = draw(5);
  if (style >= 2) {
    const step = style === 4 ? 2 : 3;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if ((x - 1) % step === axleX && (y - 1) % step === axleY) grid[y][x] = '#';
      }
    }
  }

  // Floor cells, in reading order; every item takes one from here.
  const cells = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (grid[y][x] === '.') cells.push({ x, y });
    }
  }
  const need = 'not enough room on the map for ';
  const take = (i) => cells.splice(i, 1)[0];
  const pick = () => {
    if (cells.length === 0) throw new RangeError(need + 'floor cells');
    return take(draw(cells.length));
  };
  // Sample a few cells and keep the best by score; bigger samples cost
  // more draws but never run dry.
  const bestPick = (score, maximize) => {
    if (cells.length === 0) throw new RangeError(need + 'floor cells');
    const sampled = cells.map((_, i) => i);
    let best = -1;
    let bestScore = 0;
    for (let k = 0; k < Math.min(6, sampled.length); k++) {
      const j = draw(sampled.length);
      const i = sampled[j];
      const v = score(cells[i]);
      if (best === -1 || (maximize ? v > bestScore : v < bestScore)) {
        best = i;
        bestScore = v;
      }
      sampled.splice(j, 1);
    }
    return take(best);
  };
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  // The player starts anywhere.
  const start = pick();
  grid[start.y][start.x] = '@';

  // Drifts start at least 3 steps from the player.
  const far = cells.filter((c) => manhattan(c, start) >= 3);
  if (far.length < driftCount) throw new RangeError(need + 'far cells');
  const driftChars = ['^', '>', 'v', '<'];
  for (let i = 0; i < driftCount; i++) {
    const j = draw(far.length);
    const cell = far[j];
    far.splice(j, 1);
    cells.splice(cells.indexOf(cell), 1);
    grid[cell.y][cell.x] = driftChars[draw(4)];
  }

  // The exit lands far from the start; merge pads near the map centre.
  const centre = { x: (width - 1) / 2, y: (height - 1) / 2 };
  const exitCell = bestPick((c) => manhattan(c, start), true);
  grid[exitCell.y][exitCell.x] = 'X';
  const mergeCount = 1 + draw(2);
  for (let i = 0; i < mergeCount; i++) {
    const cell = bestPick((c) => manhattan(c, centre), false);
    grid[cell.y][cell.x] = 'M';
  }

  // Spawn points spread out from one another.
  const placed = [start, exitCell];
  for (let i = 0; i < spawnCount; i++) {
    const cell = bestPick((c) => Math.min(...placed.map((p) => manhattan(c, p))), true);
    placed.push(cell);
    grid[cell.y][cell.x] = 'P';
  }

  const def = {
    name: 'Generated ' + shown,
    quorum,
    par: 30 + width + height + 6 * driftCount,
    driftPeriod: 2,
    spawnEvery: 12,
    map: grid.map((row) => row.join('')),
  };
  const checked = validateLevel(def);
  if (!checked || !checked.ok) {
    throw new Error('generated level failed validation: ' +
      (checked && checked.errors ? checked.errors.join(' ') : 'unknown'));
  }
  return def;
}
