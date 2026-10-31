// Quorum Run — level loading and validation (DESIGN.md §4).
//
// A level definition is
//   { name, quorum, par, driftPeriod, spawnEvery, map }
// with `map` an array of row strings over the characters of §4's table.
// Both exports are pure: validateLevel never changes its argument and
// parseLevel returns plain JSON data.

const VALID_CHARS = '#.@PMXH^>v<';

// Drift start characters map to their facing.
const DRIFT_DIR = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

// Characters the map keeps and characters that become plain floor in tiles.
const IS_FLOOR_ONLY = { '@': true, 'P': true, '^': true, '>': true, 'v': true, '<': true };

// The §4 field checks: a non-empty name, four positive integers, and a
// non-empty array of string rows.
function fieldsAreBad(def) {
  if (def === null || typeof def !== 'object') return true;
  if (typeof def.name !== 'string' || def.name.length === 0) return true;
  for (const field of ['quorum', 'par', 'driftPeriod', 'spawnEvery']) {
    const value = def[field];
    if (!Number.isInteger(value) || value <= 0) return true;
  }
  const map = def.map;
  if (!Array.isArray(map) || map.length === 0) return true;
  for (const row of map) {
    if (typeof row !== 'string') return true;
  }
  return false;
}

// Breadth-first flood from the '@' over every cell that is not '#'
// (holds and the exit count as passable, as does everything else).
function reachableCells(rows, start) {
  const seen = new Set([start.x + ',' + start.y]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i];
    const steps = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
    for (const [nx, ny] of steps) {
      if (ny < 0 || ny >= rows.length) continue;
      const row = rows[ny];
      if (nx < 0 || nx >= row.length) continue;
      if (row[nx] === '#') continue;
      const key = nx + ',' + ny;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return seen;
}

export function validateLevel(def) {
  if (fieldsAreBad(def)) return { ok: false, errors: ['bad_fields'] };

  const rows = def.map;
  const height = rows.length;
  let width = 0;
  for (const row of rows) {
    if (row.length > width) width = row.length;
  }

  const errors = [];

  // 2. ragged: rows of different lengths.
  let ragged = false;
  for (let y = 1; y < height; y++) {
    if (rows[y].length !== rows[0].length) {
      ragged = true;
      break;
    }
  }
  if (ragged) errors.push('ragged');

  // 3. too_big: wider than 32 or taller than 24 cells.
  if (width > 32 || height > 24) errors.push('too_big');

  // 4. bad_char: a character not in the table.
  let badChar = false;
  for (const row of rows) {
    for (const ch of row) {
      if (!VALID_CHARS.includes(ch)) {
        badChar = true;
        break;
      }
    }
    if (badChar) break;
  }
  if (badChar) errors.push('bad_char');

  // 5. no_border: a cell on the outer edge that is not '#'.
  let border = false;
  for (let y = 0; y < height && !border; y++) {
    const row = rows[y];
    if (y === 0 || y === height - 1) {
      for (const ch of row) {
        if (ch !== '#') {
          border = true;
          break;
        }
      }
    } else if (row.length > 0 && (row[0] !== '#' || row[row.length - 1] !== '#')) {
      border = true;
    }
  }
  if (border) errors.push('no_border');

  // Counts for the singleton and presence checks.
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

  // 6. player_count: not exactly one '@'.
  if (players !== 1) errors.push('player_count');

  // 7. exit_count: not exactly one 'X'.
  if (exits !== 1) errors.push('exit_count');

  // 8. no_merge: no 'M'.
  if (merges === 0) errors.push('no_merge');

  // 9. no_spawn: no 'P'.
  if (spawns === 0) errors.push('no_spawn');

  // 10. unreachable, only with exactly one '@': a 'P', 'M', or 'X' the
  // flood from the start can't reach.
  if (players === 1) {
    let start = null;
    for (let y = 0; y < height && start === null; y++) {
      const x = rows[y].indexOf('@');
      if (x !== -1) start = { x, y };
    }
    const seen = reachableCells(rows, start);
    let unreached = false;
    for (let y = 0; y < height && !unreached; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if ((ch === 'P' || ch === 'M' || ch === 'X') && !seen.has(x + ',' + y)) {
          unreached = true;
          break;
        }
      }
    }
    if (unreached) errors.push('unreachable');
  }

  return { ok: errors.length === 0, errors };
}

export function parseLevel(def) {
  const { ok, errors } = validateLevel(def);
  if (!ok) throw new Error('invalid level (' + errors.join(', ') + ')');

  const rows = def.map;
  let start = null;
  const spawns = [];
  const drifts = [];
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '@') start = { x, y };
      else if (ch === 'P') spawns.push({ x, y });
      else if (DRIFT_DIR[ch]) drifts.push({ x, y, dir: DRIFT_DIR[ch] });
    }
  }

  // @, P, and the drift starts are floor in the parsed terrain.
  const tiles = rows.map((row) => {
    let out = '';
    for (const ch of row) out += IS_FLOOR_ONLY[ch] ? '.' : ch;
    return out;
  });

  return {
    name: def.name,
    quorum: def.quorum,
    par: def.par,
    driftPeriod: def.driftPeriod,
    spawnEvery: def.spawnEvery,
    width: rows[0].length,
    height: rows.length,
    tiles,
    start,
    spawns,
    drifts,
  };
}
