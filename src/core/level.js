// Level loading and validation (DESIGN.md §4).
//
// A level definition is plain data:
//   { name, quorum, par, driftPeriod, spawnEvery, map: [rows] }
// `validateLevel` reports every problem at most once, in spec order;
// `parseLevel` turns a valid definition into the parsed level the game runs
// on, replacing '@', 'P', and the drift starts with plain floor.

const WALL_CHARS = '#.@PMXH^>v<';

const DRIFT_DIRS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

const MAX_WIDTH = 32;
const MAX_HEIGHT = 24;

function positiveInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

// The field checks of §4 check 1: every field present, right type and range.
// A failure here stops every other check.
function fieldsAreValid(def) {
  if (def === null || typeof def !== 'object' || Array.isArray(def)) return false;
  if (typeof def.name !== 'string' || def.name.length === 0) return false;
  if (!positiveInt(def.quorum)) return false;
  if (!positiveInt(def.par)) return false;
  if (!positiveInt(def.driftPeriod)) return false;
  if (!positiveInt(def.spawnEvery)) return false;
  if (!Array.isArray(def.map) || def.map.length === 0) return false;
  for (const row of def.map) {
    if (typeof row !== 'string') return false;
  }
  return true;
}

export function validateLevel(def) {
  if (!fieldsAreValid(def)) return { ok: false, errors: ['bad_fields'] };
  const map = def.map;

  const height = map.length;
  let width = 0;
  for (const row of map) if (row.length > width) width = row.length;

  const errors = [];

  // 2. ragged: rows of different lengths.
  let ragged = false;
  for (const row of map) {
    if (row.length !== map[0].length) {
      ragged = true;
      break;
    }
  }
  if (ragged) errors.push('ragged');

  // 3. too_big: wider than 32 or taller than 24 cells.
  if (width > MAX_WIDTH || height > MAX_HEIGHT) errors.push('too_big');

  // 4. bad_char and 5. no_border, one pass over the cells.
  let badChar = false;
  let noBorder = false;
  for (let y = 0; y < height; y++) {
    const row = map[y];
    const lastEdge = y === 0 || y === height - 1;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (!WALL_CHARS.includes(ch)) badChar = true;
      const onEdge = lastEdge || x === 0 || x === row.length - 1;
      if (onEdge && ch !== '#') noBorder = true;
    }
  }
  if (badChar) errors.push('bad_char');
  if (noBorder) errors.push('no_border');

  let players = 0;
  let exits = 0;
  let merges = 0;
  let spawns = 0;
  let startX = -1;
  let startY = -1;
  for (let y = 0; y < height; y++) {
    const row = map[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '@') {
        players++;
        if (startX < 0) {
          startX = x;
          startY = y;
        }
      } else if (ch === 'X') exits++;
      else if (ch === 'M') merges++;
      else if (ch === 'P') spawns++;
    }
  }

  // 6. player_count: not exactly one '@'.
  if (players !== 1) errors.push('player_count');
  // 7. exit_count: not exactly one 'X'.
  if (exits !== 1) errors.push('exit_count');
  // 8. no_merge and 9. no_spawn.
  if (merges === 0) errors.push('no_merge');
  if (spawns === 0) errors.push('no_spawn');

  // 10. unreachable: a P, M, or X the player can't reach through cells that
  // are not '#' (holds and the exit count as passable). Only with the one '@'.
  if (players === 1) {
    const seen = new Set();
    const queue = [[startX, startY]];
    seen.add(startY * width + startX);
    while (queue.length > 0) {
      const [x, y] = queue.pop();
      const steps = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
      for (const [nx, ny] of steps) {
        if (ny < 0 || ny >= height || nx < 0 || nx >= map[ny].length) continue;
        if (map[ny][nx] === '#') continue;
        const key = ny * width + nx;
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
    let reachable = true;
    for (let y = 0; y < height && reachable; y++) {
      const row = map[y];
      for (let x = 0; x < row.length; x++) {
        if ((row[x] === 'P' || row[x] === 'M' || row[x] === 'X') && !seen.has(y * width + x)) {
          reachable = false;
          break;
        }
      }
    }
    if (!reachable) errors.push('unreachable');
  }

  return { ok: errors.length === 0, errors };
}

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
    const row = map[y];
    let terrain = '';
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '@') {
        start = { x, y };
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
