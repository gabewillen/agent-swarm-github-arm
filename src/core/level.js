// Level loading and validation (DESIGN.md §4).
// A level definition is { name, quorum, par, driftPeriod, spawnEvery, map }.
// validateLevel returns { ok, errors }; parseLevel throws on an invalid
// definition and otherwise returns the parsed level the core plays on.

const VALID_CHARS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);
const DRIFT_DIRS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };
const MAX_W = 32;
const MAX_H = 24;

function isPosInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

export function validateLevel(def) {
  // 1. bad_fields: the fields above missing or of the wrong type or range.
  //    When it is present no other check runs and it is the only code.
  if (
    def === null || typeof def !== 'object' || Array.isArray(def) ||
    typeof def.name !== 'string' || def.name.length === 0 ||
    !isPosInt(def.quorum) || !isPosInt(def.par) ||
    !isPosInt(def.driftPeriod) || !isPosInt(def.spawnEvery) ||
    !Array.isArray(def.map) || def.map.length === 0 ||
    def.map.some((row) => typeof row !== 'string')
  ) return { ok: false, errors: ['bad_fields'] };

  const errors = [];
  const map = def.map;
  const height = map.length;
  const width = map[0].length;

  // 2. ragged: rows of different lengths.
  if (map.some((row) => row.length !== width)) errors.push('ragged');

  // 3. too_big: wider than 32 or taller than 24 cells.
  if (width > MAX_W || height > MAX_H) errors.push('too_big');

  // 4. bad_char: a character not in the table.
  if (map.some((row) => [...row].some((ch) => !VALID_CHARS.has(ch)))) errors.push('bad_char');

  // 5. no_border: a cell on the outer edge that is not '#'.
  let border = false;
  for (let y = 0; y < height; y++) {
    const row = map[y];
    if (y === 0 || y === height - 1) {
      if ([...row].some((ch) => ch !== '#')) border = true;
    } else if (row[0] !== '#' || row[row.length - 1] !== '#') border = true;
  }
  if (border) errors.push('no_border');

  // 6. player_count: not exactly one '@'.
  const players = countChar(map, '@');
  if (players !== 1) errors.push('player_count');

  // 7. exit_count: not exactly one 'X'.
  if (countChar(map, 'X') !== 1) errors.push('exit_count');

  // 8. no_merge: no 'M'.
  if (countChar(map, 'M') < 1) errors.push('no_merge');

  // 9. no_spawn: no 'P'.
  if (countChar(map, 'P') < 1) errors.push('no_spawn');

  // 10. unreachable: a 'P', 'M', or 'X' that can't be reached from the '@'.
  //     Holds and the exit count as passable here. Checked only when there
  //     is exactly one '@'.
  if (players === 1) {
    const reach = reachableFrom(map, width, height);
    let cut = false;
    for (const [x, y] of positionsOf(map, (ch) => ch === 'P' || ch === 'M' || ch === 'X')) {
      if (!reach.has(y * width + x)) cut = true;
    }
    if (cut) errors.push('unreachable');
  }

  return { ok: errors.length === 0, errors };
}

function countChar(map, ch) {
  let n = 0;
  for (const row of map) for (const c of row) if (c === ch) n++;
  return n;
}

function positionsOf(map, keep) {
  const out = [];
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      if (keep(map[y][x])) out.push([x, y]);
    }
  }
  return out;
}

function reachableFrom(map, width, height) {
  const seen = new Set();
  const start = positionsOf(map, (ch) => ch === '@')[0];
  const queue = [start];
  seen.add(start[1] * width + start[0]);
  while (queue.length > 0) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (ny < 0 || ny >= height || map[ny][nx] === undefined) continue;
      if (map[ny][nx] === '#' || seen.has(ny * width + nx)) continue;
      seen.add(ny * width + nx);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

export function parseLevel(def) {
  const { ok, errors } = validateLevel(def);
  if (!ok) throw new Error(`invalid level: ${errors.join(', ')}`);

  const tiles = def.map.map((row) =>
    [...row].map((ch) => (ch === '@' || ch === 'P' || DRIFT_DIRS[ch] ? '.' : ch)).join(''),
  );
  const [[sx, sy]] = positionsOf(def.map, (ch) => ch === '@');
  return {
    name: def.name,
    quorum: def.quorum,
    par: def.par,
    driftPeriod: def.driftPeriod,
    spawnEvery: def.spawnEvery,
    width: def.map[0].length,
    height: def.map.length,
    tiles,
    start: { x: sx, y: sy },
    spawns: positionsOf(def.map, (ch) => ch === 'P').map(([x, y]) => ({ x, y })),
    drifts: positionsOf(def.map, (ch) => DRIFT_DIRS[ch] !== undefined)
      .map(([x, y]) => ({ x, y, dir: DRIFT_DIRS[def.map[y][x]] })),
  };
}
