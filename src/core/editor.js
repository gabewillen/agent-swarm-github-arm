// The level editor (DESIGN.md §20): pure transforms on level definitions.
// Every function returns a new definition and never changes its argument.

import { validateLevel } from './level.js';

// §4's map characters.
const TILES = ['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<'];

const MIN_W = 5;
const MAX_W = 32;
const MIN_H = 5;
const MAX_H = 24;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function blankRow(width, edge) {
  return edge ? '#'.repeat(width) : '#' + '.'.repeat(width - 2) + '#';
}

// A new bordered map of the given size.
function blankMap(width, height) {
  const map = [];
  for (let y = 0; y < height; y++) map.push(blankRow(width, y === 0 || y === height - 1));
  return map;
}

// A shallow copy of the definition with a copy of its map.
function withMap(def, map) {
  return { ...def, map };
}

// Whether (x, y) sits on the border of a map of these row lengths.
function isBorder(rows, x, y) {
  return y === 0 || y === rows.length - 1 || x === 0 || x === rows[y].length - 1;
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
    map: blankMap(w, h),
  };
}

export function editorPaint(def, x, y, ch) {
  const map = Array.isArray(def.map) ? def.map.slice() : [];
  const out = withMap(def, map);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return out;
  if (TILES.indexOf(ch) === -1) return out;
  if (y < 0 || y >= map.length) return out;
  const row = map[y];
  if (typeof row !== 'string' || x < 0 || x >= row.length) return out;
  if (isBorder(map, x, y)) return out;
  // At most one @ and one X: clear the others of the same character first.
  if (ch === '@' || ch === 'X') {
    for (let cy = 0; cy < map.length; cy++) {
      let r = map[cy];
      let i = r.indexOf(ch);
      while (i !== -1) {
        r = r.slice(0, i) + '.' + r.slice(i + 1);
        i = r.indexOf(ch, i + 1);
      }
      map[cy] = r;
    }
  }
  map[y] = map[y].slice(0, x) + ch + map[y].slice(x + 1);
  return out;
}

export function editorFill(def, x, y, ch) {
  const map = Array.isArray(def.map) ? def.map.slice() : [];
  const out = withMap(def, map);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return out;
  if (TILES.indexOf(ch) === -1) return out;
  if (ch === '@' || ch === 'X') return out;
  if (y < 0 || y >= map.length) return out;
  const row = map[y];
  if (typeof row !== 'string' || x < 0 || x >= row.length) return out;
  if (isBorder(map, x, y)) return out;
  const from = row[x];
  if (from === '@' || from === 'X') return out;
  // Flood fill from (x, y) through cells equal to it, the border excepted.
  const seen = new Set();
  const queue = [[x, y]];
  seen.add(x + ',' + y);
  while (queue.length > 0) {
    const [cx, cy] = queue.pop();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (ny < 0 || ny >= map.length) continue;
      const r = map[ny];
      if (typeof r !== 'string' || nx < 0 || nx >= r.length) continue;
      if (isBorder(map, nx, ny)) continue;
      if (r[nx] !== from) continue;
      const key = nx + ',' + ny;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  for (const key of seen) {
    const i = key.indexOf(',');
    const fx = Number(key.slice(0, i));
    const fy = Number(key.slice(i + 1));
    const r = map[fy];
    map[fy] = r.slice(0, fx) + ch + r.slice(fx + 1);
  }
  return out;
}

export function editorResize(def, width, height) {
  const nw = clamp(width, MIN_W, MAX_W);
  const nh = clamp(height, MIN_H, MAX_H);
  const old = Array.isArray(def.map) ? def.map : [];
  const map = [];
  for (let y = 0; y < nh; y++) {
    let row = '';
    for (let x = 0; x < nw; x++) {
      let ch = null;
      if (y > 0 && y < nh - 1 && x > 0 && x < nw - 1 && y < old.length - 1) {
        const r = old[y];
        if (typeof r === 'string' && x < r.length - 1) ch = r[x];
      }
      row += ch !== null ? ch : y === 0 || y === nh - 1 || x === 0 || x === nw - 1 ? '#' : '.';
    }
    map.push(row);
  }
  return withMap(def, map);
}

export function editorErrors(def) {
  return validateLevel(def).errors;
}

export function editorExport(def) {
  return JSON.stringify(def);
}

export function editorImport(text) {
  if (typeof text !== 'string') return null;
  let def;
  try {
    def = JSON.parse(text);
  } catch {
    return null;
  }
  try {
    if (validateLevel(def).errors.indexOf('bad_fields') !== -1) return null;
  } catch {
    return null;
  }
  return def;
}
