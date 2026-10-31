// Quorum Run — the level editor (DESIGN.md §20).
// Pure: every function returns a new definition (or the one it was given,
// unchanged) and never changes its argument. Validation comes from
// core/level.js so the editor and the loader always agree.

import { validateLevel } from './level.js';

// The map characters of §4, minus nothing: painting and filling only
// ever write these.
const TABLE = '#.@PMXH^v><';

const MIN_W = 5;
const MAX_W = 32;
const MIN_H = 5;
const MAX_H = 24;

// Sizes clamp into the editor's range, and the same clamp governs
// editorInit and editorResize.
function clampWidth(width) {
  return Math.max(MIN_W, Math.min(MAX_W, width));
}

function clampHeight(height) {
  return Math.max(MIN_H, Math.min(MAX_H, height));
}

function isBorder(x, y, width, height) {
  return x === 0 || y === 0 || x === width - 1 || y === height - 1;
}

// editorInit(width, height): a bordered empty level of the clamped size.
export function editorInit(width, height) {
  const w = clampWidth(width);
  const h = clampHeight(height);
  const map = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) row += isBorder(x, y, w, h) ? '#' : '.';
    map.push(row);
  }
  return { name: 'Untitled', quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 20, map };
}

// Copy the definition with a new map, leaving the argument untouched.
function withMap(def, rows) {
  return { ...def, map: rows };
}

// editorPaint(def, x, y, ch): set one cell, ignoring unknown characters,
// cells outside the map, and every border cell. Painting '@' or 'X'
// clears any other cell holding the same character first, so the map
// never holds two starts or two exits.
export function editorPaint(def, x, y, ch) {
  const w = def.map[0].length;
  const h = def.map.length;
  if (typeof ch !== 'string' || ch.length !== 1 || !TABLE.includes(ch)) return def;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return def;
  if (x < 0 || y < 0 || x >= w || y >= h) return def;
  if (isBorder(x, y, w, h)) return def;

  const rows = def.map.map((row) => row.split(''));
  if (ch === '@' || ch === 'X') {
    for (let cy = 1; cy < h - 1; cy++) {
      for (let cx = 1; cx < w - 1; cx++) {
        if (rows[cy][cx] === ch && !(cx === x && cy === y)) rows[cy][cx] = '.';
      }
    }
  }
  rows[y][x] = ch;
  return withMap(def, rows.map((row) => row.join('')));
}

// editorFill(def, x, y, ch): flood-fill the region of cells equal to the
// one at (x, y) with ch, up, down, left, and right, never touching the
// border. Filling with '@' or 'X' is refused, and so is starting on a
// border cell.
export function editorFill(def, x, y, ch) {
  const w = def.map[0].length;
  const h = def.map.length;
  if (ch === '@' || ch === 'X') return def;
  if (typeof ch !== 'string' || ch.length !== 1 || !TABLE.includes(ch)) return def;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return def;
  if (x < 0 || y < 0 || x >= w || y >= h) return def;
  if (isBorder(x, y, w, h)) return def;

  const target = def.map[y][x];
  const rows = def.map.map((row) => row.split(''));
  const seen = new Set();
  const queue = [[x, y]];
  while (queue.length > 0) {
    const [cx, cy] = queue.pop();
    const key = cy * w + cx;
    if (seen.has(key)) continue;
    seen.add(key);
    if (cx === 0 || cy === 0 || cx === w - 1 || cy === h - 1) continue;
    if (rows[cy][cx] !== target) continue;
    rows[cy][cx] = ch;
    queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return withMap(def, rows.map((row) => row.join('')));
}

// editorResize(def, width, height): a map of the clamped new size whose
// border is '#', where an old interior cell keeps its character and
// everything else is '.'.
export function editorResize(def, width, height) {
  const w = clampWidth(width);
  const h = clampHeight(height);
  const old = def.map;
  const oh = old.length;
  const ow = old.length > 0 ? old[0].length : 0;
  const map = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      if (isBorder(x, y, w, h)) row += '#';
      else if (y < oh && x < ow && !isBorder(x, y, ow, oh)) row += old[y][x];
      else row += '.';
    }
    map.push(row);
  }
  return withMap(def, map);
}

// editorErrors(def) is validateLevel(def).errors.
export function editorErrors(def) {
  return validateLevel(def).errors;
}

// editorExport(def) is the definition as JSON text.
export function editorExport(def) {
  return JSON.stringify(def);
}

// editorImport(text) parses a definition back: null for text that is not
// JSON, and for a definition whose validation reports bad_fields.
export function editorImport(text) {
  let def;
  try {
    def = JSON.parse(text);
  } catch {
    return null;
  }
  const { errors } = validateLevel(def);
  if (errors.includes('bad_fields')) return null;
  return def;
}
