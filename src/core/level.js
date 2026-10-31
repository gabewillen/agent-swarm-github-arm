// Level loading and validation (DESIGN.md §4). A level definition is an
// object with a `name`, the four rules fields (`quorum`, `par`,
// `driftPeriod`, `spawnEvery`), and a `map` of rows; these functions
// check it and turn it into the parsed shape the game plays.

// The map's characters, from §4's table.
const BOARD_CHARS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

// A drift character and the direction it starts facing.
const DRIFT_DIRS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

// The four step directions, for reachability.
const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function isPositiveInt(n) {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1;
}

// Step 1: the required fields, with their types and ranges (§4). When
// this fails no other check runs, so it returns the only code.
function badFields(def) {
  const okName = typeof def.name === 'string' && def.name.length > 0;
  const okMap = Array.isArray(def.map) && def.map.length > 0
    && def.map.every((row) => typeof row === 'string');
  const okRules = isPositiveInt(def.quorum) && isPositiveInt(def.par)
    && isPositiveInt(def.driftPeriod) && isPositiveInt(def.spawnEvery);
  return !(okName && okRules && okMap) ? ['bad_fields'] : null;
}

// How many cells hold the character, over the whole map.
function charCount(map, ch) {
  let n = 0;
  for (const row of map) {
    for (const cell of row) if (cell === ch) n++;
  }
  return n;
}

// The checks of §4, steps 2 to 9 and 10, each at most once, in order.
function boardErrors(map) {
  const errors = [];
  const height = map.length;
  const width = Math.max(...map.map((row) => row.length));

  if (map.some((row) => row.length !== width)) errors.push('ragged');
  if (width > 32 || height > 24) errors.push('too_big');
  if (map.some((row) => Array.from(row).some((cell) => !BOARD_CHARS.has(cell)))) errors.push('bad_char');

  const noBorder = map.some((row, y) => {
    if (y === 0 || y === height - 1) return Array.from(row).some((cell) => cell !== '#');
    return row[0] !== '#' || row[row.length - 1] !== '#';
  });
  if (noBorder) errors.push('no_border');

  if (charCount(map, '@') !== 1) errors.push('player_count');
  if (charCount(map, 'X') !== 1) errors.push('exit_count');
  if (charCount(map, 'M') === 0) errors.push('no_merge');
  if (charCount(map, 'P') === 0) errors.push('no_spawn');

  // Step 10, checked only when there is exactly one `@`: every `P`, `M`,
  // and `X` is reachable from the start through non-wall cells, with
  // holds and the exit passable.
  if (charCount(map, '@') === 1) {
    const seen = new Set();
    const stack = [];
    for (let y = 0; y < height && stack.length === 0; y++) {
      for (let x = 0; x < width; x++) {
        if (map[y][x] === '@') {
          seen.add(x + ',' + y);
          stack.push([x, y]);
          break;
        }
      }
    }
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      for (const [dx, dy] of STEPS) {
        const nx = x + dx;
        const ny = y + dy;
        const cell = ny >= 0 && ny < height ? map[ny][nx] : undefined;
        if (!cell || cell === '#' || seen.has(nx + ',' + ny)) continue;
        seen.add(nx + ',' + ny);
        stack.push([nx, ny]);
      }
    }
    const unreachable = map.some((row, y) => Array.from(row).some((cell, x) =>
      (cell === 'P' || cell === 'M' || cell === 'X') && !seen.has(x + ',' + y)));
    if (unreachable) errors.push('unreachable');
  }

  return errors;
}

// `validateLevel(def)` returns `{ ok, errors }`, the errors of §4 in
// order, each at most once, and `ok` true when there are none.
export function validateLevel(def) {
  const bad = badFields(def ?? {});
  if (bad) return { ok: false, errors: bad };
  const errors = boardErrors(def.map);
  return { ok: errors.length === 0, errors };
}

// `parseLevel(def)` turns a valid definition into the parsed level the
// game state holds, and throws for an invalid one.
export function parseLevel(def) {
  const { ok, errors } = validateLevel(def);
  if (!ok) throw new Error('invalid level: ' + errors.join(', '));
  const tiles = def.map.map((row) => row.replace(/[@P^>v<]/g, '.'));
  const start = { x: 0, y: 0 };
  const spawns = [];
  const drifts = [];
  let hasStart = false;
  def.map.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      if (cell === '@') {
        start.x = x;
        start.y = y;
        hasStart = true;
      }
      if (cell === 'P') spawns.push({ x, y });
      if (DRIFT_DIRS[cell]) drifts.push({ x, y, dir: DRIFT_DIRS[cell] });
    }
  });
  if (!hasStart) {
    // A definition can't get here with exactly one `@`; guard anyway.
    throw new Error('invalid level: player_count');
  }
  return {
    name: def.name,
    quorum: def.quorum,
    par: def.par,
    driftPeriod: def.driftPeriod,
    spawnEvery: def.spawnEvery,
    width: def.map[0].length,
    height: def.map.length,
    tiles,
    start,
    spawns,
    drifts,
  };
}
