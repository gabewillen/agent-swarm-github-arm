// The level editor (DESIGN.md §20). Pure operations on a level definition;
// no editor function ever changes its argument.

import { validateLevel } from './level.js';

// Every map character of §4.
const CHARS = '#.@PMXH^>v<';

const MIN_W = 5, MAX_W = 32;
const MIN_H = 5, MAX_H = 24;

function clampW(w) {
  const n = Math.floor(Number(w));
  return Number.isFinite(n) ? Math.min(MAX_W, Math.max(MIN_W, n)) : MIN_W;
}

function clampH(h) {
  const n = Math.floor(Number(h));
  return Number.isFinite(n) ? Math.min(MAX_H, Math.max(MIN_H, n)) : MIN_H;
}

function isBorder(x, y, w, h) {
  return x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1;
}

function rowAt(map, y) {
  const row = map ? map[y] : undefined;
  return typeof row === 'string' ? row : null;
}

// A map of that size (clamped to 5 to 32 wide and 5 to 24 high) with `#` on
// the border and `.` inside.
export function editorInit(width, height) {
  const w = clampW(width);
  const h = clampH(height);
  const map = [];
  for (let y = 0; y < h; y++) {
    map.push(y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(Math.max(0, w - 2)) + '#');
  }
  return { name: 'Untitled', quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 20, map };
}

// Sets one cell. Ignores a character not in §4's table, a cell outside the
// map, and any cell on the border. Painting `@` or `X` first turns any other
// `@` or `X` (the same character) into `.`, so there is at most one of each.
export function editorPaint(def, x, y, ch) {
  if (typeof ch !== 'string' || ch.length !== 1 || !CHARS.includes(ch)) return def;
  const map = def && def.map;
  const row = rowAt(map, y);
  if (!row || !Number.isInteger(x) || x < 0 || x >= row.length) return def;
  if (isBorder(x, y, row.length, map.length)) return def;

  // A `@` or `X` clears every other cell holding that character first, so
  // there is at most one of each; then the target cell is set.
  const out = (ch === '@' || ch === 'X')
    ? map.map((r) => (r.includes(ch) ? r.split(ch).join('.') : r))
    : map.slice();
  out[y] = out[y].slice(0, x) + ch + out[y].slice(x + 1);
  return { ...def, map: out };
}

// Flood-fills, through up, down, left, and right steps, the region of cells
// equal to the one at (x, y) with ch, never touching the border. `@` and `X`
// can't be filled: the definition comes back unchanged, as for a border cell.
export function editorFill(def, x, y, ch) {
  if (typeof ch !== 'string' || ch.length !== 1 || !CHARS.includes(ch)) return def;
  if (ch === '@' || ch === 'X') return def;
  const map = def && def.map;
  const row = rowAt(map, y);
  if (!row || !Number.isInteger(x) || x < 0 || x >= row.length) return def;
  if (isBorder(x, y, row.length, map.length)) return def;
  const target = row[x];
  if (target === '@' || target === 'X' || target === ch) return def;

  const h = map.length;
  const seen = new Set();
  const stack = [[x, y]];
  seen.add(y * 1024 + x);
  while (stack.length) {
    const [cx, cy] = stack.pop();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx <= 0 || ny <= 0) continue;
      const nrow = rowAt(map, ny);
      if (!nrow || nx >= nrow.length - 1) continue;
      if (ny >= h - 1) continue;
      const key = ny * 1024 + nx;
      if (seen.has(key)) continue;
      if (nrow[nx] !== target) continue;
      seen.add(key);
      stack.push([nx, ny]);
    }
  }
  if (!seen.size) return def;
  const out = map.map((r, yy) => {
    let changed = false;
    let s = '';
    for (let xx = 0; xx < r.length; xx++) {
      if (seen.has(yy * 1024 + xx)) {
        s += ch;
        changed = true;
      } else {
        s += r[xx];
      }
    }
    return changed ? s : r;
  });
  return { ...def, map: out };
}

// Returns the definition at the new size (clamped as in `editorInit`): cells
// inside the new border keep their character where the old map had one off
// its border, the rest are `.`, and the border is `#`.
export function editorResize(def, width, height) {
  const w = clampW(width);
  const h = clampH(height);
  const old = (def && def.map) || [];
  const oldH = old.length;
  const map = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    const oldRow = typeof old[y] === 'string' ? old[y] : null;
    const oldW = oldRow ? oldRow.length : 0;
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        row += '#';
      } else if (oldRow && y > 0 && y < oldH - 1 && x > 0 && x < oldW - 1) {
        row += oldRow[x];
      } else {
        row += '.';
      }
    }
    map.push(row);
  }
  return { ...def, map };
}

// `validateLevel(def).errors`.
export function editorErrors(def) {
  return validateLevel(def).errors;
}

// `JSON.stringify` of the definition.
export function editorExport(def) {
  return JSON.stringify(def);
}

// Parses one back: a definition whose `validateLevel` has no `bad_fields`,
// else `null` (also for text that isn't JSON).
export function editorImport(text) {
  if (typeof text !== 'string') return null;
  let def;
  try {
    def = JSON.parse(text);
  } catch {
    return null;
  }
  if (def === null || typeof def !== 'object' || Array.isArray(def)) return null;
  let result;
  try {
    result = validateLevel(def);
  } catch {
    return null;
  }
  if (!result || !Array.isArray(result.errors) || result.errors.includes('bad_fields')) return null;
  return def;
}
