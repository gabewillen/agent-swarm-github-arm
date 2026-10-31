// Dev-only checks for src/data/levels.js (not an acceptance test; the
// acceptance suite is tests/). Run: node dev/agent47-check-levels.mjs
//
// Checks every shipped level for:
// - rectangular rows, full '#' border, only known characters,
// - exactly one '@', one 'X', at least one 'M' and one 'P',
// - every floor cell reachable from '@' (design hygiene),
// - §4's reachability: every P, M, X reachable with holds exit passable,
// - winnability: every P and M reachable when hold doors are closed,
// - the 'X' cell is reachable only through at least one hold door
//   (when the level has holds, that is what they should gate),
// - every hold door stands next to a cell reachable with doors closed,
// - positive driftPeriod / spawnEvery, par >= 30, quorum <= 20,
// - the shape rules of §10: >= 10 levels, first with no drift, >= 6 with
//   drifts, >= 4 with holds, distinct names.

import { LEVELS } from '../src/data/levels.js';

let failures = 0;

function fail(msg) {
  failures += 1;
  console.log(`FAIL  ${msg}`);
}

function check(name, ok, msg) {
  if (!ok) fail(`${name}: ${msg}`);
}

const CHARS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);

function analyze(def, i) {
  const name = `L${i + 1} "${def.name}"`;
  const map = def.map;
  const w = map[0].length;

  check(name, def.map.length >= 3 && w >= 3, `map is ${w}x${def.map.length}`);
  for (let y = 0; y < map.length; y++) {
    check(name, map[y].length === w, `row ${y} is ${map[y].length} wide, not ${w}`);
  }
  if (map.some((r) => r.length !== w)) return null;

  let count = {};
  const cells = [];
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < w; x++) {
      const ch = map[y][x];
      check(name, CHARS.has(ch), `bad char ${JSON.stringify(ch)} at (${x}, ${y})`);
      count[ch] = (count[ch] || 0) + 1;
      if (ch !== '#') cells.push({ x, y, ch });
    }
  }
  check(name, count['@'] === 1, `start[s] '@' = ${count['@'] ?? 0}`);
  check(name, count['X'] === 1, `exit[s] 'X' = ${count['X'] ?? 0}`);
  check(name, (count['M'] ?? 0) >= 1, 'no M');
  check(name, (count['P'] ?? 0) >= 1, 'no P');
  for (let x = 0; x < w; x++) {
    check(name, map[0][x] === '#', `edge (${x}, 0) is not '#'`);
    check(name, map[map.length - 1][x] === '#', `edge (${x}, bottom) is not '#'`);
  }
  for (let y = 0; y < map.length; y++) {
    check(name, map[y][0] === '#', `edge (0, ${y}) is not '#'`);
    check(name, map[y][w - 1] === '#', `edge (right, ${y}) is not '#'`);
  }

  const at = cells.find((c) => c.ch === '@');
  const marks = cells.filter((c) => 'PMX'.includes(c.ch));
  const holds = cells.filter((c) => c.ch === 'H');

  // All floor cells reachable from @.
  const seenAny = bfs(at, () => true, map, w);
  for (const c of cells) {
    check(name, seenAny.has(`${c.x},${c.y}`), `cell (${c.x}, ${c.y}) '${c.ch}' is unreachable`);
  }

  // §4 reachability: P, M, X reachable treating holds as passable.
  const seenOpen = bfs(at, () => true, map, w);
  for (const c of marks) {
    check(name, seenOpen.has(`${c.x},${c.y}`), `${c.ch} at (${c.x}, ${c.y}) unreachable per §4`);
  }

  // Winnability: P and M reachable with hold doors closed.
  const open = (c) => c.ch !== '#';
  const closed = (c) => c.ch !== '#' && c.ch !== 'H';
  const seenClosed = bfs(at, closed, map, w);
  for (const c of marks) {
    if (c.ch === 'X') continue;
    check(name, seenClosed.has(`${c.x},${c.y}`), `${c.ch} at (${c.x}, ${c.y}) sits behind a closed hold door`);
  }

  // X reachable only through a hold door, when the level has any.
  if (holds.length > 0) {
    const x = cells.find((c) => c.ch === 'X');
    check(name, !seenClosed.has(`${x.x},${x.y}`), 'X reachable with the hold doors closed');
    for (const h of holds) {
      const near = [[h.x - 1, h.y], [h.x + 1, h.y], [h.x, h.y - 1], [h.x, h.y + 1]]
        .some(([nx, ny]) => nx >= 0 && ny >= 0 && nx < w && ny < map.length && seenClosed.has(`${nx},${ny}`));
      check(name, near || seenClosed.has(`${h.x},${h.y}`), `hold at (${h.x}, ${h.y}) is not next to an open-side cell`);
    }
  }

  check(name, Number.isInteger(def.quorum) && def.quorum >= 1 && def.quorum <= 20, `quorum ${def.quorum}`);
  check(name, Number.isInteger(def.par) && def.par >= 30, `par ${def.par}`);
  check(name, Number.isInteger(def.driftPeriod) && def.driftPeriod >= 1, `driftPeriod ${def.driftPeriod}`);
  check(name, Number.isInteger(def.spawnEvery) && def.spawnEvery >= 1, `spawnEvery ${def.spawnEvery}`);

  console.log(
    `${name}  ${w}x${map.length}  q=${def.quorum} par=${def.par} drifts=${(count['^'] || 0) + (count['>'] || 0) + (count['v'] || 0) + (count['<'] || 0)}` +
    ` holds=${holds.length} P=${count['P']} spawnEvery=${def.spawnEvery}`,
  );
  return def;
}

function bfs(start, passable, map, w) {
  const seen = new Set([`${start.x},${start.y}`]);
  const q = [start];
  while (q.length) {
    const { x, y } = q.shift();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || ny >= map.length || nx >= w) continue;
      const ch = map[ny][nx];
      if (ch === '#' || !passable({ ch })) continue;
      const key = `${nx},${ny}`;
      if (!seen.has(key)) { seen.add(key); q.push({ x: nx, y: ny }); }
    }
  }
  return seen;
}

const defs = LEVELS.map(analyze).filter(Boolean);

// §10 shape rules over the whole set.
check('LEVELS', defs.length >= 10, `only ${defs.length} levels`);
const names = defs.map((d) => d.name);
check('LEVELS', new Set(names).size === names.length, 'names are not distinct');
const driftCount = (d) => d.map.join('').split('').filter((c) => '^>v<'.includes(c)).length;
check('LEVELS', driftCount(defs[0]) === 0, 'first level has a drift');
check('LEVELS', defs.filter((d) => driftCount(d) > 0).length >= 6, 'fewer than 6 levels with drifts');
check('LEVELS', defs.filter((d) => d.map.some((r) => r.includes('H'))).length >= 4, 'fewer than 4 levels with holds');
check('LEVELS', defs.every((d) => typeof d.name === 'string' && d.name !== ''), 'empty name');

console.log(failures === 0 ? `OK    all checks passed (${defs.length} levels)` : `${failures} failure(s)`);
process.exitCode = failures === 0 ? 0 : 1;
