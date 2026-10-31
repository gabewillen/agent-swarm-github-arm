// The level editor (DESIGN.md §20). Pure functions over level
// definitions: each takes a definition and returns a new one, never
// changing its argument. A definition's `map` is an array of row
// strings, one per row, of §4's characters. The editor keeps the map
// bordered and lets at most one `@` and one `X` onto it.

import { validateLevel } from './level.js';

// §4's map characters.
const CELL_CHARS = '#.@PMXH^>v<';

// editorInit and editorResize clamp each size to these.
const MIN_WIDTH = 5;
const MAX_WIDTH = 32;
const MIN_HEIGHT = 5;
const MAX_HEIGHT = 24;

function clampSize(n, lo, hi) {
  n = Math.floor(Number(n));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

// The row strings of a bordered empty map: `#` on the border, `.` inside.
function borderedMap(width, height) {
  const map = [];
  for (let y = 0; y < height; y++) {
    map.push(y === 0 || y === height - 1 ? '#'.repeat(width) : '#' + '.'.repeat(width - 2) + '#');
  }
  return map;
}

// The character at (x, y), or null when the cell is outside the map.
function cellAt(map, x, y) {
  if (!Array.isArray(map) || y < 0 || y >= map.length) return null;
  const row = map[y];
  if (typeof row !== 'string' || x < 0 || x >= row.length) return null;
  return row[x];
}

// Is the cell on the map's outer edge?
function isBorder(width, height, x, y) {
  return x === 0 || y === 0 || x === width - 1 || y === height - 1;
}

export function editorInit(width, height) {
  const w = clampSize(width, MIN_WIDTH, MAX_WIDTH);
  const h = clampSize(height, MIN_HEIGHT, MAX_HEIGHT);
  return { name: 'Untitled', quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 20, map: borderedMap(w, h) };
}

// editorPaint sets one cell. It ignores a character not in §4's table, a
// cell outside the map, and any cell on the border. Painting @ or X
// turns any other of the same character into `.`, so there is at most
// one of each.
export function editorPaint(def, x, y, ch) {
  if (!def || typeof def !== 'object' || !Array.isArray(def.map)) return def;
  if (typeof ch !== 'string' || ch.length !== 1 || !CELL_CHARS.includes(ch)) return def;
  const map = def.map;
  if (cellAt(map, x, y) === null) return def;
  const width = map[y].length;
  const height = map.length;
  if (isBorder(width, height, x, y)) return def;
  const unique = ch === '@' || ch === 'X';
  const rows = map.map((row, ry) => {
    if (typeof row !== 'string') return row;
    let out = unique ? row.split(ch).join('.') : row; // clear other @/X
    if (ry === y) out = out.slice(0, x) + ch + out.slice(x + 1);
    return out;
  });
  return { ...def, map: rows };
}

// editorFill flood-fills, through up, down, left, and right steps, the
// region of cells equal to the one at (x, y) with ch, never touching the
// border. @ and X can't be filled: the definition comes back unchanged,
// as it does for a border cell and for filling with @ or X.
export function editorFill(def, x, y, ch) {
  if (!def || typeof def !== 'object' || !Array.isArray(def.map)) return def;
  if (ch === '@' || ch === 'X') return def;
  if (typeof ch !== 'string' || ch.length !== 1 || !CELL_CHARS.includes(ch)) return def;
  const map = def.map;
  const start = cellAt(map, x, y);
  if (start === null || start === '@' || start === 'X') return def;
  const height = map.length;
  if (isBorder(map[y].length, height, x, y)) return def;
  // A breadth-first walk of the connected same-character cells, border
  // cells excluded even when they equal the region's character.
  const seen = new Set();
  const queue = [[x, y]];
  seen.add(y + ':' + x);
  while (queue.length > 0) {
    const [cx, cy] = queue.pop();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const key = ny + ':' + nx;
      if (seen.has(key)) continue;
      const c = cellAt(map, nx, ny);
      if (c === null || c !== start || isBorder(map[ny].length, height, nx, ny)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  const rows = map.map((row, ry) => {
    if (typeof row !== 'string') return row;
    let out = row;
    for (let cx = 0; cx < row.length; cx++) {
      if (seen.has(ry + ':' + cx)) out = out.slice(0, cx) + ch + out.slice(cx + 1);
    }
    return out;
  });
  return { ...def, map: rows };
}

// editorResize returns the definition at the new size (clamped as in
// editorInit): cells inside the new border keep their character where
// the old map had one off its border, the rest are `.`, and the border
// is `#`.
export function editorResize(def, width, height) {
  if (!def || typeof def !== 'object') return def;
  const old = Array.isArray(def.map) ? def.map : [];
  const w = clampSize(width, MIN_WIDTH, MAX_WIDTH);
  const h = clampSize(height, MIN_HEIGHT, MAX_HEIGHT);
  const map = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      if (isBorder(w, h, x, y)) {
        row += '#';
        continue;
      }
      const c = cellAt(old, x, y);
      const kept = c !== null && !isBorder(old[y].length, old.length, x, y);
      row += kept ? c : '.';
    }
    map.push(row);
  }
  return { ...def, map };
}

// editorErrors is validateLevel(def).errors (§4).
export function editorErrors(def) {
  return validateLevel(def).errors;
}

// editorExport writes the definition as JSON.
export function editorExport(def) {
  return JSON.stringify(def);
}

// editorImport parses one back from editorExport's text: a definition
// whose validateLevel has no `bad_fields`, else null, also for text
// that isn't JSON.
export function editorImport(text) {
  let def;
  try {
    def = JSON.parse(text);
  } catch {
    return null;
  }
  if (!def || typeof def !== 'object' || Array.isArray(def)) return null;
  const v = validateLevel(def);
  if (!v || !Array.isArray(v.errors) || v.errors.includes('bad_fields')) return null;
  return def;
}
