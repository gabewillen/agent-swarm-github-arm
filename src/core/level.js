// §4 Levels: loading and validation.
//
// A level definition is
//   { name, quorum, par, driftPeriod, spawnEvery, map }
// with map an array of strings, one per row. validateLevel(def) reports the
// error codes of §4, each at most once, in the spec's order. parseLevel(def)
// turns a valid definition into the parsed form the game state holds:
//   { name, quorum, par, driftPeriod, spawnEvery, width, height,
//     tiles, start, spawns, drifts }

// Every character the map table of §4 allows.
const MAP_CHARS = new Set('#.@PMXH^>v<'.split(''));

// A drift's start, facing up, right, down, or left.
const DRIFT_DIR = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

// A wider or taller map is too_big.
const MAX_WIDTH = 32;
const MAX_HEIGHT = 24;

function isPositiveInteger(n) {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

// Check 1 (bad_fields): a field missing or of the wrong type or range.
function hasBadFields(def) {
  if (def === null || typeof def !== 'object') return true;
  if (typeof def.name !== 'string' || def.name.length === 0) return true;
  if (!isPositiveInteger(def.quorum)) return true;
  if (!isPositiveInteger(def.par)) return true;
  if (!isPositiveInteger(def.driftPeriod)) return true;
  if (!isPositiveInteger(def.spawnEvery)) return true;
  if (!Array.isArray(def.map) || def.map.length === 0) return true;
  for (const row of def.map) if (typeof row !== 'string') return true;
  return false;
}

// A four-directional flood fill over the cells that are not '#'.
function reachableCells(map, start) {
  const seen = new Set([start.y + ',' + start.x]);
  const queue = [[start.x, start.y]];
  let head = 0;
  while (head < queue.length) {
    const [x, y] = queue[head++];
    const neighbours = [
      [x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y],
    ];
    for (const [nx, ny] of neighbours) {
      const row = ny >= 0 && ny < map.length ? map[ny] : null;
      if (row === null || nx < 0 || nx >= row.length) continue;
      const key = ny + ',' + nx;
      if (seen.has(key) || row[nx] === '#') continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

export function validateLevel(def) {
  if (hasBadFields(def)) return { ok: false, errors: ['bad_fields'] };

  const map = def.map;
  const height = map.length;
  const width = Math.max(0, ...map.map((row) => row.length));
  const errors = [];

  // 2. ragged: rows of different lengths.
  if (new Set(map.map((row) => row.length)).size > 1) errors.push('ragged');

  // 3. too_big: wider than 32 or taller than 24 cells.
  if (width > MAX_WIDTH || height > MAX_HEIGHT) errors.push('too_big');

  // One scan collects checks 4 to 9: bad chars, border cells, and the
  // counts of the required cell kinds.
  let badChar = false;
  let noBorder = false;
  let starts = 0;
  let exits = 0;
  let merges = 0;
  let spawns = 0;
  let start = null;
  const targets = new Set(); // keys of the P, M, and X cells
  for (let y = 0; y < height; y++) {
    const row = map[y];
    const last = row.length - 1;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (!MAP_CHARS.has(ch)) badChar = true;
      if ((y === 0 || y === height - 1 || x === 0 || x === last) && ch !== '#') noBorder = true;
      if (ch === '@') { starts++; start = { x, y }; }
      if (ch === 'P' || ch === 'M' || ch === 'X') targets.add(y + ',' + x);
    }
  }
  const count = (ch) => map.reduce((n, row) => n + (row.split(ch).length - 1), 0);
  exits = count('X');
  merges = count('M');
  spawns = count('P');

  if (badChar) errors.push('bad_char');
  if (noBorder) errors.push('no_border');
  if (starts !== 1) errors.push('player_count');
  if (exits !== 1) errors.push('exit_count');
  if (merges === 0) errors.push('no_merge');
  if (spawns === 0) errors.push('no_spawn');

  // 10. unreachable, only when there is exactly one '@'.
  if (starts === 1) {
    const seen = reachableCells(map, start);
    for (const target of targets) {
      if (!seen.has(target)) {
        errors.push('unreachable');
        break;
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function parseLevel(def) {
  const check = validateLevel(def);
  if (check.errors.length > 0) {
    throw new Error('invalid level: ' + check.errors.join(', '));
  }
  const { name, quorum, par, driftPeriod, spawnEvery, map } = def;
  const height = map.length;
  const width = map[0].length;
  const tiles = map.map((row) => row.replace(/[@P^>v<]/g, '.'));
  let start = null;
  const spawns = [];
  const drifts = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = map[y][x];
      if (ch === '@') start = { x, y };
      else if (ch === 'P') spawns.push({ x, y });
      else if (DRIFT_DIR[ch]) drifts.push({ x, y, dir: DRIFT_DIR[ch] });
    }
  }
  return {
    name, quorum, par, driftPeriod, spawnEvery, width, height,
    tiles, start, spawns, drifts,
  };
}
