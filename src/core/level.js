// Quorum Run — level loading and validation (DESIGN.md §4).
// Pure helpers: no DOM, no randomness, no I/O. `validateLevel` reads its
// argument and never changes; `parseLevel` throws on an invalid definition.

const ALLOWED = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);
const DRIFT_DIRS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };
const MAX_WIDTH = 32;
const MAX_HEIGHT = 24;
const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// True when every field §4 lists is present with the right type and range.
function fieldsOk(def) {
  if (def === null || typeof def !== 'object' || Array.isArray(def)) return false;
  if (typeof def.name !== 'string' || def.name.length === 0) return false;
  for (const field of ['quorum', 'par', 'driftPeriod', 'spawnEvery']) {
    const v = def[field];
    if (!Number.isInteger(v) || v <= 0) return false;
  }
  if (!Array.isArray(def.map) || def.map.length === 0) return false;
  for (const row of def.map) {
    if (typeof row !== 'string') return false;
  }
  return true;
}

function key(x, y) {
  return y + ',' + x;
}

// Flood fill from `start` through cells that are not '#'; walls block,
// holds, the exit, drift tiles, spawn points, and merge pads do not.
function reachable(map, start) {
  const seen = new Set([key(start.x, start.y)]);
  const queue = [start];
  while (queue.length > 0) {
    const { x, y } = queue.pop();
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[ny].length) continue;
      if (map[ny][nx] === '#' || seen.has(key(nx, ny))) continue;
      seen.add(key(nx, ny));
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

// `{ ok, errors }`: the codes of §4, each at most once, in spec order.
export function validateLevel(def) {
  if (!fieldsOk(def)) return { ok: false, errors: ['bad_fields'] };
  const map = def.map;
  const height = map.length;
  let width = 0;
  for (const row of map) width = Math.max(width, row.length);

  const errors = [];
  if (map.some((row) => row.length !== width)) errors.push('ragged');
  if (width > MAX_WIDTH || height > MAX_HEIGHT) errors.push('too_big');

  let badChar = false;
  let badBorder = false;
  let players = 0;
  let exits = 0;
  let merges = 0;
  let spawnCount = 0;
  for (let y = 0; y < height; y++) {
    const row = map[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (!ALLOWED.has(ch)) badChar = true;
      const edge = y === 0 || y === height - 1 || x === 0 || x === row.length - 1;
      if (edge && ch !== '#') badBorder = true;
      if (ch === '@') players++;
      else if (ch === 'X') exits++;
      else if (ch === 'M') merges++;
      else if (ch === 'P') spawnCount++;
    }
  }
  if (badChar) errors.push('bad_char');
  if (badBorder) errors.push('no_border');
  if (players !== 1) errors.push('player_count');
  if (exits !== 1) errors.push('exit_count');
  if (merges === 0) errors.push('no_merge');
  if (spawnCount === 0) errors.push('no_spawn');

  // Unreachable targets are checked only from a single unambiguous `@`.
  if (players === 1) {
    let start = null;
    for (let y = 0; y < height && start === null; y++) {
      const x = map[y].indexOf('@');
      if (x !== -1) start = { x, y };
    }
    const seen = reachable(map, start);
    let blocked = false;
    for (let y = 0; y < height && !blocked; y++) {
      for (let x = 0; x < map[y].length && !blocked; x++) {
        const ch = map[y][x];
        if ((ch === 'P' || ch === 'M' || ch === 'X') && !seen.has(key(x, y))) blocked = true;
      }
    }
    if (blocked) errors.push('unreachable');
  }

  return { ok: errors.length === 0, errors };
}

// The parsed level of §4: terrain-only `tiles`, the `@` as `start`,
// every `P` and drift char in reading order. Throws on an invalid def.
export function parseLevel(def) {
  const { ok, errors } = validateLevel(def);
  if (!ok) throw new Error('invalid level: ' + errors.join(', '));

  const map = def.map;
  const height = map.length;
  const width = map[0].length;
  const tiles = [];
  const spawns = [];
  const drifts = [];
  let start = { x: 0, y: 0 };
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const ch = map[y][x];
      if (ch === '@') {
        start = { x, y };
        row += '.';
      } else if (ch === 'P') {
        spawns.push({ x, y });
        row += '.';
      } else if (DRIFT_DIRS[ch]) {
        drifts.push({ x, y, dir: DRIFT_DIRS[ch] });
        row += '.';
      } else {
        row += ch;
      }
    }
    tiles.push(row);
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
