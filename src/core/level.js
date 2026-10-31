// Level loading and validation (DESIGN.md §4).

// Every character a map may hold. Terrain ('#', '.', 'M', 'X', 'H') survives
// parsing; '@', 'P', and the drift arrows become floor.
const CHARS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);
const DRIFT_CHARS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

function isPositiveInt(n) {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

function hasBadFields(def) {
  if (typeof def !== 'object' || def === null || Array.isArray(def)) return true;
  return (
    typeof def.name !== 'string' || def.name.length === 0
    || !isPositiveInt(def.quorum)
    || !isPositiveInt(def.par)
    || !isPositiveInt(def.driftPeriod)
    || !isPositiveInt(def.spawnEvery)
    || !Array.isArray(def.map)
    || def.map.length === 0
    || def.map.some((row) => typeof row !== 'string')
  );
}

// validateLevel(def) -> { ok, errors }: the error codes of §4, at most once
// each, in spec order. bad_fields alone and stops everything else.
export function validateLevel(def) {
  if (hasBadFields(def)) return { ok: false, errors: ['bad_fields'] };
  const errors = [];
  const rows = def.map;
  const height = rows.length;
  const width = Math.max(...rows.map((row) => row.length));

  if (rows.some((row) => row.length !== width)) errors.push('ragged');
  if (width > 32 || height > 24) errors.push('too_big');
  for (const row of rows) {
    for (const ch of row) {
      if (!CHARS.has(ch)) { errors.push('bad_char'); break; }
    }
    if (errors[errors.length - 1] === 'bad_char') break;
  }

  let badBorder = false;
  for (const ch of rows[0]) if (ch !== '#') { badBorder = true; break; }
  if (!badBorder) for (const ch of rows[height - 1]) if (ch !== '#') { badBorder = true; break; }
  if (!badBorder) {
    for (const row of rows) {
      if (row.length === 0) continue;
      if (row[0] !== '#' || row[row.length - 1] !== '#') { badBorder = true; break; }
    }
  }
  if (badBorder) errors.push('no_border');

  let playerCount = 0, exitCount = 0, mergeCount = 0, spawnCount = 0;
  let start = null;
  const targets = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '@') { playerCount++; start = { x, y }; }
      else if (ch === 'X') { exitCount++; targets.push({ x, y }); }
      else if (ch === 'M') { mergeCount++; targets.push({ x, y }); }
      else if (ch === 'P') { spawnCount++; targets.push({ x, y }); }
    }
  }

  if (playerCount !== 1) errors.push('player_count');
  if (exitCount !== 1) errors.push('exit_count');
  if (mergeCount === 0) errors.push('no_merge');
  if (spawnCount === 0) errors.push('no_spawn');

  // Reachability only makes sense with exactly one start.
  if (playerCount === 1 && start !== null) {
    const passable = (x, y) => y >= 0 && y < height && x >= 0 && x < rows[y].length && rows[y][x] !== '#';
    const seen = new Set();
    const queue = [start];
    seen.add(start.x + ',' + start.y);
    while (queue.length > 0) {
      const { x, y } = queue.pop();
      const next = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of next) {
        const key = nx + ',' + ny;
        if (!seen.has(key) && passable(nx, ny)) {
          seen.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
    if (targets.some((t) => !seen.has(t.x + ',' + t.y))) errors.push('unreachable');
  }

  return { ok: errors.length === 0, errors };
}

// parseLevel(def) -> the parsed level of §4. Throws 'invalid level ...'
// when the definition does not validate.
export function parseLevel(def) {
  const { errors } = validateLevel(def);
  if (errors.length > 0) throw new Error('invalid level: ' + errors.join(', '));

  const rows = def.map;
  const tiles = [];
  const spawns = [];
  const drifts = [];
  let start = null;
  for (let y = 0; y < rows.length; y++) {
    let tileRow = '';
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '@') { start = { x, y }; tileRow += '.'; }
      else if (ch === 'P') { spawns.push({ x, y }); tileRow += '.'; }
      else if (DRIFT_CHARS[ch]) { drifts.push({ x, y, dir: DRIFT_CHARS[ch] }); tileRow += '.'; }
      else tileRow += ch;
    }
    tiles.push(tileRow);
  }

  return {
    name: def.name,
    quorum: def.quorum,
    par: def.par,
    driftPeriod: def.driftPeriod,
    spawnEvery: def.spawnEvery,
    width: rows[0].length,
    height: rows.length,
    tiles,
    start,
    spawns,
    drifts,
  };
}
