// The level editor (DESIGN.md §20).
//
// Every function works on a level definition and never changes its argument;
// the map is an array of strings over §4's cell table. The border of a map is
// always wall, painted and filled only inside it.

import { validateLevel } from './level.js';

// Every cell character the map may hold (§4).
const CELL_CHARS = '#.@PMXH^>v<';
// The editor's canvas limits (§20: clamped to 5 to 32 wide and 5 to 24 high).
const MIN_W = 5, MAX_W = 32;
const MIN_H = 5, MAX_H = 24;

// Clamp a dimension into the editor's range.
function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// The width of a rectangular editor map.
function mapWidth(map) {
  return map.length > 0 ? map[0].length : 0;
}

// A definition as it was given, with a new map: the map array is fresh.
function withMap(def, map) {
  return { ...def, map };
}

// editorInit(width, height) (§20): a bordered, empty outside of that size.
export function editorInit(width, height) {
  const w = clamp(width, MIN_W, MAX_W);
  const h = clamp(height, MIN_H, MAX_H);
  const map = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      row += y === 0 || y === h - 1 || x === 0 || x === w - 1 ? '#' : '.';
    }
    map.push(row);
  }
  return withMap({ name: 'Untitled', quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 20, map: [] }, map);
}

// Is (x, y) a border cell of a map?
function isBorder(map, x, y) {
  return y < 0 || y >= map.length || x < 0 || x >= mapWidth(map) ||
    y === 0 || y === map.length - 1 || x === 0 || x === mapWidth(map) - 1;
}

// editorPaint(def, x, y, ch) (§20): set one interior cell to a character of
// the table. Painting '@' or 'X' first erases every other cell with the same
// character, so the map keeps at most one of each.
export function editorPaint(def, x, y, ch) {
  const map = def.map.slice();
  if (typeof ch !== 'string' || ch.length !== 1 || !CELL_CHARS.includes(ch)) {
    return withMap(def, def.map.slice());
  }
  if (typeof x !== 'number' || typeof y !== 'number' ||
      y < 0 || y >= map.length || x < 0 || x >= mapWidth(map) ||
      isBorder(map, x, y)) {
    return withMap(def, def.map.slice());
  }
  if (ch === '@' || ch === 'X') {
    for (let row = 0; row < map.length; row++) {
      map[row] = map[row].replaceAll(ch, '.');
    }
  }
  const target = map[y];
  map[y] = target.slice(0, x) + ch + target.slice(x + 1);
  return withMap(def, map);
}

// editorFill(def, x, y, ch) (§20): flood-fill the connected region of cells
// equal to the one at (x, y), through up, down, left, and right, with ch.
// '@' and 'X' cannot be filled; the border neither, as a start or as a cell.
export function editorFill(def, x, y, ch) {
  if (ch === '@' || ch === 'X' || typeof ch !== 'string' || ch.length !== 1 ||
      !CELL_CHARS.includes(ch)) {
    return withMap(def, def.map.slice());
  }
  const map = def.map.slice();
  if (isBorder(map, x, y)) return withMap(def, def.map.slice());
  const w = mapWidth(map);
  const h = map.length;
  const start = map[y][x];
  const seen = new Set([x + ',' + y]);
  const stack = [[x, y]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (isBorder(map, nx, ny)) continue;
      if (map[ny][nx] !== start || seen.has(nx + ',' + ny)) continue;
      seen.add(nx + ',' + ny);
      stack.push([nx, ny]);
    }
  }
  for (const key of seen) {
    const [fx, fy] = key.split(',').map(Number);
    const row = map[fy];
    map[fy] = row.slice(0, fx) + ch + row.slice(fx + 1);
  }
  return withMap(def, map);
}

// editorResize(def, width, height) (§20): the definition at a new size
// (clamped as editorInit). A cell keeps its character where it is inside both
// the new and the old border; it is '.' indoors and '#' on the new border.
export function editorResize(def, width, height) {
  const w = clamp(width, MIN_W, MAX_W);
  const h = clamp(height, MIN_H, MAX_H);
  const old = def.map;
  const oldW = mapWidth(old);
  const oldH = old.length;
  const map = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      if (y === 0 || y === h - 1 || x === 0 || x === w - 1) {
        row += '#';
      } else if (
        y > 0 && y < oldH - 1 && x > 0 && x < oldW - 1 &&
        y < old.length && x < old[y].length
      ) {
        row += old[y][x];
      } else {
        row += '.';
      }
    }
    map.push(row);
  }
  return withMap(def, map);
}

// editorErrors(def) (§20): validateLevel's error codes.
export function editorErrors(def) {
  return validateLevel(def).errors;
}

// editorExport(def) (§20): the definition as JSON.
export function editorExport(def) {
  return JSON.stringify(def);
}

// editorImport(text) (§20): a definition whose validateLevel finds no
// bad_fields; null for text that is not JSON or lacks the fields.
export function editorImport(text) {
  let def;
  try {
    def = JSON.parse(text);
  } catch {
    return null;
  }
  if (validateLevel(def).errors.includes('bad_fields')) return null;
  return def;
}
