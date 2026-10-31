// Level loading and validation (DESIGN.md §4).
// Pure: a level definition in, a result out; nothing is Node-only,
// nothing is touched in the DOM, and the argument never changes.

// Every cell character of §4's table.
const CHARS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

// A drift's character mapped to its facing direction (§4).
const DRIFT_DIRS = { '^': 'up', '>': 'right', v: 'down', '<': 'left' };

function isPositiveInt(n) {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1;
}

// The fields of §4: name a non-empty string, quorum/par/driftPeriod/
// spawnEvery positive integers, map a non-empty array of strings.
function hasBadFields(def) {
  if (def === null || typeof def !== 'object' || Array.isArray(def)) return true;
  if (typeof def.name !== 'string' || def.name === '') return true;
  if (!isPositiveInt(def.quorum) || !isPositiveInt(def.par)) return true;
  if (!isPositiveInt(def.driftPeriod) || !isPositiveInt(def.spawnEvery)) return true;
  if (!Array.isArray(def.map) || def.map.length === 0) return true;
  return def.map.some((row) => typeof row !== 'string');
}

// §4 rule 5: a cell on the outer edge that is not '#'.
function hasBorderOrNull(rows, width) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length && x < width; x++) {
      if ((x === 0 || x === width - 1 || y === 0 || y === rows.length - 1) && row[x] !== '#') {
        return true;
      }
    }
  }
  return false;
}

// §4 rule 10: every P, M, and X is reachable from the @ through cells
// that are not '#' (holds and the exit count as passable).
function allPatchesReachable(rows, start) {
  const height = rows.length;
  const seen = rows.map(() => new Set());
  const queue = [start];
  seen[start.y].add(start.x);
  const passable = (x, y) => y >= 0 && y < height && x >= 0 && x < rows[y].length && rows[y][x] !== '#';
  while (queue.length > 0) {
    const { x, y } = queue.pop();
    const steps = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of steps) {
      if (!passable(nx, ny) || seen[ny].has(nx)) continue;
      seen[ny].add(nx);
      queue.push({ x: nx, y: ny });
    }
  }
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      if ((row[x] === 'P' || row[x] === 'M' || row[x] === 'X') && !seen[y].has(x)) return false;
    }
  }
  return true;
}

// validateLevel(def) returns { ok, errors }: each code of §4 at most
// once, in §4's order (1 to 10), and ok true when errors is empty.
export function validateLevel(def) {
  if (hasBadFields(def)) return { ok: false, errors: ['bad_fields'] };
  const rows = def.map;
  const height = rows.length;
  const width = rows[0].length;
  const errors = [];
  if (rows.some((row) => row.length !== width)) errors.push('ragged');
  if (width > 32 || height > 24) errors.push('too_big');
  let badChar = false;
  for (const row of rows) {
    for (const ch of row) if (!CHARS.has(ch)) badChar = true;
  }
  if (badChar) errors.push('bad_char');
  if (hasBorderOrNull(rows, width)) errors.push('no_border');
  let players = 0;
  let exits = 0;
  let merges = 0;
  let spawns = 0;
  let start = null;
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '@') { players++; start = { x, y }; }
      else if (ch === 'X') exits++;
      else if (ch === 'M') merges++;
      else if (ch === 'P') spawns++;
    }
  }
  if (players !== 1) errors.push('player_count');
  if (exits !== 1) errors.push('exit_count');
  if (merges === 0) errors.push('no_merge');
  if (spawns === 0) errors.push('no_spawn');
  if (players === 1 && start !== null && !allPatchesReachable(rows, start)) {
    errors.push('unreachable');
  }
  return { ok: errors.length === 0, errors };
}

// parseLevel(def) throws when the definition is not valid and otherwise
// returns the parsed level (§4).
export function parseLevel(def) {
  const { ok, errors } = validateLevel(def);
  if (!ok) throw new Error('invalid level: ' + errors.join(', '));
  const rows = def.map;
  const width = rows[0].length;
  const height = rows.length;
  // The map with '@', 'P', and the drift characters as '.'.
  const tiles = rows.map((row) => {
    let out = '';
    for (const ch of row) out += ch === '@' || ch === 'P' || DRIFT_DIRS[ch] ? '.' : ch;
    return out;
  });
  let start = null;
  const spawns = [];
  const drifts = [];
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '@') start = { x, y };
      else if (ch === 'P') spawns.push({ x, y });
      else if (DRIFT_DIRS[ch]) drifts.push({ x, y, dir: DRIFT_DIRS[ch] });
    }
  }
  return {
    name: def.name, quorum: def.quorum, par: def.par, driftPeriod: def.driftPeriod,
    spawnEvery: def.spawnEvery, width, height, tiles, start, spawns, drifts,
  };
}
