// The level editor (DESIGN.md §20). Pure: every function takes a level
// definition and returns a new one, never changing its argument. The
// character table is §4's, the size clamps keep a level 5 to 32 cells
// wide and 5 to 24 high, and the border always stays `#`.

import { validateLevel } from './level.js';

const CHARS = ['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<'];

const MIN_W = 5;
const MAX_W = 32;
const MIN_H = 5;
const MAX_H = 24;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function usable(def) {
  return Array.isArray(def.map) && def.map.length > 0 && typeof def.map[0] === 'string';
}

// True for a cell strictly inside the map (not on the border).
function inside(width, height, x, y) {
  return x > 0 && y > 0 && x < width - 1 && y < height - 1;
}

function charAt(map, x, y) {
  const row = map.length > y ? map[y] : null;
  return row && row.length > x ? row[x] : '.';
}

// A copy of the definition with a new map, keeping every other field.
function withMap(def, map) {
  return { ...def, map };
}

// A copy of the definition that keeps its (copied) map: what the editor
// returns whenever an operation turns out to change nothing.
function copy(def) {
  return withMap(def, usable(def) ? def.map.slice() : def.map);
}

// Border of a `width` x `height` map: `#`, interior `.`.
function borderedMap(width, height) {
  const map = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      row += x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.';
    }
    map.push(row);
  }
  return map;
}

export function editorInit(width, height) {
  const w = typeof width === 'number' && isFinite(width) ? clamp(width, MIN_W, MAX_W) : MIN_W;
  const h = typeof height === 'number' && isFinite(height) ? clamp(height, MIN_H, MAX_H) : MIN_H;
  return { name: 'Untitled', quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 20, map: borderedMap(w, h) };
}

// One cell, unless the character is unknown, the cell lies outside the
// map or on its border, or the definition has no usable map. Painting
// `@` or `X` erases any other of that character first.
export function editorPaint(def, x, y, ch) {
  if (!CHARS.includes(ch)) return copy(def);
  if (!usable(def)) return copy(def);
  const height = def.map.length;
  const width = def.map[0].length;
  if (typeof x !== 'number' || typeof y !== 'number') return copy(def);
  if (!inside(width, height, x, y)) return copy(def);
  const out = [];
  for (let cy = 0; cy < height; cy++) {
    let row = '';
    for (let cx = 0; cx < width; cx++) {
      const c = charAt(def.map, cx, cy);
      if (cx === x && cy === y) row += ch;
      else if ((ch === '@' || ch === 'X') && c === ch) row += '.';
      else row += c;
    }
    out.push(row);
  }
  return withMap(def, out);
}

// Flood-fill the connected region of cells equal to the one at (x, y)
// with `ch`, through up, down, left, and right steps, never crossing the
// border. `@` and `X` can't be used as the fill, nor can border cells be
// filled.
export function editorFill(def, x, y, ch) {
  if (ch === '@' || ch === 'X' || !CHARS.includes(ch)) return copy(def);
  if (!usable(def)) return copy(def);
  const height = def.map.length;
  const width = def.map[0].length;
  if (typeof x !== 'number' || typeof y !== 'number') return copy(def);
  if (!inside(width, height, x, y)) return copy(def);
  const target = charAt(def.map, x, y);
  const seen = new Set();
  const region = [];
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (!inside(width, height, cx, cy)) continue;
    if (charAt(def.map, cx, cy) !== target) continue;
    const key = cy * width + cx;
    if (seen.has(key)) continue;
    seen.add(key);
    region.push(cx, cy);
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  const out = def.map.slice();
  for (let i = 0; i < region.length; i += 2) {
    const cx = region[i];
    const cy = region[i + 1];
    out[cy] = out[cy].slice(0, cx) + ch + out[cy].slice(cx + 1);
  }
  return withMap(def, out);
}

// The new map loaded with kept cells from the old one, where the old map
// had a cell off its own border.
function resizedMap(oldMap, width, height) {
  const oldH = oldMap.length;
  const oldW = oldMap[0] ? oldMap[0].length : 0;
  const map = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      if (!inside(width, height, x, y)) row += '#';
      else if (inside(oldW, oldH, x, y)) row += charAt(oldMap, x, y);
      else row += '.';
    }
    map.push(row);
  }
  return map;
}

// Grow or shrink the map to the new size (clamped as in `editorInit`),
// keeping old interior characters that fit inside the new border, and
// re-bordering around them.
export function editorResize(def, width, height) {
  const w = typeof width === 'number' && isFinite(width) ? clamp(width, MIN_W, MAX_W) : MIN_W;
  const h = typeof height === 'number' && isFinite(height) ? clamp(height, MIN_H, MAX_H) : MIN_H;
  const map = usable(def) ? resizedMap(def.map, w, h) : borderedMap(w, h);
  return withMap(def, map);
}

export function editorErrors(def) {
  return validateLevel(def).errors;
}

export function editorExport(def) {
  return JSON.stringify(def);
}

// Parse an exported definition back. Any JSON object whose fields
// validate (no `bad_fields`) comes back as a definition; anything else
// gives `null`. Other level errors (no player yet, say) are fine.
export function editorImport(text) {
  let def;
  try {
    def = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof def !== 'object' || def === null || Array.isArray(def)) return null;
  if (validateLevel(def).errors.includes('bad_fields')) return null;
  return def;
}
