// Quorum Run — the level editor (DESIGN.md §20).
// Works on a level definition and never changes its argument.
import { validateLevel } from './level.js';

// A level is 5 to 32 cells wide and 5 to 24 cells tall (editorInit clamps).
const MIN_WIDTH = 5;
const MAX_WIDTH = 32;
const MIN_HEIGHT = 5;
const MAX_HEIGHT = 24;

// The map's characters of §4.
const MAP_CHARS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function isEdge(x, y, width, height) {
  return x === 0 || y === 0 || x === width - 1 || y === height - 1;
}

// A single map character, or '.' when the old map has nothing there.
function carriedCell(map, x, y) {
  if (y <= 0 || y >= map.length - 1) return '.';
  const row = map[y];
  if (x <= 0 || x >= row.length - 1) return '.';
  return row[x];
}

export function editorInit(width, height) {
  const w = clamp(width, MIN_WIDTH, MAX_WIDTH);
  const h = clamp(height, MIN_HEIGHT, MAX_HEIGHT);
  const map = [];
  for (let y = 0; y < h; y++) {
    map.push(y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#');
  }
  return {
    name: 'Untitled',
    quorum: 1,
    par: 100,
    driftPeriod: 2,
    spawnEvery: 20,
    map,
  };
}

export function editorPaint(def, x, y, ch) {
  const map = def.map;
  const height = map.length;
  if (typeof ch !== 'string' || ch.length !== 1 || !MAP_CHARS.has(ch)) return def;
  if (y < 0 || y >= height) return def;
  const row = map[y];
  const width = row.length;
  if (x < 0 || x >= width) return def;
  if (isEdge(x, y, width, height)) return def;

  const rows = map.map((line) => line.split(''));
  if (ch === '@' || ch === 'X') {
    // Turn any other '@' or 'X' (the same character) into '.', so there is
    // at most one of each.
    for (let ry = 0; ry < height; ry++) {
      for (let rx = 0; rx < rows[ry].length; rx++) {
        if (rows[ry][rx] === ch) rows[ry][rx] = '.';
      }
    }
  }
  rows[y][x] = ch;
  return { ...def, map: rows.map((line) => line.join('')) };
}

export function editorFill(def, x, y, ch) {
  const map = def.map;
  const height = map.length;
  if (y < 0 || y >= height) return def;
  const row = map[y];
  const width = row.length;
  if (x < 0 || x >= width) return def;
  if (isEdge(x, y, width, height)) return def;
  if (typeof ch !== 'string' || ch.length !== 1 || !MAP_CHARS.has(ch)) return def;
  const target = row[x];
  // '@' and 'X' can't be filled, and a cell already of `ch` fills nothing.
  if (target === '@' || target === 'X' || ch === '@' || ch === 'X' || target === ch) return def;

  const seen = new Set([y * width + x]);
  const stack = [{ x, y }];
  const rows = map.map((line) => line.split(''));
  while (stack.length > 0) {
    const cell = stack.pop();
    rows[cell.y][cell.x] = ch;
    // Flood through up, down, left, and right steps to equal cells, never
    // touching the border.
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      if (nx <= 0 || nx >= width - 1 || ny <= 0 || ny >= height - 1) continue;
      const key = ny * width + nx;
      if (seen.has(key)) continue;
      if (map[ny][nx] !== target) continue;
      seen.add(key);
      stack.push({ x: nx, y: ny });
    }
  }
  return { ...def, map: rows.map((line) => line.join('')) };
}

export function editorResize(def, width, height) {
  const w = clamp(width, MIN_WIDTH, MAX_WIDTH);
  const h = clamp(height, MIN_HEIGHT, MAX_HEIGHT);
  const map = def.map;
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      if (isEdge(x, y, w, h)) {
        row += '#';
      } else {
        // Cells inside the new border keep their character where the old
        // map had one off its own border; the rest are '.'.
        row += carriedCell(map, x, y);
      }
    }
    rows.push(row);
  }
  return { ...def, map: rows };
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
  // A definition whose validation has no bad_fields, else null.
  if (validateLevel(def).errors.includes('bad_fields')) return null;
  return def;
}
