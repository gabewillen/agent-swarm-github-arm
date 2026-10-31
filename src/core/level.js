// DESIGN.md §4: level loading and validation. Pure, no DOM, no randomness.
const CHARS = '#.@PMXH^>v<';
const DRIFT_OF = { '^': 'up', '>': 'right', v: 'down', '<': 'left' };
const TERRAIN = { P: '.', '@': '.', '^': '.', '>': '.', v: '.', '<': '.' };

const isPositiveInt = (v) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1;

function badFields(def) {
  if (def === null || typeof def !== 'object' || Array.isArray(def)) return true;
  if (typeof def.name !== 'string' || def.name.length === 0) return true;
  for (const key of ['quorum', 'par', 'driftPeriod', 'spawnEvery']) {
    if (!isPositiveInt(def[key])) return true;
  }
  if (!Array.isArray(def.map) || def.map.length === 0) return true;
  return def.map.some((row) => typeof row !== 'string');
}

// BFS from the '@' through every cell that is not '#'. Holds and the exit
// count as passable here. Returns true when all P, M, and X cells are reached.
function everythingReachable(map, start) {
  const seen = new Set();
  const queue = [[start.x, start.y]];
  seen.add(start.y * 1000 + start.x);
  let missing = 0;
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      if (map[y][x] === 'P' || map[y][x] === 'M' || map[y][x] === 'X') missing++;
    }
  }
  let targets = missing;
  const tryVisit = (x, y) => {
    if (y < 0 || y >= map.length) return;
    const row = map[y];
    if (x < 0 || x >= row.length) return;
    if (row[x] === '#') return;
    const key = y * 1000 + x;
    if (seen.has(key)) return;
    seen.add(key);
    if (row[x] === 'P' || row[x] === 'M' || row[x] === 'X') targets--;
    queue.push([x, y]);
  };
  while (queue.length > 0 && targets > 0) {
    const [x, y] = queue.pop();
    tryVisit(x + 1, y);
    tryVisit(x - 1, y);
    tryVisit(x, y + 1);
    tryVisit(x, y - 1);
  }
  return targets === 0;
}

export function validateLevel(def) {
  if (badFields(def)) return { ok: false, errors: ['bad_fields'] };
  const errors = [];
  const map = def.map;
  const height = map.length;
  const width = map.reduce((m, row) => Math.max(m, row.length), 0);
  if (map.some((row) => row.length !== map[0].length)) errors.push('ragged');
  if (width > 32 || height > 24) errors.push('too_big');
  if (map.some((row) => [...row].some((ch) => !CHARS.includes(ch)))) {
    errors.push('bad_char');
  }
  const onEdge = (row, x, y) =>
    y === 0 || y === height - 1 || x === 0 || x === row.length - 1;
  if (
    map.some((row, y) => [...row].some((ch, x) => onEdge(row, x, y) && ch !== '#'))
  ) {
    errors.push('no_border');
  }
  let players = 0;
  let exits = 0;
  let merges = 0;
  let spawns = 0;
  let start = null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const ch = map[y][x];
      if (ch === '@') {
        players++;
        start = { x, y };
      } else if (ch === 'X') exits++;
      else if (ch === 'M') merges++;
      else if (ch === 'P') spawns++;
    }
  }
  if (players !== 1) errors.push('player_count');
  if (exits !== 1) errors.push('exit_count');
  if (merges === 0) errors.push('no_merge');
  if (spawns === 0) errors.push('no_spawn');
  if (players === 1 && !everythingReachable(map, start)) errors.push('unreachable');
  return { ok: errors.length === 0, errors };
}

export function parseLevel(def) {
  const { ok, errors } = validateLevel(def);
  if (!ok) throw new Error(`invalid level: ${errors.join(',')}`);
  const tiles = def.map.map((row) =>
    [...row].map((ch) => (ch in TERRAIN ? TERRAIN[ch] : ch)).join('')
  );
  const start = { x: 0, y: 0 };
  const spawns = [];
  const drifts = [];
  for (let y = 0; y < def.map.length; y++) {
    for (let x = 0; x < def.map[y].length; x++) {
      const ch = def.map[y][x];
      if (ch === '@') start.x = x, (start.y = y);
      else if (ch === 'P') spawns.push({ x, y });
      else if (ch in DRIFT_OF) drifts.push({ x, y, dir: DRIFT_OF[ch] });
    }
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
    start: { x: start.x, y: start.y },
    spawns,
    drifts,
  };
}
