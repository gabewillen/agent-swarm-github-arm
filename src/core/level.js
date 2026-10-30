// DESIGN.md §4: level loading and validation.
const CHARS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);
const DRIFT_DIR = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };
const MAX_WIDTH = 32;
const MAX_HEIGHT = 24;

function positiveInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function fieldsOk(def) {
  return (
    !!def && typeof def === 'object' && !Array.isArray(def) &&
    typeof def.name === 'string' && def.name.length > 0 &&
    positiveInt(def.quorum) && positiveInt(def.par) &&
    positiveInt(def.driftPeriod) && positiveInt(def.spawnEvery) &&
    Array.isArray(def.map) && def.map.length > 0 &&
    def.map.every((row) => typeof row === 'string')
  );
}

// validateLevel: { ok, errors }, the codes in §4's order, each at most once.
export function validateLevel(def) {
  if (!fieldsOk(def)) return { ok: false, errors: ['bad_fields'] };
  const errors = [];
  const map = def.map;
  const height = map.length;
  let width = 0;
  for (const row of map) width = Math.max(width, row.length);
  const cell = (x, y) => {
    const row = map[y];
    return row === undefined || x < 0 || x >= row.length ? undefined : row[x];
  };

  if (map.some((row) => row.length !== map[0].length)) errors.push('ragged');
  if (width > MAX_WIDTH || height > MAX_HEIGHT) errors.push('too_big');

  let badChar = false;
  let border = true;
  let players = 0;
  let exits = 0;
  let merges = 0;
  let spawns = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = cell(x, y);
      if (ch === undefined || !CHARS.has(ch)) badChar = true;
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (edge && ch !== '#') border = false;
      if (ch === '@') players++;
      else if (ch === 'X') exits++;
      else if (ch === 'M') merges++;
      else if (ch === 'P') spawns++;
    }
  }
  if (badChar) errors.push('bad_char');
  if (!border) errors.push('no_border');
  if (players !== 1) errors.push('player_count');
  if (exits !== 1) errors.push('exit_count');
  if (merges < 1) errors.push('no_merge');
  if (spawns < 1) errors.push('no_spawn');
  if (players === 1) {
    // Every P, M, and X reachable from the player; holds and the exit count
    // as passable.
    const seen = new Set();
    const start = find(def, '@');
    const queue = [start];
    seen.add(key(start.x, start.y));
    while (queue.length) {
      const c = queue.shift();
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const x = c.x + dx;
        const y = c.y + dy;
        const ch = cell(x, y);
        if (ch === undefined || ch === '#' || seen.has(key(x, y))) continue;
        seen.add(key(x, y));
        queue.push({ x, y });
      }
    }
    const unreachable = ['P', 'M', 'X'].some((want) => {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (cell(x, y) === want && !seen.has(key(x, y))) return true;
        }
      }
      return false;
    });
    if (unreachable) errors.push('unreachable');
  }
  return { ok: errors.length === 0, errors };
}

function key(x, y) {
  return x + ',' + y;
}

function find(def, ch) {
  for (let y = 0; y < def.map.length; y++) {
    const x = def.map[y].indexOf(ch);
    if (x >= 0) return { x, y };
  }
  return null;
}

// parseLevel: the parsed level, or an Error starting "invalid level".
export function parseLevel(def) {
  const { ok, errors } = validateLevel(def);
  if (!ok) throw new Error('invalid level: ' + errors.join(', '));
  const height = def.map.length;
  let width = 0;
  for (const row of def.map) width = Math.max(width, row.length);
  const tiles = [];
  const spawns = [];
  const drifts = [];
  let start = null;
  for (let y = 0; y < height; y++) {
    let line = '';
    for (let x = 0; x < width; x++) {
      const src = def.map[y];
      let ch = x < src.length ? src[x] : '#';
      if (ch === '@') {
        start = { x, y };
        ch = '.';
      } else if (ch === 'P') {
        spawns.push({ x, y });
        ch = '.';
      } else if (DRIFT_DIR[ch]) {
        drifts.push({ x, y, dir: DRIFT_DIR[ch] });
        ch = '.';
      }
      line += ch;
    }
    tiles.push(line);
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
