// Levels: loading and validation (DESIGN.md §4).

const DRIFT_DIRS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

// '@', 'P', and the drift starts live on floor but are not terrain: the
// parsed level's tiles turn them into '.'.
const NOT_TERRAIN = new Set(['@', 'P', '^', '>', 'v', '<']);

function isPositiveInt(n) {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

function driftDir(ch) {
  return Object.prototype.hasOwnProperty.call(DRIFT_DIRS, ch) ? DRIFT_DIRS[ch] : null;
}

// validateLevel(def) -> { ok, errors }: the codes of §4, in its order,
// each at most once; bad_fields alone and last-checked first out. The
// definition is read, never changed.
export function validateLevel(def) {
  if (def == null || typeof def !== 'object' || Array.isArray(def)) {
    return { ok: false, errors: ['bad_fields'] };
  }
  const badFields =
    typeof def.name !== 'string' || def.name.length === 0 ||
    !isPositiveInt(def.quorum) ||
    !isPositiveInt(def.par) ||
    !isPositiveInt(def.driftPeriod) ||
    !isPositiveInt(def.spawnEvery) ||
    !Array.isArray(def.map) || def.map.length === 0 ||
    !def.map.every((row) => typeof row === 'string');
  if (badFields) return { ok: false, errors: ['bad_fields'] };

  const errors = [];
  const map = def.map;
  const height = map.length;
  const width = Math.max(...map.map((row) => row.length));

  // 2. ragged: rows of different lengths.
  const rowWidth = map[0].length;
  if (map.some((row) => row.length !== rowWidth)) errors.push('ragged');

  // 3. too_big: wider than 32 or taller than 24.
  if (width > 32 || height > 24) errors.push('too_big');

  // 4. bad_char: a character outside the table.
  const known = (ch) =>
    ch === '#' || ch === '.' || ch === '@' || ch === 'P' ||
    ch === 'M' || ch === 'X' || ch === 'H' || driftDir(ch) !== null;
  if (map.some((row) => [...row].some((ch) => !known(ch)))) errors.push('bad_char');

  // 5. no_border: an outer-edge cell that is not '#'.
  const onEdge = (y, x) => y === 0 || y === height - 1 || x === 0 || x === width - 1;
  let edge = false;
  for (let y = 0; y < height && !edge; y++) {
    for (let x = 0; x < width && !edge; x++) {
      if (onEdge(y, x) && map[y][x] !== '#') edge = true;
    }
  }
  if (edge) errors.push('no_border');

  // 6 to 9: counts.
  let players = 0;
  let exits = 0;
  let merges = 0;
  let spawnPoints = 0;
  for (const row of map) {
    for (const ch of row) {
      if (ch === '@') players++;
      else if (ch === 'X') exits++;
      else if (ch === 'M') merges++;
      else if (ch === 'P') spawnPoints++;
    }
  }
  if (players !== 1) errors.push('player_count');
  if (exits !== 1) errors.push('exit_count');
  if (merges === 0) errors.push('no_merge');
  if (spawnPoints === 0) errors.push('no_spawn');

  // 10. unreachable: a P, M, or X off the passable grid from the @ (only
  // with exactly one @).
  if (players === 1) {
    const start = findPlayer(map);
    const reached = flood(map, width, height, start);
    const wanted = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const ch = map[y][x];
        if (ch === 'P' || ch === 'M' || ch === 'X') wanted.push(y * width + x);
      }
    }
    if (wanted.some((i) => !reached.has(i))) errors.push('unreachable');
  }

  return { ok: errors.length === 0, errors };
}

function findPlayer(map) {
  for (let y = 0; y < map.length; y++) {
    const x = map[y].indexOf('@');
    if (x !== -1) return { x, y };
  }
  return null;
}

// Breadth-first over up/down/left/right steps through cells that are not
// '#' (holds and the exit count as passable).
function flood(map, width, height, start) {
  const seen = new Set();
  if (!start) return seen;
  const queue = [start.y * width + start.x];
  seen.add(queue[0]);
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const y = Math.floor(i / width);
    const x = i - y * width;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0) continue;
      const j = ny * width + nx;
      if (seen.has(j)) continue;
      if (ny >= height || nx >= width || map[ny][nx] === undefined) continue;
      if (map[ny][nx] === '#') continue;
      seen.add(j);
      queue.push(j);
    }
  }
  return seen;
}

// parseLevel(def) -> the level of §4: throws when the definition is not
// valid, else the plain-JSON shape every other module reads.
export function parseLevel(def) {
  const { ok, errors } = validateLevel(def);
  if (!ok) throw new Error(`invalid level (${errors.join(', ')})`);

  const map = def.map;
  const height = map.length;
  const width = map[0].length;
  const start = { x: 0, y: 0 };
  const spawns = [];
  const drifts = [];
  const tiles = [];
  for (let y = 0; y < height; y++) {
    let line = '';
    for (let x = 0; x < width; x++) {
      const ch = map[y][x];
      if (NOT_TERRAIN.has(ch)) line += '.';
      else line += ch;
      if (ch === '@') {
        start.x = x;
        start.y = y;
      } else if (ch === 'P') {
        spawns.push({ x, y });
      } else {
        const dir = driftDir(ch);
        if (dir !== null) drifts.push({ x, y, dir });
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
