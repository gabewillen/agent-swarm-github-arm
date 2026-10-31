// The level editor (DESIGN.md §20). It works on a level definition and
// never changes its argument.

import { validateLevel } from './level.js';

// The editor's map is 5 to 32 cells wide and 5 to 24 high; the border is
// always wall.
const MIN_W = 5;
const MAX_W = 32;
const MIN_H = 5;
const MAX_H = 24;

const EDITABLE = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

const clampWidth = (width) =>
  (typeof width === 'number' && isFinite(width)
    ? Math.min(Math.max(Math.floor(width), MIN_W), MAX_W)
    : MIN_W);

const clampHeight = (height) =>
  (typeof height === 'number' && isFinite(height)
    ? Math.min(Math.max(Math.floor(height), MIN_H), MAX_H)
    : MIN_H);

const rowsOf = (def) => (def && Array.isArray(def.map) ? def.map : []);

const withMap = (def, map) => ({ ...def, map });

function blankRows(w, h) {
  const map = [];
  for (let y = 0; y < h; y++) {
    map.push(y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#');
  }
  return map;
}

// editorInit(width, height) makes a bordered empty level of that size
// (each size clamped to its range).
export function editorInit(width, height) {
  return {
    name: 'Untitled',
    quorum: 1,
    par: 100,
    driftPeriod: 2,
    spawnEvery: 20,
    map: blankRows(clampWidth(width), clampHeight(height)),
  };
}

// editorPaint(def, x, y, ch) sets one interior cell. It ignores a
// character outside the level's alphabet, a cell outside the map, and any
// cell on the border. Painting @ or X first clears every other @ or X, so
// at most one of each survives.
export function editorPaint(def, x, y, ch) {
  const rows = rowsOf(def);
  const skip = !EDITABLE.has(ch) ||
    typeof x !== 'number' || typeof y !== 'number' ||
    !isFinite(x) || !isFinite(y) ||
    y < 0 || y >= rows.length ||
    x < 0 || x >= rows[y].length ||
    y === 0 || y === rows.length - 1 ||
    x === 0 || x === rows[y].length - 1;
  if (skip) return withMap(def, rows.slice());

  let map = rows.slice();
  if (ch === '@' || ch === 'X') {
    // Another @ or X (anywhere) gives way; at most one of each stays.
    map = rows.map((row) => row.split(ch).join('.'));
  }
  map[y] = map[y].slice(0, x) + ch + map[y].slice(x + 1);
  return withMap(def, map);
}

// editorFill(def, x, y, ch) flood-fills the connected region of cells
// equal to the one at (x, y) with ch, through up, down, left, and right,
// never touching the border. It refuses @ and X (as the fill character or
// as the region) and returns the definition unchanged.
export function editorFill(def, x, y, ch) {
  const rows = rowsOf(def);
  const skip = !EDITABLE.has(ch) || ch === '@' || ch === 'X' ||
    typeof x !== 'number' || typeof y !== 'number' ||
    !isFinite(x) || !isFinite(y) ||
    y < 0 || y >= rows.length ||
    x < 0 || x >= rows[y].length ||
    y === 0 || y === rows.length - 1 ||
    x === 0 || x === rows[y].length - 1;
  if (skip) return withMap(def, rows.slice());

  const start = rows[y][x];
  if (start === '@' || start === 'X' || start === ch) return withMap(def, rows.slice());

  const map = rows.slice();
  const stack = [[x, y]];
  const seen = new Set([x + ',' + y]);
  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    map[cy] = map[cy].slice(0, cx) + ch + map[cy].slice(cx + 1);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[ny].length) continue;
      if (ny === 0 || ny === map.length - 1 || nx === 0 || nx === map[ny].length - 1) continue;
      const key = nx + ',' + ny;
      if (seen.has(key) || map[ny][nx] !== start) continue;
      seen.add(key);
      stack.push([nx, ny]);
    }
  }
  return withMap(def, map);
}

// editorResize(def, width, height) returns the definition at the new size
// (clamped as in editorInit). Cells inside the new border keep their
// character where the old map had one off its border, the rest are '.',
// and the border is '#'.
export function editorResize(def, width, height) {
  const rows = rowsOf(def);
  const w = clampWidth(width);
  const h = clampHeight(height);
  const map = blankRows(w, h);
  for (let y = 1; y < h - 1; y++) {
    if (y >= rows.length - 1) break;
    const old = rows[y];
    if (typeof old === 'string' && old.length > 1) {
      let row = map[y];
      for (let x = 1; x < w - 1 && x < old.length - 1; x++) {
        row = row.slice(0, x) + old[x] + row.slice(x + 1);
      }
      map[y] = row;
    }
  }
  return withMap(def, map);
}

export function editorErrors(def) {
  return validateLevel(def).errors;
}

export function editorExport(def) {
  return JSON.stringify(def);
}

// editorImport(text) parses an exported definition back. It returns null
// for text that is not JSON or for a definition whose fields are invalid;
// a syntactically odd map (bad characters, no players, ...) still comes
// through so the editor can show it and its errors.
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
