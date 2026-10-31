// §4: level definitions, validation, and parsing.

// The characters a map may hold (§4's table): terrain, markers, and drifts.
const ALL_CHARS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);
const DRIFT_DIR = { '^': 'up', '>': 'right', v: 'down', '<': 'left' };

// Field checks: the first error. When it is present no other check runs.
const positiveInt = (v) => typeof v === 'number' && Number.isInteger(v) && v > 0;
const goodMap = (m) =>
  Array.isArray(m) && m.length > 0 && m.every((row) => typeof row === 'string');
const goodFields = (def) =>
  def !== null && typeof def === 'object' &&
  typeof def.name === 'string' && def.name.length > 0 &&
  positiveInt(def.quorum) && positiveInt(def.par) &&
  positiveInt(def.driftPeriod) && positiveInt(def.spawnEvery) &&
  goodMap(def.map);

// validateLevel(def) returns { ok, errors }; errors follow spec order 1..10,
// each at most once.
export function validateLevel(def) {
  const errors = [];
  if (!goodFields(def)) return { ok: false, errors: ['bad_fields'] };
  const map = def.map;
  const height = map.length;
  const width = Math.max(...map.map((r) => r.length));

  if (!map.every((r) => r.length === width)) errors.push('ragged');
  if (width > 32 || height > 24) errors.push('too_big');

  let badChar = false;
  let noBorder = false;
  let players = 0;
  let exits = 0;
  let merges = 0;
  let spawns = 0;
  let startX = -1;
  let startY = -1;
  const passable = [];
  for (let y = 0; y < height; y++) {
    const row = map[y];
    const edgeRow = y === 0 || y === height - 1;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (!ALL_CHARS.has(ch)) badChar = true;
      if (!noBorder && (edgeRow || x === 0 || x === row.length - 1) && ch !== '#') noBorder = true;
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
      if (ch !== '#') passable.push({ x, y });
    }
  }
  if (badChar) errors.push('bad_char');
  if (noBorder) errors.push('no_border');
  if (players !== 1) errors.push('player_count');
  if (exits !== 1) errors.push('exit_count');
  if (merges < 1) errors.push('no_merge');
  if (spawns < 1) errors.push('no_spawn');

  if (players === 1) {
    // Reachability: every P, M, and X is reachable from the @ by adjacent
    // steps through cells that are not '#'; holds and the exit count as
    // passable here. Ragged rows keep to their own length.
    const seen = new Set([startY + ':' + startX]);
    const queue = [{ x: startX, y: startY }];
    while (queue.length) {
      const { x, y } = queue.pop();
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        const row = map[ny];
        if (nx < 0 || nx >= row.length) continue;
        const ch = row[nx];
        const key = ny + ':' + nx;
        if (seen.has(key)) continue;
        if (ch === '#') continue;
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
    let unreachable = false;
    for (const { x, y } of passable) {
      const ch = map[y][x];
      if ((ch === 'P' || ch === 'M' || ch === 'X') && !seen.has(y + ':' + x)) unreachable = true;
    }
    if (unreachable) errors.push('unreachable');
  }

  return { ok: errors.length === 0, errors };
}

// parseLevel(def) throws when the definition is not valid, and otherwise
// returns the parsed level: terrain only, plus start, spawns, and drifts.
export function parseLevel(def) {
  const { ok } = validateLevel(def);
  if (!ok) throw new Error('invalid level: ' + JSON.stringify(def));
  const map = def.map;
  const start = { x: 0, y: 0 };
  const spawns = [];
  const drifts = [];
  const tiles = map.map((row, y) => {
    let out = '';
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (DRIFT_DIR[ch]) {
        drifts.push({ x, y, dir: DRIFT_DIR[ch] });
        out += '.';
      } else if (ch === '@') {
        start.x = x;
        start.y = y;
        out += '.';
      } else if (ch === 'P') {
        spawns.push({ x, y });
        out += '.';
      } else {
        out += ch;
      }
    }
    return out;
  });
  return {
    name: def.name,
    quorum: def.quorum,
    par: def.par,
    driftPeriod: def.driftPeriod,
    spawnEvery: def.spawnEvery,
    width: tiles[0].length,
    height: tiles.length,
    tiles,
    start: { x: start.x, y: start.y },
    spawns,
    drifts,
  };
}
