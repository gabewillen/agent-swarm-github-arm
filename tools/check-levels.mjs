// agent-43's own checker for src/data/levels.js: re-implements the §4
// checks that tests/16 and tests/02 will exercise, plusParseException
// reports, BFS reachability, and a drift simulation near the player's
// start. Not part of the acceptance suite.
import { LEVELS } from '../src/data/levels.js';

const BAD = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);
const DRIFT = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };
const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const CW = ['up', 'right', 'down', 'left'];

function validate(def) {
  const errors = [];
  const bad =
    typeof def.name !== 'string' || def.name.length === 0 ||
    !Number.isInteger(def.quorum) || def.quorum < 1 ||
    !Number.isInteger(def.par) || def.par < 1 ||
    !Number.isInteger(def.driftPeriod) || def.driftPeriod < 1 ||
    !Number.isInteger(def.spawnEvery) || def.spawnEvery < 1 ||
    !Array.isArray(def.map) || def.map.length === 0 ||
    !def.map.every((r) => typeof r === 'string');
  if (bad) return { ok: false, errors: ['bad_fields'] };
  const rows = def.map;
  const width = rows[0].length;
  if (rows.some((r) => r.length !== width)) errors.push('ragged');
  if (rows.length > 24 || width > 32) errors.push('too_big');
  for (const row of rows) for (const ch of row) if (!BAD.has(ch)) errors.push('bad_char');
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < width; x++) {
      if ((y === 0 || y === rows.length - 1 || x === 0 || x === width - 1) && rows[y][x] !== '#')
        errors.push('no_border');
    }
  }
  let at = null, exit = null, merges = 0, spawns = 0;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x];
      if (ch === '@') { if (at) at = 'two'; else at = { x, y }; }
      if (ch === 'X') { if (exit) exit = 'two'; else exit = { x, y }; }
      if (ch === 'M') merges++;
      if (ch === 'P') spawns++;
    }
  }
  if (at !== null && !at) at = null;
  if (at === null || at === 'two') errors.push('player_count');
  if (exit === null || exit === 'two') errors.push('exit_count');
  if (merges < 1) errors.push('no_merge');
  if (spawns < 1) errors.push('no_spawn');
  if (at && typeof at === 'object') {
    const seen = new Set([`${at.x},${at.y}`]);
    const front = [at];
    const passable = (x, y) => y >= 0 && y < rows.length && x >= 0 && x < width && rows[y][x] !== '#';
    while (front.length) {
      const { x, y } = front.pop();
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = x + dx, ny = y + dy;
        const key = `${nx},${ny}`;
        if (passable(nx, ny) && !seen.has(key)) { seen.add(key); front.push({ x: nx, y: ny }); }
      }
    }
    outer: for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < width; x++) {
        if ('PMX'.includes(rows[y][x]) && !seen.has(`${x},${y}`)) { errors.push('unreachable'); break outer; }
      }
    }
  }
  const dup = (a) => new Set(a).size !== a.length;
  errors.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return { ok: errors.length === 0, errors, _dup: null };
}

const ORDER = ['bad_fields', 'ragged', 'too_big', 'bad_char', 'no_border', 'player_count',
  'exit_count', 'no_merge', 'no_spawn', 'unreachable'];

// §6 step 10-11: drift movement on its own grid, conflicts ignored
// (none near the start in the first ticks), no player except start pos.
function tick(grid, drifts) {
  const passable = (x, y) => {
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return false;
    const ch = grid[y][x];
    return ch !== '#' && ch !== 'H' && ch !== 'X';
  };
  for (const d of drifts) {
    let moved = null;
    for (const dir of rotate(d.dir)) {
      const [dx, dy] = DIRS[dir];
      if (passable(d.x + dx, d.y + dy)) { moved = dir; break; }
    }
    if (moved) {
      d.dir = moved;
      const [dx, dy] = DIRS[moved];
      d.x += dx; d.y += dy;
    }
  }
  return drifts;
}
function rotate(d) { const i = CW.indexOf(d); return CW[i % 4] == null ? CW : [CW[i % 4], CW[(i + 1) % 4], CW[(i + 2) % 4], CW[(i + 3) % 4]]; }

function parse(def) {
  const start = null, out = { start: null, spawns: [], drifts: [], holds: 0 };
  for (let y = 0; y < def.map.length; y++) {
    for (let x = 0; x < def.map[y].length; x++) {
      const ch = def.map[y][x];
      if (ch === '@') out.start = { x, y };
      else if (ch === 'P') out.spawns.push({ x, y });
      else if (DRIFT[ch]) out.drifts.push({ x, y, dir: DRIFT[ch] });
      else if (ch === 'H') out.holds++;
    }
  }
  return out;
}

let failure = false;
const names = LEVELS.map((l) => l.name);
if (new Set(names).size !== names.length) { console.error('FAIL: duplicate names'); failure = true; }
if (LEVELS.length < 10) { console.error('FAIL: LEVELS.length < 10'); failure = true; }

LEVELS.forEach((def, i) => {
  const v = validate(def);
  const p = parse(def);
  if (!v.ok) {
    console.error(`FAIL ${i + 1} ${def.name}: ${v.errors.join(',')}`);
    failure = true;
    return;
  }
  // drift proximity + first-tick hazard at the (static) start
  let minMan = Infinity;
  for (const d of p.drifts) minMan = Math.min(minMan, Math.abs(d.x - p.start.x) + Math.abs(d.y - p.start.y));
  const grid = def.map;
  const ds = p.drifts.map((d) => ({ ...d }));
  let firstHit = Infinity;
  for (let t = 0; t < 30; t++) {
    tick(grid, ds);
    const tHit = ds.some((d) => d.x === p.start.x && d.y === p.start.y);
    if (tHit && firstHit === Infinity) firstHit = t + 1;
  }
  console.log(
    `ok  ${String(i + 1).padStart(2)} ${def.name.padEnd(15)} ${def.map[0].length}x${def.map.length}` +
    ` q=${String(def.quorum).padStart(2)} par=${String(def.par).padStart(3)} se=${def.spawnEvery}` +
    ` P=${p.spawns.length} M=${def.map.join('').split('M').length - 1} H=${p.holds}` +
    ` drifts=${p.drifts.length} minMan=${minMan} startHit@t${firstHit === Infinity ? '-' : firstHit}`,
  );
  if (firstHit <= 6) { console.error(`  ^ drift hits start cell within ${firstHit} ticks`); failure = true; }
  if (minMan < 3) { console.error(`  ^ drift within 3 manhattan of start`); failure = true; }
});

console.log(failure ? 'LEVELS CHECK: FAILED' : 'LEVELS CHECK: ok');
process.exitCode = failure ? 1 : 0;
