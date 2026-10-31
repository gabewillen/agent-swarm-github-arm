// Quorum Run — level loading and validation (DESIGN.md §4).
// Pure module: no DOM, no timers, no randomness; neither function changes
// the definition it is given.

// The characters a map may hold, exactly the table of §4.
const VALID_CHARS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

// A drift character's starting facing.
const DRIFT_DIRS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

// A field of §4: `name` a non-empty string; quorum, par, driftPeriod,
// spawnEvery positive integers; map a non-empty array of strings.
function fieldsOk(def) {
  if (def === null || typeof def !== 'object' || Array.isArray(def)) return false;
  if (typeof def.name !== 'string' || def.name.length === 0) return false;
  if (!isPosInt(def.quorum) || !isPosInt(def.par) || !isPosInt(def.driftPeriod) || !isPosInt(def.spawnEvery)) return false;
  if (!Array.isArray(def.map) || def.map.length === 0) return false;
  return def.map.every((row) => typeof row === 'string');
}

function isPosInt(n) {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

// validateLevel(def) -> { ok, errors }: the codes of §4 in this order,
// each at most once. When `bad_fields` applies no other check runs.
export function validateLevel(def) {
  if (!fieldsOk(def)) return { ok: false, errors: ['bad_fields'] };

  const rows = def.map;
  const height = rows.length;
  const width = Math.max(...rows.map((row) => row.length));
  const errors = [];

  if (rows.some((row) => row.length !== width)) errors.push('ragged');
  if (width > 32 || height > 24) errors.push('too_big');

  for (const row of rows) {
    if ([...row].some((ch) => !VALID_CHARS.has(ch))) {
      errors.push('bad_char');
      break;
    }
  }

  // The outer edge: the whole first and last row, and the ends of the rest.
  const rowIsBorder = (row) => [...row].every((ch) => ch === '#');
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    const edge = y === 0 || y === height - 1
      ? !rowIsBorder(row)
      : row.length < 2 || row[0] !== '#' || row[row.length - 1] !== '#';
    if (edge) {
      errors.push('no_border');
      break;
    }
  }

  let players = 0;
  let exits = 0;
  let merges = 0;
  let spawns = 0;
  let player = null;
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '@') {
        players++;
        player = { x, y };
      } else if (ch === 'X') exits++;
      else if (ch === 'M') merges++;
      else if (ch === 'P') spawns++;
    }
  }
  if (players !== 1) errors.push('player_count');
  if (exits !== 1) errors.push('exit_count');
  if (merges === 0) errors.push('no_merge');
  if (spawns === 0) errors.push('no_spawn');

  // Reachability from the '@': four-way steps through cells that are not
  // walls (holds and the exit pass). Checked with exactly one player only.
  if (players === 1) {
    const seen = new Set([`${player.x},${player.y}`]);
    const queue = [[player.x, player.y]];
    while (queue.length > 0) {
      const [x, y] = queue.shift();
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (ny < 0 || ny >= height || nx < 0 || nx >= rows[ny].length) continue;
        if (rows[ny][nx] === '#' || seen.has(`${nx},${ny}`)) continue;
        seen.add(`${nx},${ny}`);
        queue.push([nx, ny]);
      }
    }
    let unreachable = false;
    for (let y = 0; y < height && !unreachable; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if ((ch === 'P' || ch === 'M' || ch === 'X') && !seen.has(`${x},${y}`)) {
          unreachable = true;
          break;
        }
      }
    }
    if (unreachable) errors.push('unreachable');
  }

  return { ok: errors.length === 0, errors };
}

// parseLevel(def) -> the parsed level of §4, or an `Error` whose message
// starts with `invalid level`. Tiles hold only terrain: '@', 'P', and the
// drift characters become '.'.
export function parseLevel(def) {
  const { ok, errors } = validateLevel(def);
  if (!ok) throw new Error(`invalid level: ${errors.join(' ')}`);

  const rows = def.map;
  const height = rows.length;
  const width = Math.max(...rows.map((row) => row.length));
  const tiles = [];
  const spawns = [];
  const drifts = [];
  let start = null;

  for (let y = 0; y < height; y++) {
    const row = rows[y];
    const out = [];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '@') {
        start = { x, y };
        out.push('.');
      } else if (ch === 'P') {
        spawns.push({ x, y });
        out.push('.');
      } else if (ch in DRIFT_DIRS) {
        drifts.push({ x, y, dir: DRIFT_DIRS[ch] });
        out.push('.');
      } else {
        out.push(ch);
      }
    }
    tiles.push(out.join(''));
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
