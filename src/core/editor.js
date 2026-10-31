// Quorum Run: the level editor (DESIGN.md §20).
// Pure: it never changes the definition it is given.
import { validateLevel } from './level.js';

const MIN_WIDTH = 5;
const MAX_WIDTH = 32;
const MIN_HEIGHT = 5;
const MAX_HEIGHT = 24;
// Every character of §4's table.
const CELL_CHARS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

function borderedMap(width, height) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    rows.push(y === 0 || y === height - 1 ? '#'.repeat(width) : '#' + '.'.repeat(width - 2) + '#');
  }
  return rows;
}

// A shallow copy with a fresh map array: rows are immutable strings.
function copyDef(def) {
  return { ...def, map: def.map.slice() };
}

function isBorder(x, y, map) {
  const height = map.length;
  return y === 0 || y === height - 1 || x === 0 || x >= map[y].length - 1;
}

export function editorInit(width, height) {
  return {
    name: 'Untitled',
    quorum: 1,
    par: 100,
    driftPeriod: 2,
    spawnEvery: 20,
    map: borderedMap(clamp(width, MIN_WIDTH, MAX_WIDTH), clamp(height, MIN_HEIGHT, MAX_HEIGHT)),
  };
}

export function editorPaint(def, x, y, ch) {
  const out = copyDef(def);
  if (!CELL_CHARS.has(ch)) return out;
  const map = def.map;
  if (y < 0 || y >= map.length) return out;
  const row = map[y];
  if (x < 0 || x >= row.length) return out;
  if (isBorder(x, y, map)) return out;
  // Painting @ or X clears every other cell of the same character first,
  // so the map keeps at most one of each.
  if (ch === '@' || ch === 'X') {
    out.map = out.map.map((line, ty) => line.split('').map((c, tx) => {
      return tx === x && ty === y ? c : c === ch ? '.' : c;
    }).join(''));
  }
  out.map[y] = out.map[y].slice(0, x) + ch + out.map[y].slice(x + 1);
  return out;
}

export function editorFill(def, x, y, ch) {
  const out = copyDef(def);
  // @ and X can't be filled, nor can anything be filled with them.
  if (!CELL_CHARS.has(ch) || ch === '@' || ch === 'X') return out;
  const map = def.map;
  if (y < 0 || y >= map.length) return out;
  const row = map[y];
  if (x < 0 || x >= row.length) return out;
  if (isBorder(x, y, map)) return out;
  const target = row[x];
  if (target === '@' || target === 'X') return out;
  // Flood fill the connected region of cells equal to the start cell,
  // through up, down, left, and right steps, never onto the border.
  const filled = new Set([`${x},${y}`]);
  const queue = [{ x, y }];
  while (queue.length > 0) {
    const cell = queue.pop();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      const key = `${nx},${ny}`;
      if (filled.has(key)) continue;
      if (ny < 0 || ny >= map.length) continue;
      if (nx < 0 || nx >= map[ny].length) continue;
      if (isBorder(nx, ny, map)) continue;
      if (map[ny][nx] !== target) continue;
      filled.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  out.map = out.map.map((line, ty) => line.split('').map((c, tx) => (filled.has(`${tx},${ty}`) ? ch : c)).join(''));
  return out;
}

export function editorResize(def, width, height) {
  const w = clamp(width, MIN_WIDTH, MAX_WIDTH);
  const h = clamp(height, MIN_HEIGHT, MAX_HEIGHT);
  const old = def.map;
  const oldHeight = old.length;
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      if (y === 0 || y === h - 1 || x === 0 || x === w - 1) row += '#';
      else if (y > 0 && y < oldHeight - 1 && old[y] !== undefined && x > 0 && x < old[y].length - 1) row += old[y][x];
      else row += '.';
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

// A definition whose validateLevel has no bad_fields, else null.
export function editorImport(text) {
  let def;
  try {
    def = JSON.parse(text);
  } catch {
    return null;
  }
  const { errors } = validateLevel(def);
  if (errors.includes('bad_fields')) return null;
  return def;
}
