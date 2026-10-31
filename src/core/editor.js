// Quorum Run — the level editor (§20).
//
// Small pure operations over a level definition (§4). Every function
// returns a new definition and never changes its argument: maps are
// rebuilt as fresh arrays of fresh strings, and the other fields of the
// definition ride along untouched.

import { validateLevel } from './level.js';

// The map characters of §4, the only paints the editor accepts.
const PAINTABLE = ['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<'];

// Sizes are clamped to these bounds, wide first then tall.
const W_MIN = 5;
const W_MAX = 32;
const H_MIN = 5;
const H_MAX = 24;

function clampSize(value, min, max) {
  const v = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : min;
  return Math.min(max, Math.max(min, v));
}

// The definition's map as an array of strings, or null when it has none.
function rowsOf(def) {
  return def && Array.isArray(def.map) && def.map.every((row) => typeof row === 'string')
    ? def.map
    : null;
}

// A bordered map: '#' on the border, '.' inside.
function borderedMap(w, h) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    rows.push(y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#');
  }
  return rows;
}

// A cell off the border of its map, addressed by coordinates that exist.
function isInterior(rows, x, y) {
  return (
    y > 0 &&
    y < rows.length - 1 &&
    x > 0 &&
    x < rows[y].length - 1
  );
}

export function editorInit(width, height) {
  const w = clampSize(width, W_MIN, W_MAX);
  const h = clampSize(height, H_MIN, H_MAX);
  return {
    name: 'Untitled',
    quorum: 1,
    par: 100,
    driftPeriod: 2,
    spawnEvery: 20,
    map: borderedMap(w, h),
  };
}

export function editorPaint(def, x, y, ch) {
  const rows = rowsOf(def);
  if (!rows || typeof ch !== 'string' || ch.length !== 1 || !PAINTABLE.includes(ch)) return def;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return def;
  if (y < 0 || y >= rows.length) return def;
  const row = rows[y];
  if (x < 0 || x >= row.length) return def;
  // The border of the map keeps its wall, whatever the paint.
  if (!isInterior(rows, x, y)) return def;
  // Painting the player or the exit keeps just one of that character.
  const unique = ch === '@' || ch === 'X';
  const map = rows.map((r, ry) => {
    let next = unique ? r.split(ch).join('.') : r;
    if (ry === y) next = next.slice(0, x) + ch + next.slice(x + 1);
    return next;
  });
  return { ...def, map };
}

export function editorFill(def, x, y, ch) {
  const rows = rowsOf(def);
  if (!rows || typeof ch !== 'string' || ch.length !== 1 || !PAINTABLE.includes(ch)) return def;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return def;
  if (y < 0 || y >= rows.length) return def;
  const row = rows[y];
  if (x < 0 || x >= row.length) return def;
  // The fill starts inside, and @ and X can't be filled.
  if (!isInterior(rows, x, y)) return def;
  if (ch === '@' || ch === 'X') return def;
  const target = rows[y][x];
  if (target === '@' || target === 'X') return def;
  // Flood out through same-character interior cells; the border stops it.
  const region = [];
  const seen = new Set();
  const stack = [[x, y]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    const key = cy * 65536 + cx;
    if (seen.has(key)) continue;
    seen.add(key);
    if (rows[cy][cx] !== target) continue;
    region.push([cx, cy]);
    for (const [nx, ny] of [[cx, cy - 1], [cx + 1, cy], [cx, cy + 1], [cx - 1, cy]]) {
      if (ny < 0 || ny >= rows.length) continue;
      if (nx < 0 || nx >= rows[ny].length) continue;
      if (!isInterior(rows, nx, ny)) continue;
      stack.push([nx, ny]);
    }
  }
  const onRow = new Map();
  for (const [cx, cy] of region) {
    if (!onRow.has(cy)) onRow.set(cy, []);
    onRow.get(cy).push(cx);
  }
  const map = rows.map((r, ry) => {
    const cells = onRow.get(ry);
    if (!cells) return r;
    const chars = r.split('');
    for (const cx of cells) chars[cx] = ch;
    return chars.join('');
  });
  return { ...def, map };
}

export function editorResize(def, width, height) {
  const w = clampSize(width, W_MIN, W_MAX);
  const h = clampSize(height, H_MIN, H_MAX);
  const rows = rowsOf(def);
  if (!rows) return { ...def, map: borderedMap(w, h) };
  const oldHeight = rows.length;
  const map = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      // The new border is wall; inside, keep what the old map held off
      // its own border at the same coordinates, else a floor cell.
      if (y === 0 || y === h - 1 || x === 0 || x === w - 1) {
        row += '#';
      } else if (isInterior(rows, x, y)) {
        row += rows[y][x];
      } else {
        row += '.';
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
  if (typeof text !== 'string') return null;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  let errors;
  try {
    errors = validateLevel(value).errors;
  } catch {
    return null;
  }
  if (!Array.isArray(errors) || errors.includes('bad_fields')) return null;
  return value;
}
