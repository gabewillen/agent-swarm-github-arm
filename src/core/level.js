// Quorum Run: level loading and validation (DESIGN.md §4).
// Pure: no DOM, no randomness, no Node-only APIs.

// Every cell character a map may hold (§4's table).
const KNOWN = new Set(['#', '.', 'M', 'X', 'H', '@', 'P', '^', '>', 'v', '<']);
// Cells that become plain floor in the parsed tiles.
const FLATTENED = new Set(['@', 'P', '^', '>', 'v', '<']);
const DRIFT_DIRS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

const MAX_WIDTH = 32;
const MAX_HEIGHT = 24;

function isPositiveInt(value) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

// The fields of a level definition: name a non-empty string, the four
// numbers positive integers, map a non-empty array of strings.
function hasBadFields(def) {
  if (def === null || typeof def !== 'object' || Array.isArray(def)) return true;
  if (typeof def.name !== 'string' || def.name === '') return true;
  for (const field of ['quorum', 'par', 'driftPeriod', 'spawnEvery']) {
    if (!isPositiveInt(def[field])) return true;
  }
  if (!Array.isArray(def.map) || def.map.length === 0) return true;
  for (const row of def.map) {
    if (typeof row !== 'string') return true;
  }
  return false;
}

// Every cell (as "x,y") reachable from start by up/down/left/right steps
// through cells that are not '#'. Cells past a row's end are off the map.
function reachableCells(map, start) {
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length > 0) {
    const cell = queue.pop();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = cell.x + dx;
      const y = cell.y + dy;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      const row = map[y];
      if (row === undefined || x < 0 || x >= row.length) continue;
      if (row[x] === '#') continue;
      seen.add(key);
      queue.push({ x, y });
    }
  }
  return seen;
}

export function validateLevel(def) {
  if (hasBadFields(def)) return { ok: false, errors: ['bad_fields'] };
  const map = def.map;
  const height = map.length;
  const lengths = new Set();
  let width = 0;
  for (const row of map) {
    lengths.add(row.length);
    if (row.length > width) width = row.length;
  }
  const errors = [];
  if (lengths.size > 1) errors.push('ragged');
  if (width > MAX_WIDTH || height > MAX_HEIGHT) errors.push('too_big');
  let players = 0;
  let exits = 0;
  let merges = 0;
  let spawns = 0;
  let start = null;
  let badChar = false;
  let badBorder = false;
  const targets = [];
  for (let y = 0; y < height; y++) {
    const row = map[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (!KNOWN.has(ch)) badChar = true;
      if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
        if (ch !== '#') badBorder = true;
      }
      if (ch === '@') {
        players += 1;
        start = { x, y };
      } else if (ch === 'X') {
        exits += 1;
        targets.push({ x, y, ch });
      } else if (ch === 'M') {
        merges += 1;
        targets.push({ x, y, ch });
      } else if (ch === 'P') {
        spawns += 1;
        targets.push({ x, y, ch });
      }
    }
  }
  if (badChar) errors.push('bad_char');
  if (badBorder) errors.push('no_border');
  if (players !== 1) errors.push('player_count');
  if (exits !== 1) errors.push('exit_count');
  if (merges === 0) errors.push('no_merge');
  if (spawns === 0) errors.push('no_spawn');
  if (players === 1) {
    const seen = reachableCells(map, start);
    for (const target of targets) {
      if (!seen.has(`${target.x},${target.y}`)) {
        errors.push('unreachable');
        break;
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function parseLevel(def) {
  const { ok, errors } = validateLevel(def);
  if (!ok) throw new Error(`invalid level: ${errors.join(', ')}`);
  const map = def.map;
  const height = map.length;
  const width = map[0].length;
  const tiles = map.map((row) => {
    let out = '';
    for (let x = 0; x < row.length; x++) {
      out += FLATTENED.has(row[x]) ? '.' : row[x];
    }
    return out;
  });
  const start = { x: 0, y: 0 };
  const spawns = [];
  const drifts = [];
  for (let y = 0; y < height; y++) {
    const row = map[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '@') {
        start.x = x;
        start.y = y;
      } else if (ch === 'P') {
        spawns.push({ x, y });
      } else if (FLATTENED.has(ch)) {
        drifts.push({ x, y, dir: DRIFT_DIRS[ch] });
      }
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
