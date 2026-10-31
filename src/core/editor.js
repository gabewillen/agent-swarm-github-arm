// Quorum Run — the level editor (DESIGN.md §20).
// Pure helpers over a level definition: every function returns a new
// definition and never changes its argument.

import { validateLevel } from './level.js';

const MIN_W = 5, MAX_W = 32;
const MIN_H = 5, MAX_H = 24;
const ALLOWED = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const key = (x, y) => x + ',' + y;

// A cell interior to the map: `false` on the outer edge.
function inside(w, h, x, y) {
  return x > 0 && y > 0 && x < w - 1 && y < h - 1;
}

export function editorInit(width, height) {
  const w = clamp(width, MIN_W, MAX_W);
  const h = clamp(height, MIN_H, MAX_H);
  const map = [];
  for (let y = 0; y < h; y++) {
    map.push(y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#');
  }
  return { name: 'Untitled', quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 20, map };
}

export function editorPaint(def, x, y, ch) {
  const map = def && def.map ? def.map : [];
  const keep = { ...def, map: map.slice() };
  if (!ALLOWED.has(ch)) return keep;
  if (y < 0 || y >= map.length || x < 0 || x >= (map[y] ? map[y].length : 0)) return keep;
  if (!inside(map[y].length, map.length, x, y)) return keep;

  if (ch === '@' || ch === 'X') {
    const rows = map.map((row, ry) => {
      let out = '';
      for (let cx = 0; cx < row.length; cx++) out += cx === x && ry === y ? ch : row[cx] === ch ? '.' : row[cx];
      return out;
    });
    return { ...def, map: rows };
  }

  const rows = map.map((row, ry) => (ry === y ? row.slice(0, x) + ch + row.slice(x + 1) : row));
  return { ...def, map: rows };
}

export function editorFill(def, x, y, ch) {
  const map = def && def.map ? def.map : [];
  const keep = { ...def, map: map.slice() };
  if (!ALLOWED.has(ch)) return keep;
  if (y < 0 || y >= map.length || x < 0 || x >= (map[y] ? map[y].length : 0)) return keep;
  if (!inside(map[y].length, map.length, x, y)) return keep;
  const target = map[y][x];
  if (ch === '@' || ch === 'X' || target === '@' || target === 'X') return keep;

  const h = map.length;
  const seen = new Set([key(x, y)]);
  const stack = [[x, y]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = cx + dx, ny = cy + dy;
      if (ny < 0 || ny >= h || nx < 0 || nx >= (map[ny] ? map[ny].length : 0)) continue;
      if (!inside(map[ny].length, h, nx, ny) || seen.has(key(nx, ny))) continue;
      if (map[ny][nx] !== target) continue;
      seen.add(key(nx, ny));
      stack.push([nx, ny]);
    }
  }

  const rows = [];
  for (let yy = 0; yy < h; yy++) {
    let row = '';
    for (let xx = 0; xx < (map[yy] ? map[yy].length : 0); xx++) {
      row += seen.has(key(xx, yy)) ? ch : map[yy][xx];
    }
    rows.push(row);
  }
  return { ...def, map: rows };
}

export function editorResize(def, width, height) {
  const w = clamp(width, MIN_W, MAX_W);
  const h = clamp(height, MIN_H, MAX_H);
  const old = def && def.map ? def.map : [];
  const map = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const oldRow = y < old.length ? old[y] : null;
      const inOld = oldRow !== null && x < oldRow.length && inside(oldRow.length, old.length, x, y);
      row += inside(w, h, x, y) ? (inOld ? oldRow[x] : '.') : '#';
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
  if (validateLevel(def).errors.includes('bad_fields')) return null;
  return def;
}
