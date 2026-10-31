// My own scratch checks for src/data/levels.js against DESIGN.md §4/§10.
// Not an acceptance test; just local design tooling. Run: node scratch/check-levels.mjs
import { LEVELS } from '../src/data/levels.js';

const CHARS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);
const DRIFT_CHARS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

// validateLevel per §4, exactly enough to check my data has no errors.
export function validateLevel(def) {
  const isPosInt = (v) => typeof v === 'number' && Number.isInteger(v) && v > 0;
  const badFields =
    !def || typeof def !== 'object' ||
    typeof def.name !== 'string' || def.name.length === 0 ||
    !isPosInt(def.quorum) || !isPosInt(def.par) ||
    !isPosInt(def.driftPeriod) || !isPosInt(def.spawnEvery) ||
    !Array.isArray(def.map) || def.map.length === 0 ||
    !def.map.every((r) => typeof r === 'string');
  if (badFields) return { ok: false, errors: ['bad_fields'] };

  const errors = [];
  const h = def.map.length;
  const w = def.map[0].length;
  const widths = new Set(def.map.map((r) => r.length));
  if (widths.size > 1) errors.push('ragged');
  if (w > 32 || h > 24) errors.push('too_big');
  let badChar = false;
  for (const row of def.map) for (const ch of row) if (!CHARS.has(ch)) badChar = true;
  if (badChar) errors.push('bad_char');
  if (!badChar) {
    let noBorder = false;
    for (let x = 0; x < w; x++) {
      if (def.map[0][x] !== '#') noBorder = true;
      if (def.map[h - 1][x] !== '#') noBorder = true;
    }
    for (let y = 0; y < h; y++) {
      if (def.map[y][0] !== '#') noBorder = true;
      if (def.map[y][w - 1] !== '#') noBorder = true;
    }
    if (noBorder) errors.push('no_border');
  }
  const count = (ch) => def.map.reduce((n, r) => n + [...r].filter((c) => c === ch).length, 0);
  if (count('@') !== 1) errors.push('player_count');
  if (count('X') !== 1) errors.push('exit_count');
  if (count('M') < 1) errors.push('no_merge');
  if (count('P') < 1) errors.push('no_spawn');

  if (count('@') === 1) {
    let at = null;
    for (let y = 0; y < h && !at; y++)
      for (let x = 0; x < w; x++)
        if (def.map[y][x] === '@') { at = { x, y }; break; }
    const seen = new Set([`${at.x},${at.y}`]);
    const q = [at];
    while (q.length) {
      const { x, y } = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (def.map[ny][nx] === '#' || seen.has(`${nx},${ny}`)) continue;
        seen.add(`${nx},${ny}`);
        q.push({ x: nx, y: ny });
      }
    }
    const spots = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if ('PMX'.includes(def.map[y][x])) spots.push(`${x},${y}`);
    if (spots.some((s) => !seen.has(s))) errors.push('unreachable');
  }
  return { ok: errors.length === 0, errors };
}

// BFS through passable cells; pass = fn(ch).
function bfs(def, blocked) {
  const w = def.map[0].length, h = def.map.length;
  let at = null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (def.map[y][x] === '@') at = { x, y };
  const seen = new Set([`${at.x},${at.y}`]);
  const q = [at];
  while (q.length) {
    const { x, y } = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ch = def.map[ny][nx];
      if (blocked(ch) || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      q.push({ x: nx, y: ny });
    }
  }
  return seen;
}

const passPost = (ch) => ch === '#';                 // holds and exit passable
const passPre = (ch) => ch === '#' || ch === 'H';    // holds closed

let ok = true;
const fail = (msg) => { ok = false; console.log('FAIL ' + msg); };

const names = LEVELS.map((l) => l.name);
if (new Set(names).size !== names.length) fail('names not distinct');
if (LEVELS.length < 10) fail('fewer than 10 levels');

for (const l of LEVELS) {
  const v = validateLevel(l);
  if (!v.ok) fail(`${l.name}: errors ${JSON.stringify(v.errors)}`);
}

const drifters = LEVELS.filter((l) => l.map.some((r) => [...r].some((c) => DRIFT_CHARS[c])));
if (LEVELS[0].map.some((r) => [...r].some((c) => DRIFT_CHARS[c]))) fail('first level has a drift');
if (drifters.length < 6) fail(`only ${drifters.length} levels with drifts`);
const holders = LEVELS.filter((l) => l.map.some((r) => r.includes('H')));
if (holders.length < 4) fail(`only ${holders.length} levels with holds`);

for (const l of LEVELS) {
  if (l.quorum > 20) fail(`${l.name}: quorum ${l.quorum} > 20`);
  if (l.par < 30) fail(`${l.name}: par ${l.par} < 30`);

  const w = l.map[0].length, h = l.map.length;
  const post = bfs(l, passPost);
  const pre = bfs(l, passPre);
  const cells = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push({ x, y, ch: l.map[y][x] });

  for (const { x, y, ch } of cells) {
    if ('PMX'.includes(ch) && !post.has(`${x},${y}`)) fail(`${l.name}: ${ch} at ${x},${y} unreachable even with holds open`);
  }
  const preP = cells.filter(({ x, y, ch }) => ch === 'P' && pre.has(`${x},${y}`));
  const preM = cells.filter(({ x, y, ch }) => ch === 'M' && pre.has(`${x},${y}`));
  if (preM.length < 1) fail(`${l.name}: no merge pad reachable before the holds open`);
  if (preP.length < 2) fail(`${l.name}: only ${preP.length} spawn points reachable pre-open`);
  if (l.quorum > 6 * preP.length) fail(`${l.name}: quorum ${l.quorum} too big for ${preP.length} pre-open spawns`);
  if (l.quorum > l.spawnsIfAny) 0; // placeholder
  // The exit must sit behind holds or in open floor; also record basics.
  const drifts = cells.filter(({ ch }) => DRIFT_CHARS[ch]);
  // A drift start should not be walled in on all four sides.
  for (const d of drifts) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const anyOpen = dirs.some(([dx, dy]) => {
      const nx = d.x + dx, ny = d.y + dy;
      const ch = ny < 0 || ny >= h || nx < 0 || nx >= w ? '#' : l.map[ny][nx];
      return ch !== '#' && ch !== 'H';
    });
    if (!anyOpen) fail(`${l.name}: drift at ${d.x},${d.y} boxed in`);
  }
  // Long 1-wide corridors (both perpendicular neighbours are walls) that gate the
  // only pre-open route between regions are dangerous with a paced drift; flag
  // corridors longer than 4 cells with no side pocket.
  const isCorridor = (x, y) => {
    const ch = l.map[y][x];
    if (ch === '#' || ch === 'H') return false;
    const ns = ['#', 'H'].includes(l.map[y - 1]?.[x]) && ['#', 'H'].includes(l.map[y + 1]?.[x]);
    const ew = ['#', 'H'].includes(l.map[y]?.[x - 1]) && ['#', 'H'].includes(l.map[y]?.[x + 1]);
    return ns || ew;
  };
  for (const d of drifts) {
    // drift sits in a corridor: it will pace it; report length of the corridor run
    const horiz = ['#', 'H'].includes(l.map[d.y - 1]?.[d.x]) && ['#', 'H'].includes(l.map[d.y + 1]?.[d.x]);
    if (!horiz) continue;
    let len = 0;
    for (let x = d.x + 1; x < w; x++) {
      if (isCorridor(x, d.y)) len++; else break;
    }
    for (let x = d.x - 1; x >= 0; x--) {
      if (isCorridor(x, d.y)) len++; else break;
    }
    if (len + 1 > 10) console.log(`note ${l.name}: drift at ${d.x},${d.y} paces a ${len + 1}-cell corridor`);
  }
}

console.log(ok ? 'levels OK' : 'levels NOT OK');
console.log(LEVELS.map((l) => {
  const w = l.map[0].length, h = l.map.length;
  const d = l.map.reduce((n, r) => n + [...r].filter((c) => DRIFT_CHARS[c]).length, 0);
  const holds = l.map.reduce((n, r) => n + (r.match(/H/g)?.length ?? 0), 0);
  const p = [...l.map.join('')].filter((c) => c === 'P').length;
  const m = [...l.map.join('')].filter((c) => c === 'M').length;
  return `${l.name}: ${w}x${h} q=${l.quorum} par=${l.par} dp=${l.driftPeriod} se=${l.spawnEvery} drifts=${d} holds=${holds} P=${p} M=${m}`;
}).join('\n'));
if (!ok) process.exit(1);
