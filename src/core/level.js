// Level loading and validation (DESIGN.md §4).
//
// A level definition is a plain object: { name, quorum, par, driftPeriod,
// spawnEvery, map }. `validateLevel` reports the codes of §4 in order;
// `parseLevel` throws when the definition is not valid and otherwise turns
// the definition into the parsed level every other module reads.

// A drift character and the direction it faces at parse time.
const DRIFT_DIR = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

// Every cell character of §4's table; anything else is a bad_char.
const CELLS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

// The four numeric fields, each a positive integer.
const POSITIVE = ['quorum', 'par', 'driftPeriod', 'spawnEvery'];

// §4's field types: a non-empty name, four positive integers, and a
// non-empty map of strings. False when any field above is missing or of the
// wrong type or range, so bad_fields is the only check that then runs.
function fieldsOk(def) {
  if (def === null || typeof def !== 'object') return false;
  if (typeof def.name !== 'string' || def.name.length === 0) return false;
  for (const key of POSITIVE) {
    const v = def[key];
    if (!Number.isInteger(v) || v <= 0) return false;
  }
  return Array.isArray(def.map) && def.map.length > 0 &&
    def.map.every((row) => typeof row === 'string');
}

export function validateLevel(def) {
  if (!fieldsOk(def)) return { ok: false, errors: ['bad_fields'] };

  const map = def.map;
  const height = map.length;
  const errors = [];

  // Rows of different lengths. The width is the widest row, so a ragged or
  // uneven map is still measured for too_big.
  let width = map[0].length;
  for (const row of map) if (row.length !== width) { errors.push('ragged'); break; }
  for (const row of map) if (row.length > width) width = row.length;

  // Wider than 32 or taller than 24 cells.
  if (width > 32 || height > 24) errors.push('too_big');

  let badChar = false;
  let noBorder = false;
  let players = 0;
  let exits = 0;
  let merges = 0;
  let spawns = 0;
  let start = null;

  // One pass over the cells: characters not in the table, non-# cells on the
  // outer edge, and the counts that key the checks below.
  for (let y = 0; y < height; y++) {
    const row = map[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (!CELLS.has(ch) && !badChar) badChar = true;
      const onEdge = x === 0 || x === row.length - 1 || y === 0 || y === height - 1;
      if (onEdge && ch !== '#' && !noBorder) noBorder = true;
      if (ch === '@') { players++; start = { x, y }; }
      else if (ch === 'X') exits++;
      else if (ch === 'M') merges++;
      else if (ch === 'P') spawns++;
    }
  }

  if (badChar) errors.push('bad_char');
  if (noBorder) errors.push('no_border');
  if (players !== 1) errors.push('player_count');
  if (exits !== 1) errors.push('exit_count');
  if (merges === 0) errors.push('no_merge');
  if (spawns === 0) errors.push('no_spawn');

  // A P, M, or X that can't be walked to from the @, passing through every
  // cell that is not a wall (holds and the exit count as passable here).
  // Checked only when there is exactly one @.
  if (players === 1) {
    const seen = new Set();
    const stack = [start.x + ':' + start.y];
    seen.add(stack[0]);
    while (stack.length > 0) {
      const [x, y] = stack.pop().split(':').map(Number);
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (ny < 0 || ny >= height || nx < 0 || nx >= map[ny].length) continue;
        if (map[ny][nx] === '#' || seen.has(nx + ':' + ny)) continue;
        seen.add(nx + ':' + ny);
        stack.push(nx + ':' + ny);
      }
    }
    let unreachable = false;
    for (let y = 0; y < height && !unreachable; y++) {
      const row = map[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if ((ch === 'P' || ch === 'M' || ch === 'X') && !seen.has(x + ':' + y)) {
          unreachable = true;
          break;
        }
      }
    }
    if (unreachable) errors.push('unreachable');
  }

  return { ok: errors.length === 0, errors };
}

export function parseLevel(def) {
  const check = validateLevel(def);
  if (!check.ok) {
    throw new Error('invalid level: ' + check.errors.join(' '));
  }

  const map = def.map;
  const width = map[0].length;
  const height = map.length;

  // Reading order, row by row and left to right, is the loop's own order.
  let start = null;
  const spawns = [];
  const drifts = [];
  const tiles = [];

  for (let y = 0; y < height; y++) {
    let line = '';
    for (let x = 0; x < width; x++) {
      const ch = map[y][x];
      if (DRIFT_DIR[ch]) {
        drifts.push({ x, y, dir: DRIFT_DIR[ch] });
        line += '.';
      } else if (ch === '@') {
        start = { x, y };
        line += '.';
      } else if (ch === 'P') {
        spawns.push({ x, y });
        line += '.';
      } else {
        line += ch;
      }
    }
    tiles.push(line);
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
