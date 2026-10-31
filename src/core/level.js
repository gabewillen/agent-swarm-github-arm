// Quorum Run — level loading and validation (DESIGN.md §4).
// Pure: no DOM, no randomness, no side effects.

// The map's characters (DESIGN.md §4 table).
const MAP_CHARS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

// A drift character's facing (same §4 table).
const DRIFT_DIRS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

// A level is at most 32 cells wide and 24 cells tall.
const MAX_WIDTH = 32;
const MAX_HEIGHT = 24;

const DIR_STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left

// A field is a positive integer.
function isPositiveInteger(v) {
  return Number.isInteger(v) && v > 0;
}

// `bad_fields`: a field of §4 missing, of the wrong type, or out of range.
// When it holds, no other check runs and it is the only code.
function hasBadFields(def) {
  if (def === null || typeof def !== 'object' || Array.isArray(def)) return true;
  const { name, quorum, par, driftPeriod, spawnEvery, map } = def;
  if (typeof name !== 'string' || name.length === 0) return true;
  if (!isPositiveInteger(quorum) || !isPositiveInteger(par) ||
    !isPositiveInteger(driftPeriod) || !isPositiveInteger(spawnEvery)) return true;
  if (!Array.isArray(map) || map.length === 0) return true;
  for (const row of map) {
    if (typeof row !== 'string') return true;
  }
  return false;
}

function isEdge(x, y, width, height) {
  return x === 0 || y === 0 || x === width - 1 || y === height - 1;
}

export function validateLevel(def) {
  if (hasBadFields(def)) return { ok: false, errors: ['bad_fields'] };

  const map = def.map;
  const height = map.length;
  const width = map[0].length;
  const errors = [];
  const add = (code) => { if (!errors.includes(code)) errors.push(code); };

  // ragged: rows of different lengths.
  for (const row of map) {
    if (row.length !== width) { add('ragged'); break; }
  }

  // too_big: wider than 32 or taller than 24 cells.
  if (width > MAX_WIDTH || height > MAX_HEIGHT) add('too_big');

  // bad_char: a character not in §4's table; also count the specials.
  let badChar = false;
  let players = 0;
  let exits = 0;
  let merges = 0;
  let spawns = 0;
  let start = null;
  for (let y = 0; y < height; y++) {
    const row = map[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (!MAP_CHARS.has(ch)) { badChar = true; continue; }
      if (ch === '@') { players++; start = { x, y }; }
      else if (ch === 'X') exits++;
      else if (ch === 'M') merges++;
      else if (ch === 'P') spawns++;
    }
  }
  if (badChar) add('bad_char');

  // no_border: a cell on the outer edge that is not '#'. A cell a short
  // row leaves out is missing, so it is not '#' either.
  let borderOk = true;
  for (let y = 0; y < height && borderOk; y++) {
    for (let x = 0; x < width && borderOk; x++) {
      if (isEdge(x, y, width, height) && map[y][x] !== '#') borderOk = false;
    }
  }
  if (!borderOk) add('no_border');

  // Counts of the specials.
  if (players !== 1) add('player_count');
  if (exits !== 1) add('exit_count');
  if (merges === 0) add('no_merge');
  if (spawns === 0) add('no_spawn');

  // unreachable: every P, M, or X must be reachable from the one '@' by
  // up, down, left, and right steps through cells that are not '#'. Holds
  // (`H`), the exit, and drift starts count as passable here. Checked only
  // when there is exactly one '@'.
  if (players === 1) {
    const seen = new Set();
    const queue = [{ x: start.x, y: start.y }];
    seen.add(start.y * width + start.x);
    while (queue.length > 0) {
      const cell = queue.pop();
      for (const [dx, dy] of DIR_STEPS) {
        const nx = cell.x + dx;
        const ny = cell.y + dy;
        const key = ny * width + nx;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (seen.has(key)) continue;
        const row = map[ny];
        if (row[nx] === undefined || row[nx] === '#') continue; // a wall blocks
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
    let unreachable = false;
    for (let y = 0; y < height && !unreachable; y++) {
      const row = map[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if ((ch === 'P' || ch === 'M' || ch === 'X') && !seen.has(y * width + x)) {
          unreachable = true;
          break;
        }
      }
    }
    if (unreachable) add('unreachable');
  }

  return { ok: errors.length === 0, errors };
}

// Turns a definition into the parsed level the game works with. Throws an
// `Error` starting with `invalid level` for a definition that does not
// validate. Never changes `def`.
export function parseLevel(def) {
  const { ok, errors } = validateLevel(def);
  if (!ok) throw new Error(`invalid level: ${errors.join(', ')}`);

  const map = def.map;
  const height = map.length;
  const width = map[0].length;

  // tiles: the map with '@', 'P', and every drift character as '.'.
  const tiles = map.map((row) => row.replace(/[@P^>v<]/g, '.'));

  let start = null;
  const spawns = []; // reading order: row by row, left to right
  const drifts = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = map[y][x];
      if (ch === '@') start = { x, y };
      else if (ch === 'P') spawns.push({ x, y });
      else if (ch in DRIFT_DIRS) drifts.push({ x, y, dir: DRIFT_DIRS[ch] });
    }
  }

  return {
    name: def.name,
    quorum: def.quorum,
    par: def.par,
    driftPeriod: def.driftPeriod,
    spawnEvery: def.spawnEvery,
    width,
    height,
    tiles,
    start,
    spawns,
    drifts,
  };
}
