// The level editor (DESIGN.md §20). It works on a level definition and
// never changes its argument: every function returns a new definition,
// sharing untouched strings and keeping the other fields as they are.

import { validateLevel } from './level.js';

// The cell characters of §4, and the editor's size clamps.
const CHARS = ['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<'];
const MIN_W = 5;
const MAX_W = 32;
const MIN_H = 5;
const MAX_H = 24;

function clamp(n, lo, hi) {
  const f = Math.floor(Number(n));
  if (!Number.isFinite(f)) return lo;
  return f < lo ? lo : f > hi ? hi : f;
}

// A fresh map of the given size: `#` on the border, `.` inside.
function borderMap(w, h) {
  const map = [];
  for (let y = 0; y < h; y++) {
    map.push(y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#');
  }
  return map;
}

function rowsOf(def) {
  return (def && Array.isArray(def.map) ? def.map : []).map((row) => String(row));
}

// The map's shape as [width, height], or [0, 0] without rows.
function shapeOf(rows) {
  return [rows.length > 0 ? rows[0].length : 0, rows.length];
}

// True when (x, y) is a cell of the map and not on the border: the only
// cells the editor ever changes.
function inside(w, h, x, y) {
  return x >= 1 && x <= w - 2 && y >= 1 && y <= h - 2;
}

function cloneWith(def, rows) {
  return { ...def, map: rows };
}

export function editorInit(width, height) {
  const w = clamp(width, MIN_W, MAX_W);
  const h = clamp(height, MIN_H, MAX_H);
  return {
    name: 'Untitled',
    quorum: 1,
    par: 100,
    driftPeriod: 2,
    spawnEvery: 20,
    map: borderMap(w, h),
  };
}

export function editorPaint(def, x, y, ch) {
  const rows = rowsOf(def);
  const [w, h] = shapeOf(rows);
  if (CHARS.indexOf(ch) < 0 || !inside(w, h, x, y) || x >= rows[y].length) {
    return cloneWith(def, rows);
  }
  // `@` and `X` are unique: painting one clears the others of the same
  // character first.
  if (ch === '@' || ch === 'X') {
    for (let ry = 0; ry < h; ry++) {
      if (rows[ry].indexOf(ch) >= 0) rows[ry] = rows[ry].split(ch).join('.');
    }
  }
  rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
  return cloneWith(def, rows);
}

export function editorFill(def, x, y, ch) {
  const rows = rowsOf(def);
  const [w, h] = shapeOf(rows);
  if (CHARS.indexOf(ch) < 0 || ch === '@' || ch === 'X') return cloneWith(def, rows);
  if (!inside(w, h, x, y) || x >= rows[y].length) return cloneWith(def, rows);
  const target = rows[y][x];
  // `@` and `X` can't be filled over, and a fill with the cell's own
  // character changes nothing.
  if (target === '@' || target === 'X' || ch === target) return cloneWith(def, rows);
  // Flood fill the connected region of the start cell's character,
  // through up, down, left, and right steps, never touching the border.
  const stack = [[x, y]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    const row = rows[cy];
    if (row[cx] !== target) continue;
    rows[cy] = row.slice(0, cx) + ch + row.slice(cx + 1);
    const near = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (const [dx, dy] of near) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (inside(w, h, nx, ny)) stack.push([nx, ny]);
    }
  }
  return cloneWith(def, rows);
}

export function editorResize(def, width, height) {
  const w = clamp(width, MIN_W, MAX_W);
  const h = clamp(height, MIN_H, MAX_H);
  const old = rowsOf(def);
  const [ow, oh] = shapeOf(old);
  const rows = [];
  for (let y = 0; y < h; y++) {
    if (y === 0 || y === h - 1) {
      rows.push('#'.repeat(w));
      continue;
    }
    let row = '';
    for (let x = 0; x < w; x++) {
      if (x === 0 || x === w - 1) {
        row += '#';
      } else if (x < ow - 1 && y < oh - 1) {
        // Inside the old border where the old map has a cell: keep it.
        row += old[y][x];
      } else {
        row += '.';
      }
    }
    rows.push(row);
  }
  return cloneWith(def, rows);
}

export function editorErrors(def) {
  try {
    return validateLevel(def).errors;
  } catch {
    return ['bad_fields'];
  }
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
  if (editorErrors(def).indexOf('bad_fields') >= 0) return null;
  return def;
}
