// The level editor (DESIGN.md §20). It works on level definitions
// (§4's shape) and never changes its argument: every function returns a
// new definition. Pure — no canvas, no input, no timing; the browser page
// (§15) drives it and shows the results.

import { validateLevel } from './level.js';

// The map characters of §4's table. Anything else is ignored.
const CELLS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

// The editor's size bounds: 5 to 32 wide and 5 to 24 high.
const MIN_W = 5;
const MAX_W = 32;
const MIN_H = 5;
const MAX_H = 24;

function clamped(n, min, max) {
  if (typeof n === 'number' && Number.isFinite(n)) {
    return Math.min(max, Math.max(min, Math.floor(n)));
  }
  return min;
}

function targetSize(width, height) {
  return [clamped(width, MIN_W, MAX_W), clamped(height, MIN_H, MAX_H)];
}

// A shallow copy of the definition with a copied map, so the argument and
// its map array are safe from every edit.
function copyDef(def) {
  return { ...def, map: def.map.slice() };
}

// Outside the map: any row may be short; (x, y) names no cell of it.
function outside(map, x, y) {
  if (!Array.isArray(map) || y < 0 || y >= map.length) return true;
  const row = map[y];
  return typeof row !== 'string' || x < 0 || x >= row.length;
}

// Whether (x, y), inside the map, is a border cell: on the outer edge.
function onBorder(map, x, y) {
  if (outside(map, x, y)) return false;
  return y === 0 || y === map.length - 1 || x === 0 || x === map[y].length - 1;
}

export function editorInit(width, height) {
  const [w, h] = targetSize(width, height);
  const map = [];
  for (let y = 0; y < h; y++) {
    map.push(y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#');
  }
  return { name: 'Untitled', quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 20, map };
}

export function editorPaint(def, x, y, ch) {
  if (typeof ch === 'string' && ch.length === 1 && CELLS.has(ch)) {
    const map = def.map;
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) &&
        !outside(map, x, y) && !onBorder(map, x, y)) {
      // A start or an exit is pinned to one cell: painting it first turns
      // any other one of the same character into floor.
      let before = map;
      if (ch === '@' || ch === 'X') {
        before = map.map((row) => row.split(ch).join('.'));
      }
      const rows = [];
      for (let ry = 0; ry < before.length; ry++) {
        rows.push(ry === y ? before[ry].slice(0, x) + ch + before[ry].slice(x + 1) : before[ry]);
      }
      return { ...def, map: rows };
    }
  }
  return copyDef(def);
}

export function editorFill(def, x, y, ch) {
  const map = def.map;
  if (typeof ch === 'string' && ch.length === 1 && CELLS.has(ch) && ch !== '@' && ch !== 'X' &&
      typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) &&
      !outside(map, x, y) && !onBorder(map, x, y)) {
    const target = map[y][x];
    if (target === ch) return copyDef(def);
    const rows = map.map((row) => row.split(''));
    const height = rows.length;
    const pending = [[x, y]];
    while (pending.length > 0) {
      const [cx, cy] = pending.pop();
      // Never touch the border: cells on it are out of the flood.
      if (cy <= 0 || cy >= height - 1 || cx <= 0 || cx >= rows[cy].length - 1) continue;
      if (rows[cy][cx] !== target) continue;
      rows[cy][cx] = ch;
      pending.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    return { ...def, map: rows.map((row) => row.join('')) };
  }
  return copyDef(def);
}

export function editorResize(def, width, height) {
  const [w, h] = targetSize(width, height);
  const old = def.map;
  const oldH = old.length;
  const oldW = oldH > 0 ? old[0].length : 0;
  const map = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        row += '#';
      } else {
        // Cells keep their character only where the old map had one off
        // its own border; old edges and new ground become floor.
        const before = y > 0 && y < oldH - 1 ? old[y] : null;
        const keep = before !== null && x > 0 && x < before.length - 1 ? (before[x] ?? '.') : '.';
        row += keep;
      }
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
  let def = null;
  try {
    def = JSON.parse(text);
  } catch {
    return null;
  }
  if (def === null || typeof def !== 'object' || Array.isArray(def)) return null;
  let checked = null;
  try {
    checked = validateLevel(def);
  } catch {
    return null;
  }
  if (!checked || !Array.isArray(checked.errors)) return null;
  if (checked.errors.includes('bad_fields')) return null;
  return def;
}
