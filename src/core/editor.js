// src/core/editor.js - the level editor (DESIGN.md §20).
//
// The editor works on level definitions (§4) and never changes its argument:
// every function returns a new definition. It is pure: no DOM, no randomness,
// no clock.
import { validateLevel } from './level.js';

// The cell characters of §4's table.
const CHARS = '#.@PMXH^>v<';

// Size bounds from §20: 5 to 32 wide and 5 to 24 high.
const MIN_W = 5;
const MAX_W = 32;
const MIN_H = 5;
const MAX_H = 24;

const oneOf = (ch, set) => typeof ch === 'string' && set.indexOf(ch) !== -1;

const clampInt = (value, low, high) => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return low;
  return Math.max(low, Math.min(high, n));
};

const isChar = (ch) => oneOf(ch, CHARS);

// A `width` x `height` map of '#' on the border and '.' inside.
const blankMap = (width, height) => {
  const rows = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      row += x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.';
    }
    rows.push(row);
  }
  return rows;
};

const rowsOf = (def) => (def && Array.isArray(def.map) ? def.map : null);

const insideBorder = (rows, x, y) =>
  y >= 1 && y < rows.length - 1 && x >= 1 && x < (rows[y] ? rows[y].length : 0) - 1;

// A copy of `def` carrying a new map, with every row cloned.
const withMap = (def, map) => ({ ...def, map });

// Turn a row into a mutable array of characters.
const cells = (row) => Array.from(String(row));

const setCell = (rows, x, y, ch) => {
  const map = rows.map(cells);
  map[y][x] = ch;
  return map.map((row) => row.join(''));
};

// `editorInit(width, height)`: a bordered empty level, its size clamped to
// §20's bounds.
export function editorInit(width, height) {
  return {
    name: 'Untitled',
    quorum: 1,
    par: 100,
    driftPeriod: 2,
    spawnEvery: 20,
    map: blankMap(clampInt(width, MIN_W, MAX_W), clampInt(height, MIN_H, MAX_H)),
  };
}

// `editorPaint(def, x, y, ch)`: set one cell. An unknown character, a cell
// outside the map, and any cell on the border are ignored. Painting '@' or
// 'X' first clears any other cell holding the same character, so a level has
// at most one of each.
export function editorPaint(def, x, y, ch) {
  const rows = rowsOf(def);
  if (!rows || !isChar(ch)) return def;
  if (!insideBorder(rows, x, y)) return def;
  let map = rows;
  if (ch === '@' || ch === 'X') {
    let cleared = null;
    for (let cy = 0; cy < rows.length; cy++) {
      const row = String(rows[cy]);
      if (row.indexOf(ch) === -1) continue;
      const next = cells(row);
      for (let cx = 0; cx < next.length; cx++) if (next[cx] === ch) next[cx] = '.';
      if (!cleared) cleared = map.map(String);
      cleared[cy] = next.join('');
    }
    if (cleared) map = cleared;
  }
  return withMap(def, setCell(map, x, y, ch));
}

// `editorFill(def, x, y, ch)`: flood-fill the region of cells equal to the
// one at (x, y) with `ch`, through up, down, left, and right steps, never
// touching the border. '@' and 'X' cannot be filled, and neither can a
// border cell.
export function editorFill(def, x, y, ch) {
  const rows = rowsOf(def);
  if (!rows || !isChar(ch)) return def;
  if (ch === '@' || ch === 'X') return def;
  if (!insideBorder(rows, x, y)) return def;
  const target = String(rows[y])[x];
  if (target === ch) return def;

  const map = rows.map(cells);
  const seen = rows.map((row) => cells(row).map(() => false));
  const queue = [[x, y]];
  seen[y][x] = true;
  let filled = false;
  while (queue.length) {
    const [cx, cy] = queue.shift();
    map[cy][cx] = ch;
    filled = true;
    const neighbours = [
      [cx, cy - 1],
      [cx + 1, cy],
      [cx, cy + 1],
      [cx - 1, cy],
    ];
    for (const [nx, ny] of neighbours) {
      if (!insideBorder(rows, nx, ny) || seen[ny][nx]) continue;
      if (map[ny][nx] !== target) continue;
      seen[ny][nx] = true;
      queue.push([nx, ny]);
    }
  }
  if (!filled) return def;
  return withMap(def, map.map((row) => row.join('')));
}

// `editorResize(def, width, height)`: the definition at the new size (clamped
// as in `editorInit`). Cells inside the new border keep their character where
// the old map had one off its border, the rest are '.', and the border is '#'.
export function editorResize(def, width, height) {
  const rows = rowsOf(def);
  const w = clampInt(width, MIN_W, MAX_W);
  const h = clampInt(height, MIN_H, MAX_H);
  const map = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        row += '#';
        continue;
      }
      let ch = null;
      if (rows && y < rows.length) {
        const old = String(rows[y]);
        if (x < old.length && !(y === 0 || x === 0 || y === rows.length - 1 || x === old.length - 1)) {
          ch = old[x];
        }
      }
      row += ch === null ? '.' : ch;
    }
    map.push(row);
  }
  return withMap(def, map);
}

// `editorErrors(def)` is `validateLevel(def).errors`.
export function editorErrors(def) {
  const result = validateLevel(def);
  const errors = result && Array.isArray(result.errors) ? result.errors : [];
  return errors.slice();
}

// `editorExport(def)` is the definition as JSON.
export function editorExport(def) {
  return JSON.stringify(def);
}

// `editorImport(text)` parses one back: a definition whose `validateLevel`
// reports no `bad_fields`, else null (also for text that isn't JSON).
export function editorImport(text) {
  let def;
  try {
    def = JSON.parse(text);
  } catch {
    return null;
  }
  if (!def || typeof def !== 'object' || Array.isArray(def)) return null;
  let result;
  try {
    result = validateLevel(def);
  } catch {
    return null;
  }
  const errors = result && Array.isArray(result.errors) ? result.errors : [];
  if (errors.indexOf('bad_fields') !== -1) return null;
  return def;
}
