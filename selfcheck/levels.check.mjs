// agent-20's own checker for the shipped levels (not part of the suite).
import { validateLevel, parseLevel } from '../src/core/level.js';
import { LEVELS } from '../src/data/levels.js';

const problems = [];
const fail = (name, msg) => problems.push(`${name}: ${msg}`);

// §10 contract checks.
if (!Array.isArray(LEVELS) || LEVELS.length < 10) fail('LEVELS', 'fewer than 10');
const names = LEVELS.map((l) => l.name);
if (new Set(names).size !== names.length) fail('names', 'duplicates');
let driftLevels = 0, holdLevels = 0;
for (const def of LEVELS) {
  const name = def.name;
  const v = validateLevel(def);
  if (!v.ok) fail(name, 'validateLevel !ok: ' + JSON.stringify(v.errors));
  let parsed;
  try { parsed = parseLevel(def); } catch (e) { fail(name, 'parse threw: ' + e.message); continue; }
  // widths equal
  if (def.map.some((r) => r.length !== def.map[0].length)) fail(name, 'ragged');
  if (parsed.width > 32 || parsed.height > 24) fail(name, 'too big');

  if (parsed.drifts.length > 0) driftLevels++;
  if (def.map.some((r) => r.includes('H'))) holdLevels++;
  if (def.quorum > 20) fail(name, 'quorum > 20');
  if (def.par < 30) fail(name, 'par < 30');

  // Win path: every P and M reachable WITHOUT crossing a closed hold;
  // the exit reachable once quorum is reached (H passable then).
  const wide = parsed.width, high = parsed.height;
  const tileAt = (x, y) => (parsed.tiles[y]?.[x] ?? '#');
  const blocksWalk = (x, y) => tileAt(x, y) === '#';
  const open = (x, y) => !(x < 0 || y < 0 || x >= wide || y >= high) && !blocksWalk(x, y);
  const reach = (from, denyHold) => {
    const seen = new Set([from.y * wide + from.x]);
    const q = [from];
    while (q.length) {
      const { x, y } = q.pop();
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (!open(nx, ny)) continue;
        if (denyHold && tileAt(nx, ny) === 'H') continue;
        const k = ny * wide + nx;
        if (seen.has(k)) continue;
        seen.add(k); q.push({ x: nx, y: ny });
      }
    }
    return seen;
  };
  const closed = reach(parsed.start, true);
  const opened = reach(parsed.start, false);
  for (const s of parsed.spawns) {
    if (!closed.has(s.y * wide + s.x)) fail(name, `spawn ${s.x},${s.y} behind closed holds`);
    if (!opened.has(s.y * wide + s.x)) fail(name, `spawn ${s.x},${s.y} unreachable ever`);
  }
  const m = [];
  for (let y = 0; y < high; y++) for (let x = 0; x < wide; x++) if (tileAt(x, y) === 'M') m.push({ x, y });
  if (m.length === 0) fail(name, 'no merge pad');
  for (const p of m) {
    if (!closed.has(p.y * wide + p.x)) fail(name, `merge ${p.x},${p.y} behind closed holds`);
    if (!opened.has(p.y * wide + p.x)) fail(name, `merge ${p.x},${p.y} unreachable ever`);
  }
  const exits = [];
  for (let y = 0; y < high; y++) for (let x = 0; x < wide; x++) if (tileAt(x, y) === 'X') exits.push({ x, y });
  if (exits.length !== 1) fail(name, 'exit count ' + exits.length);
  else if (!opened.has(exits[0].y * wide + exits[0].x)) fail(name, 'exit unreachable even with doors open');

  // Keep the player some space from drift starts.
  for (const d of parsed.drifts) {
    const dist = Math.abs(d.x - parsed.start.x) + Math.abs(d.y - parsed.start.y);
    if (dist < 2) fail(name, `drift at ${d.x},${d.y} starts on/near the player`);
  }

  // Difficulty rises: drift count and quorum never fall below the previous level's trend.
}
if (driftLevels < 6) fail('LEVELS', `only ${driftLevels} levels with drifts`);
if (holdLevels < 4) fail('LEVELS', `only ${holdLevels} levels with holds`);
if (validateLevel(LEVELS[0]).ok && parseLevel(LEVELS[0]).drifts.length !== 0) fail('first', 'has drifts');

if (problems.length) {
  console.log('FAIL');
  for (const p of problems) console.log('  ' + p);
  process.exitCode = 1;
} else {
  console.log(`OK — ${LEVELS.length} levels, ${driftLevels} with drifts, ${holdLevels} with holds`);
}
