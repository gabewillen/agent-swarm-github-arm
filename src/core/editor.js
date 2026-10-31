// The level editor (DESIGN.md §20). Every function works on a level
// definition, is pure, and never changes its argument.

import { validateLevel } from './level.js';

// Every cell character of §4's table.
const CHARS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

const MIN_W = 5;
const MAX_W = 32;
const MIN_H = 5;
const MAX_H = 24;

// Clamps a size to the editor's bounds (§20: 5 to 32 wide, 5 to 24 high).
function clampSize(v, lo, hi) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function isBorder(x, y, width, height) {
  return x === 0 || y === 0 || x === width - 1 || y === height - 1;
}

// A new map of that size, every cell inside the border '.'.
function emptyMap(width, height) {
  const map = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) row += isBorder(x, y, width, height) ? '#' : '.';
    map.push(row);
  }
  return map;
}

// editorInit(width, height) returns an empty bordered level of that size.
export function editorInit(width, height) {
  const w = clampSize(width, MIN_W, MAX_W);
  const h = clampSize(height, MIN_H, MAX_H);
  return {
    name: 'Untitled', quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 20,
    map: emptyMap(w, h),
  };
}

// Sets one cell of a row string.
function setCell(row, x, ch) {
  return row.slice(0, x) + ch + row.slice(x + 1);
}

// editorPaint(def, x, y, ch) sets one cell. It ignores a character not in
// §4's table, a cell outside the map, and any cell on the border. A '@' or
// an 'X' is kept at most once: painting one turns the others into '.'.
export function editorPaint(def, x, y, ch) {
  if (def === null || typeof def !== 'object' || !Array.isArray(def.map)) return def;
  if (!CHARS.has(ch)) return def;
  const width = def.map.length > 0 ? def.map[0].length : 0;
  const height = def.map.length;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isInteger(x) || !Number.isInteger(y)) return def;
  if (x < 0 || y < 0 || y >= height || x >= (def.map[y] ? def.map[y].length : 0)) return def;
  if (isBorder(x, y, width, height)) return def;
  // Keep at most one of each of the player and the exit.
  const map = (ch === '@' || ch === 'X')
    ? def.map.map((row) => row.split(ch).join('.'))
    : def.map.slice();
  map[y] = setCell(map[y], x, ch);
  return { ...def, map };
}

// editorFill(def, x, y, ch) flood-fills the region of cells equal to the
// one at (x, y) with ch, through up, down, left, and right steps, never
// touching the border. '@' and 'X' can't be filled, nor can a border cell.
export function editorFill(def, x, y, ch) {
  if (def === null || typeof def !== 'object' || !Array.isArray(def.map) || def.map.length === 0) return def;
  if (!CHARS.has(ch) || ch === '@' || ch === 'X') return def;
  const width = def.map[0].length;
  const height = def.map.length;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isInteger(x) || !Number.isInteger(y)) return def;
  if (x < 0 || y < 0 || y >= height || x >= (def.map[y] ? def.map[y].length : 0)) return def;
  if (isBorder(x, y, width, height)) return def;
  const target = def.map[y][x];
  if (target === '@' || target === 'X') return def;
  const rows = def.map.map((row) => row.split(''));
  const stack = [[x, y]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    if (cx < 1 || cy < 1 || cx > width - 2 || cy > height - 2) continue;
    if (rows[cy][cx] !== target) continue;
    rows[cy][cx] = ch;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return { ...def, map: rows.map((row) => row.join('')) };
}

// editorResize(def, width, height) returns the definition at the new size
// (clamped as in editorInit): inside the new border a cell keeps its old
// character where the old map had one off its own border, the rest are '.'.
export function editorResize(def, width, height) {
  const w = clampSize(width, MIN_W, MAX_W);
  const h = clampSize(height, MIN_H, MAX_H);
  const old = def !== null && typeof def === 'object' && Array.isArray(def.map) ? def.map : [];
  const oldHeight = old.length;
  const oldWidth = oldHeight > 0 ? old[0].length : 0;
  const map = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      if (isBorder(x, y, w, h)) { row += '#'; continue; }
      const oldRow = old[y];
      const inOld = oldRow !== undefined && x >= 0 && x < oldWidth && x < oldRow.length
        && x > 0 && y > 0 && x < oldWidth - 1 && y < oldHeight - 1;
      row += inOld ? oldRow[x] : '.';
    }
    map.push(row);
  }
  return { ...def, map };
}

// editorErrors(def) is the definition's validation codes (§4).
export function editorErrors(def) {
  return validateLevel(def).errors;
}

// editorExport(def) is the definition as JSON text.
export function editorExport(def) {
  return JSON.stringify(def);
}

// editorImport(text) parses a definition back: a definition whose
// validateLevel has no bad_fields, else null (also for text that is not JSON).
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
  return errors.includes('bad_fields') ? null : def;
}
