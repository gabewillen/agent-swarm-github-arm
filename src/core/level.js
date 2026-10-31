// Level loading and validation (DESIGN.md §4).
// A level definition: { name, quorum, par, driftPeriod, spawnEvery, map }.
// validateLevel(def) -> { ok, errors }; parseLevel(def) -> the parsed level.

const LEGAL = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);
const DRIFT_DIRS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };
const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function badFields(def) {
  if (def === null || typeof def !== 'object' || Array.isArray(def)) return true;
  const posInt = (v) => typeof v === 'number' && Number.isInteger(v) && v > 0;
  if (typeof def.name !== 'string' || def.name.length === 0) return true;
  if (!posInt(def.quorum) || !posInt(def.par) || !posInt(def.driftPeriod) || !posInt(def.spawnEvery)) return true;
  if (!Array.isArray(def.map) || def.map.length === 0) return true;
  for (const row of def.map) if (typeof row !== 'string') return true;
  return false;
}

// The one scan of the map: counts, bad characters, and border cells. A cell
// is one of a row's characters; a row stops at its own length, so ragged
// maps are read row by row.
function scan(rows, width, height) {
  const cells = [];
  let badChar = false;
  let noBorder = false;
  const counts = {};
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    cells.push(row.split(''));
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      counts[ch] = (counts[ch] || 0) + 1;
      if (!LEGAL.has(ch)) badChar = true;
      if ((y === 0 || y === height - 1 || x === 0 || x === width - 1) && ch !== '#') noBorder = true;
    }
  }
  return { cells, counts, badChar, noBorder };
}

// BFS from the start through every non-# cell (holds and the exit pass).
function reachCells(cells, width, start) {
  const reach = new Set([start.y * width + start.x]);
  const queue = [start];
  while (queue.length > 0) {
    const { x, y } = queue.pop();
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (ny < 0 || ny >= cells.length || nx < 0 || nx >= cells[ny].length) continue;
      if (cells[ny][nx] === '#') continue;
      const key = ny * width + nx;
      if (!reach.has(key)) { reach.add(key); queue.push({ x: nx, y: ny }); }
    }
  }
  return reach;
}

export function validateLevel(def) {
  if (badFields(def)) return { ok: false, errors: ['bad_fields'] };
  const rows = def.map;
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const { cells, counts, badChar, noBorder } = scan(rows, width, height);
  const errors = [];
  if (rows.some((r) => r.length !== width)) errors.push('ragged');
  if (width > 32 || height > 24) errors.push('too_big');
  if (badChar) errors.push('bad_char');
  if (noBorder) errors.push('no_border');
  if ((counts['@'] || 0) !== 1) errors.push('player_count');
  if ((counts['X'] || 0) !== 1) errors.push('exit_count');
  if ((counts['M'] || 0) === 0) errors.push('no_merge');
  if ((counts['P'] || 0) === 0) errors.push('no_spawn');
  if ((counts['@'] || 0) === 1) {
    let start = null;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < cells[y].length; x++) {
        if (cells[y][x] === '@') { start = { x, y }; break; }
      }
      if (start) break;
    }
    const reach = reachCells(cells, width, start);
    let unreachable = false;
    outer: for (let y = 0; y < height; y++) {
      for (let x = 0; x < cells[y].length; x++) {
        const ch = cells[y][x];
        if ((ch === 'P' || ch === 'M' || ch === 'X') && !reach.has(y * width + x)) { unreachable = true; break outer; }
      }
    }
    if (unreachable) errors.push('unreachable');
  }
  return { ok: errors.length === 0, errors };
}

export function parseLevel(def) {
  const { ok, errors } = validateLevel(def);
  if (!ok) throw new Error('invalid level: ' + errors.join(' '));
  const rows = def.map;
  const height = rows.length;
  const width = rows[0].length;
  // '@', 'P', and every drift char are actors: the tiles keep only terrain.
  const fade = (ch) => (ch === '@' || ch === 'P' || ch === '^' || ch === '>' || ch === 'v' || ch === '<' ? '.' : ch);
  const tiles = rows.map((row) => row.split('').map(fade).join(''));
  let start = null;
  const spawns = [];
  const drifts = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '@') start = { x, y };
      else if (ch === 'P') spawns.push({ x, y });
      else if (DRIFT_DIRS[ch]) drifts.push({ x, y, dir: DRIFT_DIRS[ch] });
    }
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
