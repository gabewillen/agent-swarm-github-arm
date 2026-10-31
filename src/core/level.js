// Quorum Run — level loading and validation (DESIGN.md §4).
//
// A level definition is a plain object:
//   { name, quorum, par, driftPeriod, spawnEvery, map }
// `validateLevel(def)` returns { ok, errors }: the error codes of §4, in the
// spec's order, each at most once. `parseLevel(def)` turns a valid
// definition into the parsed level the game state holds, and throws an
// Error whose message starts with 'invalid level' for an invalid one.
//
// This module is pure core: no DOM, no clock, no randomness.

const DRIFT_DIRS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

const MAX_WIDTH = 32;
const MAX_HEIGHT = 24;

// Every cell character a map may hold.
const ALLOWED = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

// The order the error codes must come in.
const ERROR_ORDER = [
  'bad_fields', 'ragged', 'too_big', 'bad_char', 'no_border',
  'player_count', 'exit_count', 'no_merge', 'no_spawn', 'unreachable',
];

function isPositiveInteger(v) {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

// Check 1: bad_fields. Any field of §4 missing, of the wrong type, or out
// of range. A non-object, a map that is not a non-empty array of strings,
// or a non-string row counts too.
function badFields(def) {
  if (typeof def !== 'object' || def === null) return true;
  if (typeof def.name !== 'string' || def.name.length === 0) return true;
  if (!isPositiveInteger(def.quorum) || !isPositiveInteger(def.par)) return true;
  if (!isPositiveInteger(def.driftPeriod) || !isPositiveInteger(def.spawnEvery)) return true;
  if (!Array.isArray(def.map) || def.map.length === 0) return true;
  for (const row of def.map) {
    if (typeof row !== 'string') return true;
  }
  return false;
}

// One pass over the map collecting everything validation and parsing need.
// `width` is the widest row; the rest are per-cell scans.
function scanMap(map) {
  const scan = {
    width: 0,
    players: [],
    exits: [],
    merges: [],
    spawns: [],
    drifts: [],
    badChar: false,
    noBorder: false,
  };
  const height = map.length;
  for (let y = 0; y < height; y++) {
    const row = map[y];
    if (row.length > scan.width) scan.width = row.length;
    const rightEdge = row.length - 1;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (!ALLOWED.has(ch)) scan.badChar = true;
      if (ch === '#') continue;
      if (ch === '@') scan.players.push({ x, y });
      else if (ch === 'X') scan.exits.push({ x, y });
      else if (ch === 'M') scan.merges.push({ x, y });
      else if (ch === 'P') scan.spawns.push({ x, y });
      else if (DRIFT_DIRS[ch]) scan.drifts.push({ x, y, dir: DRIFT_DIRS[ch] });
      if (y === 0 || y === height - 1 || x === 0 || x === rightEdge) scan.noBorder = true;
    }
  }
  return scan;
}

// Flood fill from a cell through up, down, left, and right steps over
// every cell that is not '#' (holds and the exit are passable). Returns a
// Set of 'x,y' keys.
function reachable(map, start) {
  const seen = new Set([start.x + ',' + start.y]);
  const frontier = [{ x: start.x, y: start.y }];
  const height = map.length;
  while (frontier.length > 0) {
    const cell = frontier.pop();
    const steps = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (const [dx, dy] of steps) {
      const x = cell.x + dx;
      const y = cell.y + dy;
      if (y < 0 || y >= height || x < 0 || x >= map[y].length) continue;
      if (map[y][x] === '#') continue;
      const key = x + ',' + y;
      if (!seen.has(key)) {
        seen.add(key);
        frontier.push({ x, y });
      }
    }
  }
  return seen;
}

export function validateLevel(def) {
  if (badFields(def)) return { ok: false, errors: ['bad_fields'] };
  const map = def.map;
  const scan = scanMap(map);
  const codes = new Set();

  // 2. ragged: rows of different lengths.
  const lengths = new Set(map.map((row) => row.length));
  if (lengths.size > 1) codes.add('ragged');

  // 3. too_big: wider than 32 or taller than 24.
  if (scan.width > MAX_WIDTH || map.length > MAX_HEIGHT) codes.add('too_big');

  // 4. bad_char; 5. no_border.
  if (scan.badChar) codes.add('bad_char');
  if (scan.noBorder) codes.add('no_border');

  // 6-9. counts.
  if (scan.players.length !== 1) codes.add('player_count');
  if (scan.exits.length !== 1) codes.add('exit_count');
  if (scan.merges.length === 0) codes.add('no_merge');
  if (scan.spawns.length === 0) codes.add('no_spawn');

  // 10. unreachable, only when there is exactly one player start.
  if (scan.players.length === 1) {
    const seen = reachable(map, scan.players[0]);
    const targets = scan.spawns.concat(scan.merges, scan.exits);
    for (const cell of targets) {
      if (!seen.has(cell.x + ',' + cell.y)) {
        codes.add('unreachable');
        break;
      }
    }
  }

  const errors = ERROR_ORDER.filter((code) => codes.has(code));
  return { ok: errors.length === 0, errors };
}

export function parseLevel(def) {
  const { ok, errors } = validateLevel(def);
  if (!ok) {
    throw new Error('invalid level: ' + errors.join(', '));
  }
  const map = def.map;
  const height = map.length;
  const scan = scanMap(map);
  const tiles = [];
  for (let y = 0; y < height; y++) {
    const row = map[y];
    let line = '';
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      // '@', 'P', and the drift chars are actors, not terrain.
      line += (ch === '@' || ch === 'P' || DRIFT_DIRS[ch]) ? '.' : ch;
    }
    tiles.push(line);
  }
  return {
    name: def.name,
    quorum: def.quorum,
    par: def.par,
    driftPeriod: def.driftPeriod,
    spawnEvery: def.spawnEvery,
    width: scan.width,
    height,
    tiles,
    start: { x: scan.players[0].x, y: scan.players[0].y },
    spawns: scan.spawns.map((spawn) => ({ x: spawn.x, y: spawn.y })),
    drifts: scan.drifts.map((drift) => ({ x: drift.x, y: drift.y, dir: drift.dir })),
  };
}
