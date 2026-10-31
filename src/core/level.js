// Level loading and validation (DESIGN.md §4).
//
// A level definition is an object:
//   { name, quorum, par, driftPeriod, spawnEvery, map }
// `validateLevel(def)` returns `{ ok, errors }`; `parseLevel(def)` turns a
// valid definition into the parsed level the game core works on.

const MAX_W = 32;
const MAX_H = 24;

const TERRAIN = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);
const DRIFT_DIR = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

const POSITIVE = ['quorum', 'par', 'driftPeriod', 'spawnEvery'];

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function isPositiveInt(v) {
  return Number.isInteger(v) && v > 0;
}

// Check 1: `bad_fields` — a known field missing or of the wrong type or
// range. When it fires, no other check runs.
function badFields(def) {
  if (!def || typeof def !== 'object' || Array.isArray(def)) return true;
  if (typeof def.name !== 'string' || def.name.length === 0) return true;
  for (const field of POSITIVE) {
    if (!isPositiveInt(def[field])) return true;
  }
  if (!Array.isArray(def.map) || def.map.length === 0) return true;
  for (const row of def.map) {
    if (typeof row !== 'string') return true;
  }
  return false;
}

export function validateLevel(def) {
  // 1. bad_fields stops every other check.
  if (badFields(def)) return { ok: false, errors: ['bad_fields'] };

  const rows = def.map;
  const height = rows.length;
  const width = Math.max(...rows.map((row) => row.length));
  const errors = [];
  const flag = (code) => {
    if (!errors.includes(code)) errors.push(code);
  };

  // 2. ragged: rows of different lengths.
  if (!rows.every((row) => row.length === width)) flag('ragged');

  // 3. too_big: wider than 32 or taller than 24 cells.
  if (width > MAX_W || height > MAX_H) flag('too_big');

  // 4. bad_char: a character not in the table.
  for (const row of rows) {
    for (const ch of row) {
      if (!TERRAIN.has(ch)) flag('bad_char');
    }
  }

  // 5. no_border: a cell on the outer edge that is not '#'.
  for (const row of rows) {
    if (row[0] !== '#' || row[row.length - 1] !== '#') flag('no_border');
  }
  const top = rows[0];
  const bottom = rows[height - 1];
  for (let x = 0; x < width; x++) {
    if (top[x] !== '#' || bottom[x] !== '#') flag('no_border');
  }

  // 6–9. counts: exactly one @, exactly one X, at least one M and one P.
  let players = 0;
  let exits = 0;
  let merges = 0;
  let spawns = 0;
  for (const row of rows) {
    for (const ch of row) {
      if (ch === '@') players++;
      else if (ch === 'X') exits++;
      else if (ch === 'M') merges++;
      else if (ch === 'P') spawns++;
    }
  }
  if (players !== 1) flag('player_count');
  if (exits !== 1) flag('exit_count');
  if (merges === 0) flag('no_merge');
  if (spawns === 0) flag('no_spawn');

  // 10. unreachable: a P, M, or X that can't be reached from the @ through
  // cells that are not '#' (holds and the exit count as passable). Only
  // when there is exactly one @.
  if (players === 1) {
    let sx = 0;
    let sy = 0;
    outer: for (let y = 0; y < height; y++) {
      const x = rows[y].indexOf('@');
      if (x >= 0) {
        sx = x;
        sy = y;
        break outer;
      }
    }
    const seen = new Set([sy * width + sx]);
    const queue = [[sx, sy]];
    while (queue.length > 0) {
      const [cx, cy] = queue.pop();
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        const key = ny * width + nx;
        if (ny < 0 || ny >= height || nx < 0 || nx >= rows[ny].length) continue;
        if (rows[ny][nx] === '#' || seen.has(key)) continue;
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
    let unreachable = false;
    for (let y = 0; y < height && !unreachable; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if ((ch === 'P' || ch === 'M' || ch === 'X') && !seen.has(y * width + x)) {
          unreachable = true;
          break;
        }
      }
    }
    if (unreachable) flag('unreachable');
  }

  return { ok: errors.length === 0, errors };
}

export function parseLevel(def) {
  const { errors } = validateLevel(def);
  if (errors.length > 0) {
    throw new Error('invalid level: ' + errors.join(', '));
  }

  const rows = def.map;
  const height = rows.length;
  const width = Math.max(...rows.map((row) => row.length));
  const tiles = [];
  const spawns = [];
  const drifts = [];
  let start = { x: 0, y: 0 };

  // Reading order: row by row, left to right.
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    let terrain = '';
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '@') {
        start = { x, y };
        terrain += '.';
      } else if (ch === 'P') {
        spawns.push({ x, y });
        terrain += '.';
      } else if (ch in DRIFT_DIR) {
        drifts.push({ x, y, dir: DRIFT_DIR[ch] });
        terrain += '.';
      } else {
        terrain += ch;
      }
    }
    tiles.push(terrain);
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
