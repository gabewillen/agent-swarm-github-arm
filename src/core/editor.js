// The level editor (DESIGN.md §20): pure tools that build and edit a level
// definition. Nothing here mutates its arguments, and nothing touches the
// DOM, the clock, or randomness.
import { validateLevel } from './level.js';

// The map characters of §4, in table order.
const MAP_CHARS = ['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<'];

// The two characters of which at most one may lie on the map.
const UNIQUE_CHARS = ['@', 'X'];

// The border of §4: five wide, 32 at most, and 24 cells tall at most.
const clampSize = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
const clampWidth = (width) => clampSize(width, 5, 32);
const clampHeight = (height) => clampSize(height, 5, 24);

// A row of the border with a width of `width`.
const borderRow = (width) => '#'.repeat(width);
// An interior row: walls at the ends, floor between them.
const emptyRow = (width) => '#' + '.'.repeat(Math.max(0, width - 2)) + '#';

// Is (x, y) a cell of the map, off its border?
function isInterior(map, x, y) {
  if (y <= 0 || y >= map.length - 1) return false;
  const row = map[y];
  return x > 0 && x < row.length - 1;
}

export function editorInit(width, height) {
  const w = clampWidth(width);
  const h = clampHeight(height);
  const map = [];
  for (let y = 0; y < h; y++) map.push(y === 0 || y === h - 1 ? borderRow(w) : emptyRow(w));
  return { name: 'Untitled', quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 20, map };
}

export function editorPaint(def, x, y, ch) {
  const map = def.map;
  if (!MAP_CHARS.includes(ch)) return def;
  if (y < 0 || y >= map.length || x < 0 || x >= map[y].length) return def;
  // Any cell on the border is ignored.
  if (!isInterior(map, x, y)) return def;
  const next = [];
  for (let ry = 0; ry < map.length; ry++) {
    let row = map[ry];
    if (UNIQUE_CHARS.includes(ch) && row.includes(ch)) {
      row = [...row].map((c) => (c === ch ? '.' : c)).join('');
    }
    next.push(ry === y ? [...row].map((c, cxx) => (cxx === x ? ch : c)).join('') : row);
  }
  return { ...def, map: next };
}

export function editorFill(def, x, y, ch) {
  const map = def.map;
  if (!MAP_CHARS.includes(ch) || UNIQUE_CHARS.includes(ch)) return def;
  if (y < 0 || y >= map.length || x < 0 || x >= map[y].length) return def;
  if (!isInterior(map, x, y)) return def;
  const from = map[y][x];
  if (UNIQUE_CHARS.includes(from)) return def;
  const seen = new Set([y * 1000 + x]);
  const stack = [[x, y]];
  const cells = [];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    cells.push([cx, cy]);
    for (const [nx, ny] of [[cx, cy - 1], [cx + 1, cy], [cx, cy + 1], [cx - 1, cy]]) {
      if (!isInterior(map, nx, ny)) continue;
      if (map[ny][nx] !== from) continue;
      const key = ny * 1000 + nx;
      if (seen.has(key)) continue;
      seen.add(key);
      stack.push([nx, ny]);
    }
  }
  const next = map.slice();
  for (const [cx, cy] of cells) {
    const row = [...next[cy]];
    row[cx] = ch;
    next[cy] = row.join('');
  }
  return { ...def, map: next };
}

export function editorResize(def, width, height) {
  const w = clampWidth(width);
  const h = clampHeight(height);
  const old = def.map;
  const map = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || y === h - 1 || x === w - 1) row += '#';
      else if (y > 0 && y < old.length - 1 && x < old[y].length - 1) row += old[y][x];
      else row += '.';
    }
    map.push(row);
  }
  return { ...def, map };
}

export function editorErrors(def) {
  return validateLevel(def).errors;
}

export function editorExport(def) {
  return JSON.stringify(def);
}

export function editorImport(text) {
  let def;
  try {
    def = JSON.parse(text);
  } catch {
    return null;
  }
  if (def === null || typeof def !== 'object' || Array.isArray(def)) return null;
  let errors;
  try {
    errors = validateLevel(def).errors;
  } catch {
    return null;
  }
  if (!Array.isArray(errors) || errors.includes('bad_fields')) return null;
  return def;
}
