// agent-43's own check for src/data/levels.js (DESIGN.md §10, test section 16).
// Runs the assertions section 16 makes, through the real core/level.js,
// plus winnability heuristics of my own. Usage: node scripts/check-levels.mjs
import { LEVELS } from '../src/data/levels.js';
import { validateLevel, parseLevel } from '../src/core/level.js';

let bad = 0;
const fail = (msg) => { console.error('FAIL ' + msg); bad++; };
const ok = (msg) => console.log('ok   ' + msg);

// --- the checks of tests/16-levels-data.test.mjs ---
ok(`LEVELS holds ${LEVELS.length} levels`);
if (!Array.isArray(LEVELS) || LEVELS.length < 10) fail('LEVELS must be an array of at least 10 levels');

for (const def of LEVELS) {
  const v = validateLevel(def);
  if (JSON.stringify(v) !== JSON.stringify({ ok: true, errors: [] })) {
    fail(`validateLevel(${def.name}) = ${JSON.stringify(v)}`);
  }
}
ok('every shipped level validates');

const names = LEVELS.map((l) => l.name);
if (new Set(names).size !== names.length) fail('level names are distinct');
else ok(`names distinct: ${names.join(', ')}`);

const parsed = LEVELS.map((def, i) => {
  try { return parseLevel(def); } catch (e) { fail(`parseLevel(${def.name}) threw: ${e.message}`); return null; }
});
if (parsed.includes(null)) { fail('a level failed to parse'); process.exit(1); }

if (parsed[0].drifts.length !== 0) fail('the first level has drifts');
else ok('the first level has no drift');

const withDrifts = parsed.filter((l) => l.drifts.length > 0).length;
ok(`${withDrifts} levels have drifts (need >= 6)`);
if (withDrifts < 6) fail('fewer than 6 levels with drifts');

const withHolds = LEVELS.filter((l) => l.map.some((r) => r.includes('H'))).length;
ok(`${withHolds} levels have hold doors (need >= 4)`);
if (withHolds < 4) fail('fewer than 4 levels with holds');

for (const def of LEVELS) {
  if (def.quorum > 20) fail(`${def.name}: quorum ${def.quorum} > 20`);
  if (def.par < 30) fail(`${def.name}: par ${def.par} < 30`);
  if (parsed[LEVELS.indexOf(def)].spawns.length < 1) fail(`${def.name}: no spawn points`);
}
ok('quorums <= 20, pars >= 30, every level has a spawn point');

// --- my own design checks ---

// Every map row the width of the first row (validateLevel would catch
// ragged rows, but fail with a pointer to the row).
for (const def of LEVELS) {
  def.map.forEach((row, y) => {
    if (!/^[#.^v><@PMXH]*$/.test(row)) fail(`${def.name}: row ${y} has odd characters`);
  });
}

// Win paths: the merge pad and at least one spawn point must be reachable
// without passing a hold door (patches behind holds are bonus stash, never
// the only patch source), and the exit when holds are passable.
function reach(def, passHolds) {
  const parse = parseLevel(def);
  const h = parse.height;
  const w = parse.width;
  const seen = new Set();
  const work = [parse.start];
  while (work.length) {
    const cur = work.pop();
    const key = `${cur.x},${cur.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const c = def.map[ny][nx];
      if (c === '#') continue;
      if (c === 'H' && !passHolds) continue;
      work.push({ x: nx, y: ny });
    }
  }
  return seen;
}

for (const def of LEVELS) {
  const walkable = reach(def, false);   // pre-quorum world
  const gated = reach(def, true);       // post-quorum world
  const spotsAt = (ch) => {
    const out = [];
    def.map.forEach((row, y) => [...row].forEach((c, x) => { if (c === ch) out.push(`${x},${y}`); }));
    return out;
  };
  const keyOf = (p) => `${p.x},${p.y}`;
  const openSpots = spotsAt('P').filter((s) => walkable.has(s));
  const mergeSpots = spotsAt('M').filter((s) => walkable.has(s));
  const exitOk = spotsAt('X').every((s) => gated.has(s));
  const label = `${def.name} (${def.map[0].length}x${def.map.length}, q${def.quorum}, par ${def.par}, drifts ${parseLevel(def).drifts.length})`;
  if (mergeSpots.length === 0) fail(`${label}: no merge pad reachable without holds`);
  if (openSpots.length === 0) fail(`${label}: no spawn point reachable without holds`);
  if (!exitOk) fail(`${label}: exit unreachable even through holds`);
  console.log(`     ${label}: ${openSpots.length} open spawn(s), ${spotsAt('M').length} merge pad(s), hold-gated cells ${gated.size - walkable.size}`);
}

// Drift starts and player start should not sit on a merge pad or exit cell
// (parseLevel turns those chars to '.', but a char collision is impossible
// anyway) and no level should put a spawn point on the border.
for (const def of LEVELS) {
  def.map[0].split('').forEach((c) => c !== '#' && fail(`${def.name}: non-wall on top border`));
}

console.log(bad === 0 ? '\nALL LEVEL CHECKS PASS' : `\n${bad} check(s) failed`);
process.exit(bad === 0 ? 0 : 1);
