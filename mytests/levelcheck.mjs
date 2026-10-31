// A local copy of DESIGN.md §4 (validateLevel / parseLevel) for development
// of src/data/levels.js before core/level.js lands. Not part of the suite:
// development tooling only, kept outside tests/.
const CHARS = '#.@PMXH^><v';
const DIR_OF = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

const posInt = (n) => typeof n === 'number' && Number.isInteger(n) && n > 0;

const isDef = (def) =>
  !!def && typeof def === 'object' && !Array.isArray(def) &&
  typeof def.name === 'string' && def.name.length > 0 &&
  posInt(def.quorum) && posInt(def.par) && posInt(def.driftPeriod) && posInt(def.spawnEvery) &&
  Array.isArray(def.map) && def.map.length > 0 && def.map.every((r) => typeof r === 'string');

function checks(def) {
  const map = def.map;
  const errors = [];
  const width = Math.max(...map.map((r) => r.length));
  if (map.some((r) => r.length !== map[0].length)) errors.push('ragged');
  if (width > 32 || map.length > 24) errors.push('too_big');
  if (map.some((r) => [...r].some((c) => !CHARS.includes(c)))) errors.push('bad_char');
  let border = false;
  map.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if ((y === 0 || y === map.length - 1 || x === 0 || x === row.length - 1) && row[x] !== '#') border = true;
    }
  });
  if (border) errors.push('no_border');
  let ats = 0, exits = 0, pads = 0, spawns = 0;
  for (const row of map) for (const c of row) {
    if (c === '@') ats++;
    else if (c === 'X') exits++;
    else if (c === 'M') pads++;
    else if (c === 'P') spawns++;
  }
  if (ats !== 1) errors.push('player_count');
  if (exits !== 1) errors.push('exit_count');
  if (pads < 1) errors.push('no_merge');
  if (spawns < 1) errors.push('no_spawn');
  if (ats === 1) {
    // BFS from the @ through cells that are not '#'; H and X count passable.
    let start = null;
    for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) if (map[y][x] === '@') start = { x, y };
    const seen = new Set([`${start.x},${start.y}`]);
    const q = [start];
    while (q.length) {
      const { x, y } = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        const row = map[ny];
        if (!row || row[nx] === undefined || row[nx] === '#' || seen.has(`${nx},${ny}`)) continue;
        seen.add(`${nx},${ny}`);
        q.push({ x: nx, y: ny });
      }
    }
    let unreachable = false;
    map.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if ('PMX'.includes(row[x]) && !seen.has(`${x},${y}`)) unreachable = true;
      }
    });
    if (unreachable) errors.push('unreachable');
  }
  return { ok: errors.length === 0, errors, width, maps: map };
}

export function validateLevel(def) {
  if (!isDef(def)) return { ok: false, errors: ['bad_fields'] };
  const r = checks(def);
  return { ok: r.ok, errors: r.errors };
}

export function parseLevel(def) {
  if (!isDef(def)) throw new Error(`invalid level: bad_fields`);
  const r = checks(def);
  if (!r.ok) throw new Error(`invalid level: ${r.errors.join(',')}`);
  const map = def.map;
  let start = null;
  const spawns = [], drifts = [];
  const tiles = [];
  for (let y = 0; y < map.length; y++) {
    let row = '';
    for (let x = 0; x < map[y].length; x++) {
      const c = map[y][x];
      if (c === '@') { start = { x, y }; row += '.'; }
      else if (c === 'P') { spawns.push({ x, y }); row += '.'; }
      else if (c in DIR_OF) { drifts.push({ x, y, dir: DIR_OF[c] }); row += '.'; }
      else row += c;
    }
    tiles.push(row);
  }
  return {
    name: def.name, quorum: def.quorum, par: def.par, driftPeriod: def.driftPeriod, spawnEvery: def.spawnEvery,
    width: map[0].length, height: map.length, tiles, start, spawns, drifts,
  };
}

// Reachability with holds closed (the set the player can use pre-open).
export function reach(map, closed) {
  let start = null;
  for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) if (map[y][x] === '@') start = { x, y };
  if (!start) return null;
  const seen = new Set([`${start.x},${start.y}`]);
  const q = [start];
  while (q.length) {
    const { x, y } = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      const c = (map[ny] ?? '')[nx];
      if (!c || c === '#' || (closed && c === 'H') || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      q.push({ x: nx, y: ny });
    }
  }
  return seen;
}
