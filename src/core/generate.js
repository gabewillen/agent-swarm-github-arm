// Quorum Run: generated levels and the daily run (DESIGN.md §19).
// Pure core: a level is built only from the PRNG of §3 started at
// seed >>> 0 — no clock, no DOM, no direct random calls, no Node-only APIs.

import { rngInt } from './rng.js';

const MIN_WIDTH = 7;
const MAX_WIDTH = 32;
const MIN_HEIGHT = 7;
const MAX_HEIGHT = 24;
const DEFAULT_WIDTH = 15;
const DEFAULT_HEIGHT = 11;
const DEFAULT_DRIFTS = 2;
const DEFAULT_SPAWNS = 4;
const DEFAULT_QUORUM = 5;
const DIR_CHARS = ['^', '>', 'v', '<']; // up, right, down, left
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

// 32-bit FNV-1a over the string's UTF-16 code units.
export function hashSeed(text) {
  let h = FNV_OFFSET;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

// The seed of the daily run for a YYYY-MM-DD date, or null for any other text.
export function dailySeed(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return hashSeed(`quorum-run:${date}`);
}

const keyOf = (x, y) => `${x},${y}`;

function interiorOf(width, height) {
  const cells = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) cells.push({ x, y });
  }
  return cells;
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// The keys of every non-'#' cell reachable from `from` by step of one cell.
function flood(grid, from) {
  const seen = new Set([keyOf(from.x, from.y)]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = keyOf(nx, ny);
      if (seen.has(k)) continue;
      if (ny < 0 || ny >= grid.length || nx < 0 || nx >= grid[ny].length) continue;
      if (grid[ny][nx] === '#') continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

export function generateLevel(seed, options) {
  const opt = options === null || options === undefined ? {} : options;
  const width = opt.width === undefined ? DEFAULT_WIDTH : opt.width;
  const height = opt.height === undefined ? DEFAULT_HEIGHT : opt.height;
  const drifts = opt.drifts === undefined ? DEFAULT_DRIFTS : opt.drifts;
  const spawns = opt.spawns === undefined ? DEFAULT_SPAWNS : opt.spawns;
  const quorum = opt.quorum === undefined ? DEFAULT_QUORUM : opt.quorum;
  for (const [name, value, lo, hi] of [
    ['width', width, MIN_WIDTH, MAX_WIDTH],
    ['height', height, MIN_HEIGHT, MAX_HEIGHT],
  ]) {
    if (!Number.isInteger(value) || value < lo || value > hi) {
      throw new RangeError(`generateLevel: ${name} ${value} is out of range ${lo} to ${hi}`);
    }
  }

  let s = seed >>> 0;
  const draw = (n) => {
    const r = rngInt(s, n);
    s = r.seed;
    return r.value;
  };

  // The grid: '#' on the border, '.' inside.
  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push(x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.');
    }
    grid.push(row);
  }

  const occupied = new Set();
  const put = (x, y, ch) => {
    grid[y][x] = ch;
    occupied.add(keyOf(x, y));
  };

  // One shuffle of the interior rooms orders every placement of this level.
  const rooms = interiorOf(width, height);
  const shuffled = rooms.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = draw(i + 1);
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }

  // The player starts in the first room of the shuffle.
  const player = shuffled[0];
  put(player.x, player.y, '@');

  // The exit goes to a room far from the player (or the farthest there is).
  const wanted = Math.max(3, Math.floor((width + height) / 2));
  let exit = null;
  let best = -1;
  for (const cell of shuffled) {
    const d = distance(player, cell);
    if (d >= wanted) {
      exit = cell;
      break;
    }
    if (d > best) {
      best = d;
      exit = cell;
    }
  }
  put(exit.x, exit.y, 'X');

  // A sprinkling of inner walls, none of which may cut the exit off.
  const wallTarget = Math.floor(((width - 2) * (height - 2)) / 15);
  let walls = 0;
  for (const cell of shuffled) {
    if (walls >= wallTarget) break;
    const k = keyOf(cell.x, cell.y);
    if (occupied.has(k)) continue;
    grid[cell.y][cell.x] = '#';
    if (flood(grid, player).has(keyOf(exit.x, exit.y))) {
      occupied.add(k);
      walls += 1;
    } else {
      grid[cell.y][cell.x] = '.';
    }
  }

  // The floor the player can reach, after the walls are in.
  const open = flood(grid, player);

  // Merge pads on reachable floor: two on roomy maps, one on tight ones.
  const pads = open.size >= 60 ? 2 : 1;
  let merges = 0;
  for (const cell of shuffled) {
    if (merges >= pads) break;
    const k = keyOf(cell.x, cell.y);
    if (occupied.has(k) || !open.has(k)) continue;
    put(cell.x, cell.y, 'M');
    merges += 1;
  }

  // Patch spawn points, also on reachable floor.
  let placed = 0;
  for (const cell of shuffled) {
    if (placed >= spawns) break;
    const k = keyOf(cell.x, cell.y);
    if (occupied.has(k) || !open.has(k)) continue;
    put(cell.x, cell.y, 'P');
    placed += 1;
  }

  // Drifts on reachable floor, never nearer than 3 steps to the player.
  // The second and third passes exist only for option counts a map cannot
  // honour; the first pass does the job for every in-range map.
  const spots = [];
  const pass = (eligible) => {
    for (const cell of shuffled) {
      if (spots.length >= drifts) return;
      const k = keyOf(cell.x, cell.y);
      if (occupied.has(k) || !eligible(cell)) continue;
      put(cell.x, cell.y, '.');
      spots.push(cell);
    }
  };
  pass((cell) => open.has(keyOf(cell.x, cell.y)) && distance(player, cell) >= 3);
  pass((cell) => open.has(keyOf(cell.x, cell.y)));
  pass(() => true);
  for (const spot of spots) put(spot.x, spot.y, DIR_CHARS[draw(4)]);

  const par = 40 + width + height;
  return {
    name: `Generated ${seed >>> 0}`,
    quorum,
    par,
    driftPeriod: 2,
    spawnEvery: 12,
    map: grid.map((row) => row.join('')),
  };
}
