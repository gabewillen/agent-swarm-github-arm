// The level editor (DESIGN.md §20). Every function works on a level
// definition the way a painter works on paper: nothing is changed in place,
// and what comes back is only ever a plain definition of the §4 shape.
import { validateLevel } from './level.js';

// The cell characters of §4's table, the ones a painting hand may set.
const CHARS = '#.@PMXH^>v<';

// Width and height clamp to 5 to 32 wide and 5 to 24 high.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// True when (x, y) is a cell of the outer edge in a row of length `w`
// inside a map of `h` rows.
function onBorder(x, y, w, h) {
  return y <= 0 || y >= h - 1 || x <= 0 || x >= w - 1;
}

// A row of `w` copies of `ch`.
const solidRow = (w, ch) => new Array(w).fill(ch).join('');

// The definition with its map exchanged; every other field stays as it was.
function withMap(def, map) {
  return { ...def, map };
}

const isIndex = (n) => Number.isInteger(n) && n >= 0;

// The cell of `map` at (x, y), or undefined when it is off the map.
function cellAt(map, x, y) {
  if (!isIndex(y) || y >= map.length) return undefined;
  const row = map[y];
  if (typeof row !== 'string' || !isIndex(x) || x >= row.length) return undefined;
  return row[x];
}

// A new, bordered, empty map at the clamped size: `#` on the border, `.` inside.
function blankMap(w, h) {
  const map = [solidRow(w, '#')];
  for (let y = 1; y < h - 1; y++) map.push('#' + solidRow(w - 2, '.') + '#');
  if (h > 1) map.push(solidRow(w, '#'));
  return map;
}

// A fresh definition of that size, named Untitled, ready to paint on.
export function editorInit(width, height) {
  return {
    name: 'Untitled', quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 20,
    map: blankMap(clamp(width, 5, 32), clamp(height, 5, 24)),
  };
}

// One cell, painted. A character not in §4's table, a cell off the map, or
// a cell on the border is ignored. Painting `@` or `X` erases the old one,
// so the map never holds more than one of each.
export function editorPaint(def, x, y, ch) {
  if (typeof ch !== 'string' || ch.length !== 1 || !CHARS.includes(ch)) return def;
  const map = Array.isArray(def.map) ? def.map : [];
  if (cellAt(map, x, y) === undefined) return def;
  if (onBorder(x, y, map[y].length, map.length)) return def;
  const keepOneOf = ch === '@' || ch === 'X' ? ch : null;
  const newMap = map.map((line, ly) => {
    if (typeof line !== 'string') return line;
    if (keepOneOf === null) return ly === y ? line.slice(0, x) + ch + line.slice(x + 1) : line;
    const out = line.split('');
    for (let i = 0; i < out.length; i++) if (out[i] === keepOneOf && !(ly === y && i === x)) out[i] = '.';
    out[x] = ly === y ? ch : out[x];
    return out.join('');
  });
  return withMap(def, newMap);
}

// A flood fill. Through up, down, left, and right steps, the region of
// cells equal to the one at (x, y) takes the character `ch`; the border
// is never touched, and `@`, `X`, and border cells are refused.
export function editorFill(def, x, y, ch) {
  if (typeof ch !== 'string' || ch.length !== 1 || !CHARS.includes(ch)) return def;
  if (ch === '@' || ch === 'X') return def;
  const map = Array.isArray(def.map) ? def.map : [];
  const target = cellAt(map, x, y);
  if (target === undefined) return def;
  if (target === '@' || target === 'X') return def;
  if (onBorder(x, y, map[y].length, map.length)) return def;
  const grid = map.map((line) => (typeof line === 'string' ? line.split('') : null));
  const h = grid.length;
  const seen = new Set();
  const todo = [[x, y]];
  while (todo.length > 0) {
    const [cx, cy] = todo.pop();
    const key = cy + ' ' + cx;
    if (seen.has(key)) continue;
    seen.add(key);
    const line = grid[cy];
    if (line === null) continue;
    if (onBorder(cx, cy, line.length, h)) continue;
    if (line[cx] !== target) continue;
    line[cx] = ch;
    todo.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return withMap(def, grid.map((line, i) => (line === null ? map[i] : line.join(''))));
}

// A resize. The clamped size replaces the old; a cell inside the new border
// keeps its character where the old map had one off its own border, the
// rest are `.`, and the new border is `#`.
export function editorResize(def, width, height) {
  const w = clamp(width, 5, 32);
  const h = clamp(height, 5, 24);
  const old = Array.isArray(def.map) ? def.map : [];
  const kept = (x, y) => {
    const ch = cellAt(old, x, y);
    if (ch === undefined) return '.';
    const line = old[y];
    if (onBorder(x, y, line.length, old.length)) return '.';
    return ch;
  };
  const map = [];
  for (let y = 0; y < h; y++) {
    let row = solidRow(w, '#');
    if (y > 0 && y < h - 1) {
      const cells = row.split('');
      for (let x = 1; x < w - 1; x++) cells[x] = kept(x, y);
      row = cells.join('');
    }
    map.push(row);
  }
  return withMap(def, map);
}

// The validation codes of the definition, ready to show.
export function editorErrors(def) {
  return validateLevel(def).errors;
}

// The definition as JSON text.
export function editorExport(def) {
  return JSON.stringify(def);
}

// A definition back from JSON text, or null for text that does not parse,
// is not an object, or misses the fields a level needs.
export function editorImport(text) {
  if (typeof text !== 'string') return null;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  if (validateLevel(data).errors.includes('bad_fields')) return null;
  return data;
}
