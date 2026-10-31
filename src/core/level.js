// Quorum Run — level loading and validation (DESIGN.md §4).
// Pure: no DOM, no randomness, no Node APIs.

const TERRAIN = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

// Map characters that are not terrain in the parsed level: the player's
// start, a patch spawn, and the four drift starts all become floor.
const DELETE = { '@': '.', 'P': '.', '^': '.', '>': '.', 'v': '.', '<': '.' };

const DIR_OF = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

const FIELDS = ['quorum', 'par', 'driftPeriod', 'spawnEvery'];

const MAX_WIDTH = 32;
const MAX_HEIGHT = 24;

function fieldsOk(def) {
  if (def === null || typeof def !== 'object') return false;
  if (typeof def.name !== 'string' || def.name.length === 0) return false;
  for (const key of FIELDS) {
    const value = def[key];
    if (!Number.isInteger(value) || value <= 0) return false;
  }
  if (!Array.isArray(def.map) || def.map.length === 0) return false;
  return def.map.every((row) => typeof row === 'string');
}

// The single '@' cell. validateLevel calls this only when it has counted
// exactly one, so the scan is guaranteed to find it.
function startsOf(map) {
  let start = null;
  for (let y = 0; y < map.length && start === null; y++) {
    const x = map[y].indexOf('@');
    if (x !== -1) start = { x, y };
  }
  return start;
}

// Flood-fill over cells that are not walls, from the '@'.
function reachableFrom(map, start, targets) {
  const seen = new Set([start.y + ':' + start.x]);
  const queue = [start];
  while (queue.length > 0) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = ny + ':' + nx;
      if (seen.has(key)) continue;
      const row = map[ny];
      if (row === undefined || nx < 0 || nx >= row.length) continue;
      if (map[ny][nx] === '#') continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return targets.every((t) => seen.has(t.y + ':' + t.x));
}

export function validateLevel(def) {
  const errors = [];

  // 1. bad_fields: when present, no other check runs.
  if (!fieldsOk(def)) return { ok: false, errors: ['bad_fields'] };

  const map = def.map;
  const height = map.length;
  const width = map.reduce((w, row) => Math.max(w, row.length), 0);

  // 2. ragged: rows of different lengths.
  if (map.some((row) => row.length !== width)) errors.push('ragged');

  // 3. too_big: wider than 32 or taller than 24.
  if (width > MAX_WIDTH || height > MAX_HEIGHT) errors.push('too_big');

  // 4-9. per-cell and per-count checks, counted in one scan.
  let badChar = false;
  let borderOk = true;
  let players = 0;
  let exits = 0;
  let merges = 0;
  let spawns = 0;
  const targets = [];
  for (let y = 0; y < height; y++) {
    const row = map[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (!TERRAIN.has(ch)) badChar = true;
      const onEdge = y === 0 || y === height - 1 || x === 0 || x === row.length - 1;
      if (onEdge && ch !== '#') borderOk = false;
      if (ch === '@') players++;
      if (ch === 'X') { exits++; targets.push({ x, y }); }
      if (ch === 'M') { merges++; targets.push({ x, y }); }
      if (ch === 'P') { spawns++; targets.push({ x, y }); }
    }
  }

  if (badChar) errors.push('bad_char');
  if (!borderOk) errors.push('no_border');
  if (players !== 1) errors.push('player_count');
  if (exits !== 1) errors.push('exit_count');
  if (merges === 0) errors.push('no_merge');
  if (spawns === 0) errors.push('no_spawn');

  // 10. unreachable: only with exactly one '@'; holds and the exit are
  // passable here (they are not walls, which is all this check asks).
  if (players === 1 && !reachableFrom(map, startsOf(map), targets)) {
    errors.push('unreachable');
  }

  return { ok: errors.length === 0, errors };
}

export function parseLevel(def) {
  const { ok, errors } = validateLevel(def);
  if (!ok) throw new Error('invalid level: ' + errors.join(', '));

  const map = def.map;
  const height = map.length;
  const width = map[0].length;

  const tiles = map.map((row) => {
    let out = '';
    for (let x = 0; x < row.length; x++) out += DELETE[row[x]] ?? row[x];
    return out;
  });

  let start = null;
  const spawns = [];
  const drifts = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const ch = map[y][x];
      if (ch === '@') start = { x, y };
      else if (ch === 'P') spawns.push({ x, y });
      else if (DIR_OF[ch] !== undefined) drifts.push({ x, y, dir: DIR_OF[ch] });
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
