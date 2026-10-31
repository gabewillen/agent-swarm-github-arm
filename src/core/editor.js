// The level editor (DESIGN.md §20). Works on plain level definitions and
// never changes its argument: every editor returns a fresh definition.
// Pure: uses only the level module's validation (§4).

import { validateLevel } from './level.js';

// The map characters of §4, in the order the editor palette shows them.
const PAINTABLE = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

const MIN_WIDTH = 5, MAX_WIDTH = 32;
const MIN_HEIGHT = 5, MAX_HEIGHT = 24;

function clampSize(value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

// A fresh copy of a definition: the maps array is duplicated so row
// assignment can never be seen through the original.
function copied(def) {
  const out = { ...def, map: Array.isArray(def?.map) ? def.map.slice() : [] };
  return out;
}

export function editorInit(width, height) {
  const w = clampSize(width, MIN_WIDTH, MAX_WIDTH);
  const h = clampSize(height, MIN_HEIGHT, MAX_HEIGHT);
  const map = [];
  for (let y = 0; y < h; y++) {
    map.push(y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#');
  }
  return { name: 'Untitled', quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 20, map };
}

export function editorPaint(def, x, y, ch) {
  const out = copied(def);
  if (!PAINTABLE.has(ch)) return out;
  const map = out.map;
  if (map.length < 3) return out;
  const h = map.length;
  const w = Math.min(...map.map((row) => row.length));
  if (w < 3) return out;
  // The border keeps drawing its walls; only interior cells take paint.
  if (x < 1 || x > w - 2 || y < 1 || y > h - 2) return out;
  if (typeof map[y] !== 'string' || map[y].length !== w) return out;
  // One @ and one X: painting one clears any other of the same kind.
  if (ch === '@' || ch === 'X') {
    for (let cy = 1; cy < h - 1; cy++) {
      if (typeof map[cy] !== 'string') continue;
      const ax = map[cy].indexOf(ch);
      if (ax !== -1) map[cy] = map[cy].slice(0, ax) + '.' + map[cy].slice(ax + 1);
    }
  }
  const row = map[y];
  map[y] = row.slice(0, x) + ch + row.slice(x + 1);
  return out;
}

export function editorFill(def, x, y, ch) {
  const out = copied(def);
  // @ and X can't be filled, unknown characters can't fill anything.
  if (!PAINTABLE.has(ch) || ch === '@' || ch === 'X') return out;
  const map = out.map;
  if (map.length < 3) return out;
  const h = map.length;
  const w = Math.min(...map.map((row) => row.length));
  if (w < 3) return out;
  if (x < 1 || x > w - 2 || y < 1 || y > h - 2) return out;
  const row = map[y];
  if (typeof row !== 'string' || row.length !== w) return out;
  const from = row[x];
  // @, X, and border cells are never filled.
  if (from === '@' || from === 'X') return out;
  const seen = new Set();
  const queue = [[x, y]];
  seen.add(y * w + x);
  while (queue.length > 0) {
    const [cx, cy] = queue.pop();
    const target = map[cy];
    map[cy] = target.slice(0, cx) + ch + target.slice(cx + 1);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const key = ny * w + nx;
      if (nx < 1 || nx > w - 2 || ny < 1 || ny > h - 2) continue;
      if (seen.has(key)) continue;
      if (typeof map[ny] !== 'string' || map[ny].length !== w) continue;
      if (map[ny][nx] !== from) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return out;
}

export function editorResize(def, width, height) {
  const out = copied(def);
  const w = clampSize(width, MIN_WIDTH, MAX_WIDTH);
  const h = clampSize(height, MIN_HEIGHT, MAX_HEIGHT);
  const old = Array.isArray(out.map) ? out.map : [];
  const oh = old.length;
  const ow = oh > 0 ? old[0].length : 0;
  const map = [];
  for (let y = 0; y < h; y++) {
    if (y === 0 || y === h - 1) {
      map.push('#'.repeat(w));
      continue;
    }
    let row = '';
    for (let x = 0; x < w; x++) {
      if (x === 0 || x === w - 1) {
        row += '#';
        continue;
      }
      const inside = x >= 1 && x <= ow - 2 && y >= 1 && y <= oh - 2;
      const from = inside && typeof old[y] === 'string' ? old[y][x] : undefined;
      row += inside && from !== undefined ? from : '.';
    }
    map.push(row);
  }
  out.map = map;
  return out;
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
