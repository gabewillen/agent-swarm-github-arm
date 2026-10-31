// Quorum Run — the level editor's model (DESIGN.md §20).
// Works on level definitions and never changes its argument.
// Pure: no DOM, no randomness, no Node APIs.

import { validateLevel } from './level.js';

// Every character §4's table allows.
const CHARS = '#.PMXH^>v<@';
const MIN_W = 5;
const MAX_W = 32;
const MIN_H = 5;
const MAX_H = 24;

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

// Clamps an editor size, defaulting a non-numeric size to its minimum.
function clampSize(n, lo, hi) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function blankMap(width, height) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    rows.push(y === 0 || y === height - 1 ? '#'.repeat(width) : '#' + '.'.repeat(width - 2) + '#');
  }
  return rows;
}

function replaceChar(row, x, ch) {
  return row.slice(0, x) + ch + row.slice(x + 1);
}

// A cell on the outer edge of the map (§4's border).
function onBorder(map, x, y) {
  if (y <= 0 || y >= map.length - 1) return true;
  const row = map[y];
  if (typeof row !== 'string') return true;
  return x <= 0 || x >= row.length - 1;
}

function inside(map, x, y) {
  if (y < 0 || y >= map.length) return false;
  const row = map[y];
  if (typeof row !== 'string') return false;
  return x >= 0 && x < row.length;
}

function defOk(def) {
  return def !== null && typeof def === 'object' && Array.isArray(def.map);
}

export function editorInit(width, height) {
  const w = clampSize(width, MIN_W, MAX_W);
  const h = clampSize(height, MIN_H, MAX_H);
  return { name: 'Untitled', quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 20, map: blankMap(w, h) };
}

export function editorPaint(def, x, y, ch) {
  if (!defOk(def)) return def;
  if (typeof ch !== 'string' || ch.length !== 1 || !CHARS.includes(ch)) return def;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return def;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (onBorder(def.map, cx, cy)) return def;

  // Painting @ or X first turns any other @ or X of the same kind into '.'.
  const unique = ch === '@' || ch === 'X';
  const map = def.map.map((row, i) => {
    if (typeof row !== 'string') return row;
    if (i === cy) {
      // The cell's own row can already hold a @ or X of the same kind.
      const base = unique ? row.replaceAll(ch, '.') : row;
      return replaceChar(base, cx, ch);
    }
    return unique ? row.replaceAll(ch, '.') : row;
  });
  return Object.assign({}, def, { map });
}

export function editorFill(def, x, y, ch) {
  if (!defOk(def)) return def;
  if (typeof ch !== 'string' || ch.length !== 1 || !CHARS.includes(ch)) return def;
  if (ch === '@' || ch === 'X') return def; // @ and X can't be filled
  if (!Number.isFinite(x) || !Number.isFinite(y)) return def;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (onBorder(def.map, cx, cy)) return def; // nor can a border cell
  const row = def.map[cy];
  const origin = row[cx];
  if (origin === '@' || origin === 'X') return def;

  // Flood-fill through the four neighbours, through cells equal to the
  // origin cell's character, never crossing the border.
  const seen = new Set();
  const stack = [{ x: cx, y: cy }];
  while (stack.length > 0) {
    const { x: sx, y: sy } = stack.pop();
    const key = sy * MAX_W + sx;
    if (seen.has(key)) continue;
    if (!inside(def.map, sx, sy)) continue;
    if (def.map[sy][sx] !== origin) continue;
    if (onBorder(def.map, sx, sy)) continue;
    seen.add(key);
    for (const [dx, dy] of DIRS) stack.push({ x: sx + dx, y: sy + dy });
  }

  const map = def.map.map((r, i) => {
    if (typeof r !== 'string' || r.length === 0) return r;
    let out = '';
    for (let x = 0; x < r.length; x++) out += seen.has(i * MAX_W + x) ? ch : r[x];
    return out;
  });
  return Object.assign({}, def, { map });
}

export function editorResize(def, width, height) {
  if (!defOk(def)) return def;
  const old = def.map;
  const w = clampSize(width, MIN_W, MAX_W);
  const h = clampSize(height, MIN_H, MAX_H);
  const out = blankMap(w, h);
  for (let y = 1; y <= h - 2; y++) {
    const src = typeof old[y] === 'string' ? old[y] : '';
    let row = out[y];
    for (let x = 1; x <= w - 2; x++) {
      if (src.length === 0 || !inside(old, x, y) || onBorder(old, x, y)) continue;
      row = replaceChar(row, x, src[x]);
    }
    out[y] = row;
  }
  return Object.assign({}, def, { map: out });
}

export function editorErrors(def) {
  return validateLevel(def).errors;
}

export function editorExport(def) {
  return JSON.stringify(def);
}

export function editorImport(text) {
  if (typeof text !== 'string') return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const { errors } = validateLevel(parsed);
  if (errors.includes('bad_fields')) return null;
  return parsed;
}
