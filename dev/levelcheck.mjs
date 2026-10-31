// agent-43's local checker for src/data/levels.js, kept outside tests/.
// It re-implements DESIGN.md §4's validateLevel/parseLevel exactly, then
// checks the §10 list rules plus playability heuristics.
import { readFileSync } from 'node:fs';

const DRIFT = { '^': 'up', '>': 'right', v: 'down', '<': 'left' };

export function validateLevel(def) {
  const errors = [];
  const badFields =
    typeof def !== 'object' || def === null ||
    typeof def.name !== 'string' || def.name.length === 0 ||
    !Number.isInteger(def.quorum) || def.quorum < 1 ||
    !Number.isInteger(def.par) || def.par < 1 ||
    !Number.isInteger(def.driftPeriod) || def.driftPeriod < 1 ||
    !Number.isInteger(def.spawnEvery) || def.spawnEvery < 1 ||
    !Array.isArray(def.map) || def.map.length === 0 ||
    !def.map.every((r) => typeof r === 'string');
  if (badFields) return { ok: false, errors: ['bad_fields'] };
  const width = Math.max(...def.map.map((r) => r.length));
  const height = def.map.length;
  const at = (x, y) => (y < 0 || y >= height || x < 0 || x >= def.map[y].length ? undefined : def.map[y][x]);
  if (def.map.some((r) => r.length !== width)) errors.push('ragged');
  if (width > 32 || height > 24) errors.push('too_big');
  let badChar = false;
  const chars = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);
  for (const row of def.map) for (const c of row) if (!chars.has(c)) badChar = true;
  if (badChar) errors.push('bad_char');
  let border = false;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if ((y === 0 || y === height - 1 || x === 0 || x === width - 1) && at(x, y) !== '#') border = true;
  if (border) errors.push('no_border');
  let players = 0, exits = 0, merges = 0, spawns = 0;
  for (const row of def.map) {
    for (const c of row) {
      if (c === '@') players++;
      if (c === 'X') exits++;
      if (c === 'M') merges++;
      if (c === 'P') spawns++;
    }
  }
  if (players !== 1) errors.push('player_count');
  if (exits !== 1) errors.push('exit_count');
  if (merges === 0) errors.push('no_merge');
  if (spawns === 0) errors.push('no_spawn');
  if (players === 1) {
    let start = null;
    for (let y = 0; y < height && !start; y++) {
      const x = def.map[y].indexOf('@');
      if (x >= 0) start = { x, y };
    }
    const seen = new Set([`${start.x},${start.y}`]);
    const queue = [start];
    while (queue.length) {
      const { x, y } = queue.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        const c = at(nx, ny);
        if (c === undefined || c === '#' || seen.has(`${nx},${ny}`)) continue;
        seen.add(`${nx},${ny}`);
        queue.push({ x: nx, y: ny });
      }
    }
    let unreachable = false;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const c = at(x, y);
        if ((c === 'P' || c === 'M' || c === 'X') && !seen.has(`${x},${y}`)) unreachable = true;
      }
    if (unreachable) errors.push('unreachable');
  }
  return { ok: errors.length === 0, errors };
}

export function parseLevel(def) {
  const v = validateLevel(def);
  if (!v.ok) throw new Error(`invalid level: ${v.errors.join(', ')}`);
  const height = def.map.length;
  const width = Math.max(...def.map.map((r) => r.length));
  const tiles = def.map.map((r) => r.replaceAll('[@P^>v<]', () => '.'));
  const tiles2 = def.map.map((row) =>
    [...row].map((c) => (c === '@' || c === 'P' || c in DRIFT ? '.' : c)).join(''));
  let start = null;
  const spawns = [];
  const drifts = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < def.map[y].length; x++) {
      const c = def.map[y][x];
      if (c === '@') start = { x, y };
      if (c === 'P') spawns.push({ x, y });
      if (c in DRIFT) drifts.push({ x, y, dir: DRIFT[c] });
    }
  return {
    name: def.name, quorum: def.quorum, par: def.par, driftPeriod: def.driftPeriod,
    spawnEvery: def.spawnEvery, width, height, tiles: tiles2, start, spawns, drifts,
  };
}

// ---- design checks ----

function hReachable(def, csr) {
  // cells reachable from '@' treating H as wall too
  const height = def.map.length;
  const width = Math.max(...def.map.map((r) => r.length));
  const at = (x, y) => (y < 0 || y >= height || x < 0 || x >= def.map[y].length ? undefined : def.map[y][x]);
  let start = null;
  for (let y = 0; y < height && !start; y++) {
    const x = def.map[y].indexOf('@');
    if (x >= 0) start = { x, y };
  }
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length) {
    const { x, y } = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      const c = at(nx, ny);
      if (c === undefined || c === '#' || c === 'H' || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

export function checkLevels(levels) {
  const problems = [];
  const names = levels.map((l) => l.name);
  if (new Set(names).size !== names.length) problems.push('duplicate names');
  if (levels.length < 10) problems.push(`only ${levels.length} levels`);
  let withDrifts = 0, withHolds = 0;
  levels.forEach((def, i) => {
    const v = validateLevel(def);
    if (!v.ok) { problems.push(`[${i}] ${def.name}: invalid ${v.errors.join(',')}`); return; }
    if (def.quorum > 20) problems.push(`[${i}] ${def.name}: quorum ${def.quorum} > 20`);
    if (def.par < 30) problems.push(`[${i}] ${def.name}: par ${def.par} < 30`);
    const p = parseLevel(def);
    if (i === 0 && p.drifts.length !== 0) problems.push('first level has drifts');
    if (p.drifts.length > 0) withDrifts++;
    if (def.map.some((r) => r.includes('H'))) withHolds++;
    if (p.spawns.length === 0) problems.push(`[${i}] ${def.name}: no spawn`);

    // every merge pad reachable without crossing a hold door (no soft lock)
    const seen = hReachable(def);
    let padsOutside = 0;
    def.map.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === 'M' && seen.has(`${x},${y}`)) padsOutside++;
      }
    });
    if (padsOutside === 0)
      problems.push(`[${i}] ${def.name}: every merge pad is only reachable through holds`);
    // spawns outside holds >= quorum for hold levels (design intent)
    let outside = 0;
    def.map.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === 'P' && seen.has(`${x},${y}`)) outside++;
      }
    });
    if (def.map.some((r) => r.includes('H')) && outside < def.quorum)
      problems.push(`[${i}] ${def.name}: only ${outside} reachable spawns < quorum ${def.quorum}`);
    for (const d of p.drifts) {
      const dist = Math.abs(d.x - p.start.x) + Math.abs(d.y - p.start.y);
      if (dist < 3) problems.push(`[${i}] ${def.name}: drift at ${d.x},${d.y} is ${dist} from start`);
    }
    if (p.spawns.length < def.quorum) problems.push(`[${i}] ${def.name}: spawns ${p.spawns.length} < quorum ${def.quorum} (refills needed)`);
  });
  if (withDrifts < 6) problems.push(`only ${withDrifts} levels with drifts`);
  if (withHolds < 4) problems.push(`only ${withHolds} levels with holds`);
  return problems;
}

if (process.argv[1] && process.argv[1].endsWith('levelcheck.mjs')) {
  const src = readFileSync(new URL('../src/data/levels.js', import.meta.url), 'utf8');
  const mod = await import(new URL('../src/data/levels.js', import.meta.url).href);
  const levels = mod.LEVELS;
  const problems = checkLevels(levels);
  levels.forEach((def, i) => {
    const p = parseLevel(def);
    console.log(
      `${String(i + 1).padStart(2)}. ${def.name.padEnd(14)} quorum ${String(def.quorum).padStart(2)}` +
      `  par ${String(def.par).padStart(3)}  period ${def.driftPeriod}  spawn ${String(def.spawnEvery).padStart(2)}` +
      `  ${p.width}x${p.height}  spawns ${p.spawns.length}  drifts ${p.drifts.length}` +
      `  holds ${def.map.reduce((n, r) => n + [...r].filter((c) => c === 'H').length, 0)}`
    );
  });
  console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join('\n- ')}` : '\nall design checks pass');
  process.exit(problems.length ? 1 : 0);
}
