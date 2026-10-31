// Quorum Run §4: level definitions, validation, and parsing.
// Pure core: no DOM, no randomness, no clocks, no mutation of arguments.

// Drift characters and the direction each one starts facing.
const DRIFT_DIRS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

// Every character a map row may hold (§4's table).
const GOOD_CHARS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

// Level bounds: wider or taller is `too_big` (§4 check 3).
const MAX_WIDTH = 32;
const MAX_HEIGHT = 24;

function isPositiveInt(value) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

// §4 check 1: every listed field present, of the right type and range.
function fieldsOk(def) {
  if (def === null || typeof def !== 'object') return false;
  if (typeof def.name !== 'string' || def.name.length === 0) return false;
  for (const key of ['quorum', 'par', 'driftPeriod', 'spawnEvery']) {
    if (!isPositiveInt(def[key])) return false;
  }
  if (!Array.isArray(def.map) || def.map.length === 0) return false;
  for (const row of def.map) {
    if (typeof row !== 'string') return false;
  }
  return true;
}

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left

// Breadth-first search from (sx, sy), one horizontal or vertical step at a
// time, through every cell whose character is not '#' (holds and the exit
// count as passable). Returns the set of "x,y" keys visited. Bounds follow
// each row's own length, so ragged maps behave cell by cell.
function reachable(map, sx, sy) {
  const seen = new Set();
  const queue = [[sx, sy]];
  seen.add(sx + ',' + sy);
  while (queue.length > 0) {
    const [x, y] = queue.pop();
    const row = map[y];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (ny < 0 || ny >= map.length) continue;
      const nrow = map[ny];
      if (nx < 0 || nx >= nrow.length) continue;
      if (nrow[nx] === '#' || seen.has(nx + ',' + ny)) continue;
      seen.add(nx + ',' + ny);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

// validateLevel(def) -> { ok, errors }: the checks of §4, in order, each code
// at most once; `bad_fields` short-circuits every other check.
export function validateLevel(def) {
  if (!fieldsOk(def)) return { ok: false, errors: ['bad_fields'] };

  const errors = [];
  const has = (code) => {
    if (!errors.includes(code)) errors.push(code);
  };
  const map = def.map;

  // 2. ragged: rows of different lengths.
  const rowWidths = new Set();
  let width = 0;
  for (const row of map) {
    rowWidths.add(row.length);
    if (row.length > width) width = row.length;
  }
  if (rowWidths.size > 1) has('ragged');

  // 3. too_big: wider than 32 or taller than 24 cells.
  if (width > MAX_WIDTH || map.length > MAX_HEIGHT) has('too_big');

  // 4. bad_char: a character not in §4's table.
  let players = 0;
  let exits = 0;
  let merges = 0;
  let spawns = 0;
  let startX = -1;
  let startY = -1;
  for (let y = 0; y < map.length; y++) {
    const row = map[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '@') {
        players++;
        startX = x;
        startY = y;
      } else if (ch === 'X') {
        exits++;
      } else if (ch === 'M') {
        merges++;
      } else if (ch === 'P') {
        spawns++;
      }
      if (!GOOD_CHARS.has(ch)) has('bad_char');
    }
  }

  // 5. no_border: a cell on the outer edge that is not '#'. On ragged maps
  //    each row guards its own first and last cell.
  for (let y = 0; y < map.length; y++) {
    const row = map[y];
    if (y === 0 || y === map.length - 1) {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== '#') has('no_border');
      }
    } else if (row.length > 0) {
      if (row[0] !== '#' || row[row.length - 1] !== '#') has('no_border');
    }
  }

  // 6. player_count: not exactly one '@'.
  if (players !== 1) has('player_count');

  // 7. exit_count: not exactly one 'X'.
  if (exits !== 1) has('exit_count');

  // 8. no_merge: no 'M'.
  if (merges === 0) has('no_merge');

  // 9. no_spawn: no 'P'.
  if (spawns === 0) has('no_spawn');

  // 10. unreachable: a 'P', 'M', or 'X' that can't be reached from the '@'.
  //     Checked only when there is exactly one '@'.
  if (players === 1) {
    const seen = reachable(map, startX, startY);
    for (let y = 0; y < map.length; y++) {
      const row = map[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if ((ch === 'P' || ch === 'M' || ch === 'X') && !seen.has(x + ',' + y)) {
          has('unreachable');
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// parseLevel(def) throws Error('invalid level: ...') for a definition that is
// not valid, and otherwise returns the level the game state holds:
// { name, quorum, par, driftPeriod, spawnEvery, width, height,
//   tiles, start, spawns, drifts }.
export function parseLevel(def) {
  const { ok, errors } = validateLevel(def);
  if (!ok) throw new Error('invalid level: ' + errors.join(', '));

  const tiles = [];
  const spawns = [];
  const drifts = [];
  let start = null;
  let width = 0;

  for (let y = 0; y < def.map.length; y++) {
    let out = '';
    const row = def.map[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '@') {
        start = { x, y };
        out += '.';
      } else if (ch === 'P') {
        spawns.push({ x, y });
        out += '.';
      } else if (DRIFT_DIRS[ch]) {
        drifts.push({ x, y, dir: DRIFT_DIRS[ch] });
        out += '.';
      } else {
        out += ch;
      }
    }
    tiles.push(out);
    if (row.length > width) width = row.length;
  }

  return {
    name: def.name,
    quorum: def.quorum,
    par: def.par,
    driftPeriod: def.driftPeriod,
    spawnEvery: def.spawnEvery,
    width,
    height: def.map.length,
    tiles,
    start,
    spawns,
    drifts,
  };
}
