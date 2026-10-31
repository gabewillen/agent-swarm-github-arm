// The level editor (DESIGN.md §20). It edits level definitions and never
// changes its argument: every editor function returns a new definition.
import { validateLevel } from './level.js';

// §4's map characters, the ones the editor may paint or fill with.
const CELLS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

// The editor's size limits: 5 to 32 wide and 5 to 24 high (§20).
const MIN_WIDTH = 5;
const MAX_WIDTH = 32;
const MIN_HEIGHT = 5;
const MAX_HEIGHT = 24;

function clampSize(n, lo, hi) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

// `editorInit(width, height)` returns an empty level definition of that
// size: `#` on the border, `.` inside.
export function editorInit(width, height) {
  const w = clampSize(width, MIN_WIDTH, MAX_WIDTH);
  const h = clampSize(height, MIN_HEIGHT, MAX_HEIGHT);
  const map = ['#'.repeat(w)];
  for (let y = 1; y < h - 1; y++) map.push('#' + '.'.repeat(w - 2) + '#');
  map.push('#'.repeat(w));
  return { name: 'Untitled', quorum: 1, par: 100, driftPeriod: 2, spawnEvery: 20, map };
}

// The map's cells as arrays of characters, one array per row.
function toGrid(map) {
  return map.map((row) => Array.from(row));
}

// Whether (x, y) is inside, that is off the border and on the map.
function inside(w, h, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 1 && y >= 1 && x <= w - 2 && y <= h - 2;
}

// A copy of the definition with the given map rows.
function withMap(def, rows) {
  return { ...def, map: rows };
}

// `editorPaint(def, x, y, ch)` sets one cell. It ignores a character not
// in §4's table, a cell outside the map, and any cell on the border.
// Painting `@` or `X` first turns any other `@` or `X` into `.`, so
// there is at most one of each.
export function editorPaint(def, x, y, ch) {
  const map = def.map;
  if (!Array.isArray(map) || map.length === 0) return def;
  const h = map.length;
  const w = String(map[0]).length;
  if (!inside(w, h, x, y)) return def;
  if (!CELLS.has(ch)) return def;
  const grid = toGrid(map);
  if (ch === '@' || ch === 'X') {
    for (let yy = 1; yy <= h - 2; yy++) {
      for (let xx = 1; xx <= w - 2; xx++) {
        if (grid[yy][xx] === ch) grid[yy][xx] = '.';
      }
    }
  }
  grid[y][x] = ch;
  return withMap(def, grid.map((row) => row.join('')));
}

// `editorFill(def, x, y, ch)` flood-fills, through up, down, left, and
// right steps, the region of cells equal to the one at `(x, y)` with
// `ch`, never touching the border. `@` and `X` can't be filled, nor can
// a border cell.
export function editorFill(def, x, y, ch) {
  const map = def.map;
  if (!Array.isArray(map) || map.length === 0) return def;
  const h = map.length;
  const w = String(map[0]).length;
  if (!inside(w, h, x, y)) return def;
  if (ch === '@' || ch === 'X' || !CELLS.has(ch)) return def;
  const target = map[y][x];
  if (target === undefined) return def;
  const grid = toGrid(map);
  const seen = new Set();
  const stack = [[x, y]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    if (seen.has(cx + ',' + cy)) continue;
    seen.add(cx + ',' + cy);
    if (!inside(w, h, cx, cy)) continue;
    if (grid[cy][cx] !== target) continue;
    grid[cy][cx] = ch;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return withMap(def, grid.map((row) => row.join('')));
}

// `editorResize(def, width, height)` returns the definition at the new
// size: cells inside the new border keep their character where the old
// map had one off its border, the rest are `.`, and the border is `#`.
export function editorResize(def, width, height) {
  const map = def.map;
  if (!Array.isArray(map) || map.length === 0) return def;
  const w = clampSize(width, MIN_WIDTH, MAX_WIDTH);
  const h = clampSize(height, MIN_HEIGHT, MAX_HEIGHT);
  const oldHeight = map.length;
  const oldWidth = String(map[0]).length;
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      if (y === 0 || y === h - 1 || x === 0 || x === w - 1) row += '#';
      else if (y <= oldHeight - 2 && x <= oldWidth - 2) row += String(map[y])[x];
      else row += '.';
    }
    rows.push(row);
  }
  return withMap(def, rows);
}

// `editorErrors(def)` is the level's validation errors, exactly what
// `validateLevel` (§4) reports.
export function editorErrors(def) {
  return validateLevel(def).errors;
}

// `editorExport(def)` returns the definition as JSON text.
export function editorExport(def) {
  return JSON.stringify(def);
}

// `editorImport(text)` parses an exported definition back: a definition
// whose `validateLevel` has no `bad_fields`, else `null` (also for text
// that isn't JSON).
export function editorImport(text) {
  let def;
  try {
    def = JSON.parse(text);
  } catch {
    return null;
  }
  let errors;
  try {
    errors = validateLevel(def).errors;
  } catch {
    return null;
  }
  if (errors.includes('bad_fields')) return null;
  return def;
}
