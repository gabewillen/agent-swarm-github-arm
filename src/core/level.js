// Level loading and validation (DESIGN.md §4).
//
// A level definition is an object { name, quorum, par, driftPeriod,
// spawnEvery, map }, where map is an array of equal-length strings drawn
// from the cell table: '#' wall, '.' floor, '@' the player's start, 'P' a
// patch spawn point, 'M' a merge pad, 'X' the exit, 'H' a hold door, and
// '^' '>' 'v' '<' a drift's start facing up, right, down, or left.
//
// validateLevel(def) reports every problem it finds, in the order §4 lists
// them, each code at most once; bad_fields short-circuits everything.
// parseLevel(def) throws 'invalid level...' for an invalid definition and
// otherwise returns the parsed level the rules use: terrain-only tiles,
// the start cell, and the spawns and drifts in reading order.

const VALID_CHARS = '#.@PMXH^>v<';
const DRIFT_DIRS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };
const MAX_WIDTH = 32;
const MAX_HEIGHT = 24;

function isPositiveInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

// The fields of §4, present, of the right type, and in range.
function fieldsOk(def) {
  return typeof def === 'object' && def !== null && !Array.isArray(def) &&
    typeof def.name === 'string' && def.name.length > 0 &&
    isPositiveInt(def.quorum) &&
    isPositiveInt(def.par) &&
    isPositiveInt(def.driftPeriod) &&
    isPositiveInt(def.spawnEvery) &&
    Array.isArray(def.map) && def.map.length > 0 &&
    def.map.every((row) => typeof row === 'string');
}

export function validateLevel(def) {
  if (!fieldsOk(def)) return { ok: false, errors: ['bad_fields'] };

  const errors = [];
  const map = def.map;
  const height = map.length;

  // The widest row, and whether every row has the same length.
  let width = 0;
  let ragged = false;
  for (const row of map) {
    if (row.length !== map[0].length) ragged = true;
    if (row.length > width) width = row.length;
  }

  // 2. ragged: rows of different lengths.
  if (ragged) errors.push('ragged');

  // 3. too_big: wider than 32 or taller than 24 cells.
  if (width > MAX_WIDTH || height > MAX_HEIGHT) errors.push('too_big');

  // 4. bad_char: a character not in the cell table.
  let badChar = false;
  for (const row of map) {
    for (let x = 0; x < row.length && !badChar; x++) {
      if (VALID_CHARS.indexOf(row[x]) < 0) badChar = true;
    }
  }
  if (badChar) errors.push('bad_char');

  // 5. no_border: an outer-edge cell that is not '#'.
  let bordered = true;
  for (let y = 0; y < height && bordered; y++) {
    const row = map[y];
    if (row.length === 0 || row[0] !== '#' || row[row.length - 1] !== '#') {
      bordered = false;
    }
  }
  if (bordered) {
    for (const row of [map[0], map[height - 1]]) {
      for (let x = 0; x < row.length && bordered; x++) {
        if (row[x] !== '#') bordered = false;
      }
    }
  }
  if (!bordered) errors.push('no_border');

  // The cell counts.
  let players = 0;
  let exits = 0;
  let merges = 0;
  let spawns = 0;
  for (const row of map) {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '@') players++;
      else if (ch === 'X') exits++;
      else if (ch === 'M') merges++;
      else if (ch === 'P') spawns++;
    }
  }

  // 6. to 9. exactly one '@', exactly one 'X', at least one 'M' and 'P'.
  if (players !== 1) errors.push('player_count');
  if (exits !== 1) errors.push('exit_count');
  if (merges === 0) errors.push('no_merge');
  if (spawns === 0) errors.push('no_spawn');

  // 10. unreachable: a 'P', 'M', or 'X' the '@' can't reach through cells
  // that are not '#' (holds and the exit count as passable). Only with
  // exactly one '@'.
  if (players === 1) {
    let sx = 0;
    let sy = 0;
    for (let y = 0; y < height; y++) {
      const x = map[y].indexOf('@');
      if (x >= 0) { sx = x; sy = y; break; }
    }
    const seen = new Set([sx + ',' + sy]);
    const stack = [[sx, sy]];
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (ny < 0 || ny >= height || nx < 0 || nx >= map[ny].length) continue;
        if (map[ny][nx] === '#' || seen.has(nx + ',' + ny)) continue;
        seen.add(nx + ',' + ny);
        stack.push([nx, ny]);
      }
    }
    let reached = true;
    for (let y = 0; y < height && reached; y++) {
      for (let x = 0; x < map[y].length && reached; x++) {
        const ch = map[y][x];
        if ((ch === 'P' || ch === 'M' || ch === 'X') && !seen.has(x + ',' + y)) {
          reached = false;
        }
      }
    }
    if (!reached) errors.push('unreachable');
  }

  return { ok: errors.length === 0, errors };
}

export function parseLevel(def) {
  const check = validateLevel(def);
  if (check.errors.length > 0) {
    throw new Error('invalid level: ' + check.errors.join(', '));
  }

  const map = def.map;
  const width = map[0].length;
  const height = map.length;
  const start = { x: 0, y: 0 };
  const spawns = [];
  const drifts = [];
  const tiles = [];

  for (let y = 0; y < height; y++) {
    let terrain = '';
    const row = map[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '@') {
        start.x = x;
        start.y = y;
        terrain += '.';
      } else if (ch === 'P') {
        spawns.push({ x, y });
        terrain += '.';
      } else if (DRIFT_DIRS[ch] !== undefined) {
        drifts.push({ x, y, dir: DRIFT_DIRS[ch] });
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
