// Level loading and validation (DESIGN.md §4): what a level definition is,
// how it is checked, and how it becomes a level the rules can use.
// Pure: no DOM, no clock, no randomness; nothing here changes its argument.

// The drift characters and the direction each names.
const DRIFT_DIRS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

// Every map character of §4's table.
const CHARS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

const isPositiveInteger = (v) => Number.isInteger(v) && v > 0;

// The fields §4 names, checked first: when any is missing, of the wrong
// type, or out of range, no other check runs.
function badFields(def) {
  if (def === null || typeof def !== 'object' || Array.isArray(def)) return true;
  if (typeof def.name !== 'string' || def.name.length === 0) return true;
  if (!isPositiveInteger(def.quorum)) return true;
  if (!isPositiveInteger(def.par)) return true;
  if (!isPositiveInteger(def.driftPeriod)) return true;
  if (!isPositiveInteger(def.spawnEvery)) return true;
  if (!Array.isArray(def.map) || def.map.length === 0) return true;
  for (const row of def.map) {
    if (typeof row !== 'string') return true;
  }
  return false;
}

// The map's own width: the longest row.
function mapWidth(map) {
  let w = 0;
  for (const row of map) w = Math.max(w, row.length);
  return w;
}

// How many of a character the map holds.
function countChar(map, ch) {
  let n = 0;
  for (const row of map) {
    for (const c of row) {
      if (c === ch) n++;
    }
  }
  return n;
}

export function validateLevel(def) {
  const errors = [];
  if (badFields(def)) return { ok: false, errors: ['bad_fields'] };
  const map = def.map;
  const height = map.length;
  const width = mapWidth(map);
  if (map.some((row) => row.length !== width)) errors.push('ragged');
  if (width > 32 || height > 24) errors.push('too_big');
  for (const row of map) {
    for (const c of row) {
      if (!CHARS.has(c)) {
        errors.push('bad_char');
        break;
      }
    }
    if (errors.includes('bad_char')) break;
  }
  let border = true;
  for (let y = 0; y < height; y++) {
    const row = map[y];
    if (y === 0 || y === height - 1) {
      for (const c of row) {
        if (c !== '#') border = false;
      }
    } else {
      if (row[0] !== '#' || row[row.length - 1] !== '#') border = false;
    }
  }
  if (!border) errors.push('no_border');
  const players = countChar(map, '@');
  const exits = countChar(map, 'X');
  const merges = countChar(map, 'M');
  const spawns = countChar(map, 'P');
  if (players !== 1) errors.push('player_count');
  if (exits !== 1) errors.push('exit_count');
  if (merges === 0) errors.push('no_merge');
  if (spawns === 0) errors.push('no_spawn');
  if (players === 1) {
    let sx = -1;
    let sy = -1;
    for (let y = 0; y < height; y++) {
      const x = map[y].indexOf('@');
      if (x >= 0) {
        sx = x;
        sy = y;
      }
    }
    const seen = new Set();
    const stack = [[sx, sy]];
    seen.add(sy + ':' + sx);
    while (stack.length) {
      const [cx, cy] = stack.pop();
      for (const [nx, ny] of [[cx, cy - 1], [cx + 1, cy], [cx, cy + 1], [cx - 1, cy]]) {
        if (ny < 0 || ny >= height) continue;
        if (nx < 0 || nx >= map[ny].length) continue;
        if (map[ny][nx] === '#') continue;
        const key = ny + ':' + nx;
        if (seen.has(key)) continue;
        seen.add(key);
        stack.push([nx, ny]);
      }
    }
    let reachable = true;
    for (let y = 0; y < height && reachable; y++) {
      for (let x = 0; x < map[y].length && reachable; x++) {
        const c = map[y][x];
        if ((c === 'P' || c === 'M' || c === 'X') && !seen.has(y + ':' + x)) reachable = false;
      }
    }
    if (!reachable) errors.push('unreachable');
  }
  return { ok: errors.length === 0, errors };
}

export function parseLevel(def) {
  const validation = validateLevel(def);
  if (!validation.ok) {
    throw new Error('invalid level: ' + validation.errors.join(', '));
  }
  const map = def.map;
  const tiles = map.map((row) => [...row].map((c) => (c === '@' || c === 'P' || DRIFT_DIRS[c] ? '.' : c)).join(''));
  const start = { x: 0, y: 0 };
  const spawns = [];
  const drifts = [];
  let startSet = false;
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const c = map[y][x];
      if (c === '@') {
        start.x = x;
        start.y = y;
        startSet = true;
      } else if (c === 'P') {
        spawns.push({ x, y });
      } else if (DRIFT_DIRS[c]) {
        drifts.push({ x, y, dir: DRIFT_DIRS[c] });
      }
    }
  }
  return {
    name: def.name,
    quorum: def.quorum,
    par: def.par,
    driftPeriod: def.driftPeriod,
    spawnEvery: def.spawnEvery,
    width: map[0].length,
    height: map.length,
    tiles,
    start: startSet ? start : { x: -1, y: -1 },
    spawns,
    drifts,
  };
}
