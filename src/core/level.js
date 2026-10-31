// §4: level loading and validation.
// A level definition is `{ name, quorum, par, driftPeriod, spawnEvery, map }`
// with `map` an array of strings over the characters of §4's table.

const CHARS = '#.@PMXH^>v<'.split('');
const DRIFT_DIRS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };
const MAX_W = 32;
const MAX_H = 24;

function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0;
}

function uniqueInOrder(errors) {
  const seen = new Set();
  const ordered = [];
  for (const e of errors) {
    if (!seen.has(e)) {
      seen.add(e);
      ordered.push(e);
    }
  }
  return ordered;
}

export function validateLevel(def) {
  if (!def || typeof def !== 'object' || Array.isArray(def)) {
    return { ok: false, errors: ['bad_fields'] };
  }
  const fieldsBad =
    typeof def.name !== 'string' || def.name === '' ||
    !isPositiveInt(def.quorum) || !isPositiveInt(def.par) ||
    !isPositiveInt(def.driftPeriod) || !isPositiveInt(def.spawnEvery) ||
    !Array.isArray(def.map) || def.map.length === 0 ||
    def.map.some((row) => typeof row !== 'string');
  if (fieldsBad) return { ok: false, errors: ['bad_fields'] };

  const map = def.map;
  const height = map.length;
  const width = Math.max(...map.map((row) => row.length));

  // a cell access that tolerates ragged rows; cells past a row's end read as
  // '\u0000', which is neither a valid character nor '#' nor '...'
  const at = (x, y) => (x < map[y].length ? map[y].charAt(x) : '\u0000');

  const found = [];
  let players = 0;
  let exits = 0;
  let merges = 0;
  let spawns = 0;
  let borderBad = false;
  let charBad = false;
  let startX = -1;
  let startY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = at(x, y);
      if (!CHARS.includes(ch)) charBad = true;
      if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
        if (ch !== '#') borderBad = true;
      }
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
    }
  }

  if (width > MAX_W || height > MAX_H) found.push('too_big');
  if (map.some((row) => row.length !== width)) found.push('ragged');
  if (charBad) found.push('bad_char');
  if (borderBad) found.push('no_border');
  if (players !== 1) found.push('player_count');
  if (exits !== 1) found.push('exit_count');
  if (merges === 0) found.push('no_merge');
  if (spawns === 0) found.push('no_spawn');

  // unreachable: a P, M, or X that can't be reached from the @ by steps
  // through cells that are not '#'; holds and the exit count as passable.
  // Checked only when there is exactly one @.
  if (players === 1) {
    const seen = new Set([startY * MAX_W + startX]);
    const q = [[startX, startY]];
    const open = (x, y) => y >= 0 && y < height && x >= 0 && x < map[y].length && map[y].charAt(x) !== '#';
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx;
        const ny = y + dy;
        const key = ny * MAX_W + nx;
        if (open(nx, ny) && !seen.has(key)) {
          seen.add(key);
          q.push([nx, ny]);
        }
      }
    }
    let bad = false;
    for (let y = 0; y < height && !bad; y++) {
      for (let x = 0; x < width && !bad; x++) {
        const ch = at(x, y);
        if ((ch === 'P' || ch === 'M' || ch === 'X') && !seen.has(y * MAX_W + x)) bad = true;
      }
    }
    if (bad) found.push('unreachable');
  }

  // codes in spec order, each at most once
  const order = ['ragged', 'too_big', 'bad_char', 'no_border', 'player_count',
    'exit_count', 'no_merge', 'no_spawn', 'unreachable'];
  const errors = order.filter((c) => found.includes(c));
  return { ok: errors.length === 0, errors };
}

export function parseLevel(def) {
  const { errors } = validateLevel(def);
  if (errors.length) {
    throw new Error(`invalid level: ${errors.join(', ')}`);
  }
  const tiles = [];
  const spawns = [];
  const drifts = [];
  let start = { x: 0, y: 0 };
  for (let y = 0; y < def.map.length; y++) {
    let row = '';
    for (let x = 0; x < def.map[y].length; x++) {
      const ch = def.map[y].charAt(x);
      if (ch === '^' || ch === '>' || ch === 'v' || ch === '<') {
        drifts.push({ x, y, dir: DRIFT_DIRS[ch] });
      } else if (ch === '@') {
        start = { x, y };
      } else if (ch === 'P') {
        spawns.push({ x, y });
      }
      row += (ch === '@' || ch === 'P' || ch === '^' || ch === '>' ||
        ch === 'v' || ch === '<') ? '.' : ch;
    }
    tiles.push(row);
  }
  return {
    name: def.name,
    quorum: def.quorum,
    par: def.par,
    driftPeriod: def.driftPeriod,
    spawnEvery: def.spawnEvery,
    width: def.map[0].length,
    height: def.map.length,
    tiles,
    start,
    spawns,
    drifts,
  };
}
