#!/usr/bin/env node
// Developer checker for src/data/levels.js — not part of the test suite.
// Mirrors DESIGN.md §4 validation, then adds playability checks:
//   - every P/M/X reachable from '@' (holds and exit passable, §4 rule 10);
//   - at least one patch spawn point reachable with holds closed (§5 starts
//     a patch on every spawn point; §6 step 13 respawns one per spawnEvery
//     at any free spot, so quorum can be farmed pre-open from even one
//     live spot; each merged patch moves `merges` past quorum cumulatively);
//   - drift camps: a spawn point should not sit on a cell the drifts
//     occupy most of the time (simulated per §6 steps 10 and 11, with
//     conflicts aged per step 5).
// Usage: node dev/check-levels.mjs [module] [--debug]
//   module  path to the levels module (default: ../src/data/levels.js)
import process from 'node:process';

const argv = process.argv.slice(2).filter((a) => a !== '--debug');
const debug = process.argv.length !== argv.length;
const modulePath = argv[0] ?? '../src/data/levels.js';
const { LEVELS } = await import(modulePath);
// The conflict lifetime from §2, when the constants module is present; the
// checker also runs on branches of past mains that may not have it.
const CONFLICT_TICKS = await import('../src/core/constants.js')
  .then((m) => m.CONFLICT_TICKS)
  .catch(() => 10);

const CHARS = '#.@PMXH^><v';
const CW = ['up', 'right', 'down', 'left'];
const DXY = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

// ---- §4 validation: the ten codes, in their order, each at most once ----
function validateLevel(def) {
  const isPosInt = (v) => typeof v === 'number' && Number.isInteger(v) && v > 0;
  const badFields =
    typeof def !== 'object' || def === null ||
    !(typeof def.name === 'string' && def.name.length > 0) ||
    !isPosInt(def.quorum) || !isPosInt(def.par) ||
    !isPosInt(def.driftPeriod) || !isPosInt(def.spawnEvery) ||
    !Array.isArray(def.map) || def.map.length === 0 ||
    !def.map.every((r) => typeof r === 'string');
  if (badFields) return { ok: false, errors: ['bad_fields'] };

  const errors = [];
  const rows = def.map;
  const width = rows[0].length;
  const height = rows.length;

  if (rows.some((r) => r.length !== width)) errors.push('ragged');
  if (width > 32 || height > 24) errors.push('too_big');
  let badChar = false;
  outer: for (const r of rows) {
    for (const c of r) if (!CHARS.includes(c)) { badChar = true; break outer; }
  }
  if (badChar) errors.push('bad_char');
  let noBorder = false;
  rowLoop: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = y === 0 || y === height - 1 || x === 0 || x === width - 1;
      if (edge && rows[y][x] !== '#') { noBorder = true; break rowLoop; }
    }
  }
  if (noBorder) errors.push('no_border');

  const count = (ch) => rows.reduce((n, r) => n + [...r].filter((c) => c === ch).length, 0);
  if (count('@') !== 1) errors.push('player_count');
  if (count('X') !== 1) errors.push('exit_count');
  if (count('M') === 0) errors.push('no_merge');
  if (count('P') === 0) errors.push('no_spawn');

  if (count('@') === 1) {
    const at = find(rows, '@');
    const seen = new Set([`${at.x},${at.y}`]);
    const queue = [[at.x, at.y]];
    while (queue.length) {
      const [x, y] = queue.pop();
      for (const [dx, dy] of Object.values(DXY)) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (rows[ny][nx] === '#') continue;
        const k = `${nx},${ny}`;
        if (!seen.has(k)) { seen.add(k); queue.push([nx, ny]); }
      }
    }
    outer: for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if ('PMX'.includes(rows[y][x]) && !seen.has(`${x},${y}`)) {
          errors.push('unreachable'); break outer;
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

function find(rows, ch) {
  for (let y = 0; y < rows.length; y++) {
    const x = rows[y].indexOf(ch);
    if (x !== -1) return { x, y };
  }
  return null;
}

function findAll(rows, ch) {
  const out = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === ch) out.push({ x, y });
  });
  return out;
}

// BFS from (sx, sy) over cells where `blocked(cell)` is false; key -> distance.
function bfs(rows, sx, sy, blocked) {
  const dist = new Map([[`${sx},${sy}`, 0]]);
  const queue = [[sx, sy, 0]];
  while (queue.length) {
    const [x, y, d] = queue.shift();
    for (const [dx, dy] of Object.values(DXY)) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= rows[0].length || ny >= rows.length) continue;
      if (blocked(rows[ny][nx])) continue;
      const k = `${nx},${ny}`;
      if (dist.has(k)) continue;
      dist.set(k, d + 1);
      queue.push([nx, ny, d + 1]);
    }
  }
  return dist;
}

// ---- drift simulation per §6 steps 10, 11 and 5 (occupancy study) ----
function driftOccupancy(rows, def, ticks) {
  const width = rows[0].length, height = rows.length;
  const drifts = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const dir = { '^': 'up', '>': 'right', v: 'down', '<': 'left' }[row[x]];
      if (dir) drifts.push({ x, y, dir });
    }
  });
  const conflicts = [];
  const occupied = new Map(); // "x,y" -> ticks a drift stands there
  const passable = (x, y) =>
    x >= 0 && y >= 0 && x < width && y < height &&
    !'#HX'.includes(rows[y][x]) &&
    !conflicts.some((c) => c.x === x && c.y === y);
  for (let t = 1; t <= ticks; t++) {
    for (let i = conflicts.length - 1; i >= 0; i--) {
      conflicts[i].ttl -= 1;
      if (conflicts[i].ttl <= 0) conflicts.splice(i, 1);
    }
    if (t % def.driftPeriod === 0) {
      for (const d of drifts) {
        const start = CW.indexOf(d.dir);
        for (let i = 0; i < 4; i++) {
          const dir = CW[(start + i) % 4];
          const [dx, dy] = DXY[dir];
          if (passable(d.x + dx, d.y + dy)) { d.dir = dir; d.x += dx; d.y += dy; break; }
        }
      }
      // §6 step 11, reading order per cell
      const byCell = new Map();
      for (const d of drifts) {
        const k = `${d.x},${d.y}`;
        if (!byCell.has(k)) byCell.set(k, []);
        byCell.get(k).push(d);
      }
      for (const [k, ds] of byCell) {
        if (ds.length < 2) continue;
        for (const d of ds) {
          d.dir = { up: 'down', down: 'up', left: 'right', right: 'left' }[d.dir];
        }
        if (!conflicts.some((c) => `${c.x},${c.y}` === k)) {
          conflicts.push({ x: ds[0].x, y: ds[0].y, ttl: CONFLICT_TICKS });
        }
      }
    }
    const conflictCells = new Set(conflicts.map((c) => `${c.x},${c.y}`));
    for (const d of drifts) {
      const k = `${d.x},${d.y}`;
      if (!conflictCells.has(k)) occupied.set(k, (occupied.get(k) ?? 0) + 1);
    }
  }
  return { occupied, ticks };
}

// ---- the run ----
let problems = 0;
const printMap = (def) => {
  console.log('     ' + Array.from({ length: def.map[0].length }, (_, i) => String(i % 10)).join(''));
  def.map.forEach((row, y) => console.log(String(y).padStart(3) + '  ' + row));
};

for (const def of LEVELS) {
  const v = validateLevel(def);
  const tag = `${def.name} (${def.map[0].length}x${def.map.length})`;
  if (!v.ok) {
    console.log(`${tag}: INVALID ${v.errors.join(', ')}`);
    printMap(def);
    problems++;
    continue;
  }
  const rows = def.map;
  const at = find(rows, '@');
  const spawns = findAll(rows, 'P');
  const merges = findAll(rows, 'M');
  const holds = findAll(rows, 'H');
  const drifts = [...'^v><'].flatMap((c) => findAll(rows, c));

  // pre-open: holds and exit both closed
  const preOpen = bfs(rows, at.x, at.y, (c) => c === '#' || c === 'H' || c === 'X');
  const preSpawns = spawns.filter((p) => preOpen.has(`${p.x},${p.y}`));
  const preMerge = merges.filter((m) => preOpen.has(`${m.x},${m.y}`));
  // open: holds passable (this is also §4's reachable check)
  const open = bfs(rows, at.x, at.y, (c) => c === '#');
  const ex = find(rows, 'X');
  const distExit = open.get(`${ex.x},${ex.y}`);
  const distMerge = Math.min(...merges
    .map((m) => preOpen.get(`${m.x},${m.y}`))
    .filter((d) => d !== undefined));
  const farSpawn = Math.max(...spawns.map((p) => open.get(`${p.x},${p.y}`)));

  const notes = [];
  const marks = [];
  if (preSpawns.length < 1) {
    marks.push('no spawn point reachable before a door opens',
      '    (patches respawn only on reachable free spots, so nothing to farm)');
  }
  if (preMerge.length === 0) {
    marks.push('no merge pad reachable before any door opens');
  } else if (preMerge.length < merges.length) {
    notes.push(`note: ${merges.length - preMerge.length} of ${merges.length}` +
      ' merge pads sit behind holds (a post-open bonus, not a problem)');
  }
  if (distExit * 1.5 > def.par) {
    marks.push(`exit path ${distExit} vs par ${def.par} (want par >= 1.5x)`);
  }

  if (drifts.length > 0) {
    const { occupied, ticks } = driftOccupancy(rows, def, 600);
    for (const p of spawns) {
      const occ = occupied.get(`${p.x},${p.y}`) ?? 0;
      if (occ / ticks > 0.45) {
        marks.push(`drift camps on spawn (${p.x},${p.y}) ${(occ / ticks * 100).toFixed(0)}% of ticks`);
      }
    }
  }

  if (notes.length) {
    console.log(`${tag}: note`);
    for (const n of notes) console.log('  - ' + n);
  }
  if (marks.length) {
    problems++;
    console.log(`${tag}: PROBLEM`);
    for (const n of marks) console.log('  - ' + n);
    printMap(def);
    continue;
  }
  console.log(
    `${tag}: ok quorum=${def.quorum} par=${def.par} every=${def.spawnEvery} ` +
    `spawns=${spawns.length}(pre:${preSpawns.length}) merges=${merges.length} holds=${holds.length} ` +
    `drifts=${drifts.length} distMerge=${distMerge} distExit=${distExit} farSpawn=${farSpawn}`
  );
  if (debug) printMap(def);
}

if (problems) {
  console.log(`\ncheck-levels: ${problems} of ${LEVELS.length} levels with problems`);
  process.exit(1);
}
console.log(`\ncheck-levels: all ${LEVELS.length} levels pass`);
