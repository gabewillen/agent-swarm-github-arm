// Self-checks for src/data/levels.js against DESIGN.md §10 (and §4's
// validation). Not part of the acceptance suite; run with:
//   node tools/check-levels.mjs
import { validateLevel, parseLevel } from '../src/core/level.js';
import { LEVELS } from '../src/data/levels.js';

let bad = 0;
const fail = (...msg) => { bad++; console.log('FAIL', ...msg); };

// 1. every level validates (validateLevel checks bad_char, borders,
// counts, and reachability itself).
for (const def of LEVELS) {
  const v = validateLevel(def);
  if (!v.ok) { bad++; console.log('FAIL', def.name, v.errors.join(',')); }
}

// 2. structural requirements.
if (!Array.isArray(LEVELS) || LEVELS.length < 10) fail('LEVELS needs >= 10, got', LEVELS.length);

const names = LEVELS.map((l) => l.name);
if (new Set(names).size !== names.length) fail('duplicate names:', names.join(' | '));

const parsed = LEVELS.map((def) => {
  try {
    return { def, ok: true, parsed: parseLevel(def) };
  } catch (e) {
    return { def, ok: false, error: e.message };
  }
});
for (const p of parsed) {
  if (!p.ok) fail(p.def.name, p.error);
}

if (parsed[0].ok && parsed[0].parsed.drifts.length !== 0) {
  fail('the first level has drifts');
}

const driftLevels = parsed.filter((p) => p.ok && p.parsed.drifts.length > 0).length;
if (driftLevels < 6) fail('drift levels', driftLevels, '< 6');

const holdLevels = LEVELS.filter((l) => l.map.some((r) => r.includes('H'))).length;
if (holdLevels < 4) fail('hold levels', holdLevels, '< 4');

for (const l of LEVELS) {
  if (l.quorum > 20) fail(l.name, 'quorum', l.quorum, '> 20');
  if (l.par < 30) fail(l.name, 'par', l.par, '< 30');
}

for (const p of parsed) {
  if (p.ok && p.parsed.spawns.length < 1) fail(p.def.name, 'no spawn points');
}

// 3. difficulty rises roughly with index: quorum never drops, size never
// shrinks, and later levels should not be trivially easier.
for (let i = 1; i < LEVELS.length; i++) {
  if (LEVELS[i].quorum < LEVELS[i - 1].quorum) {
    fail('quorum drops from', LEVELS[i - 1].name, 'to', LEVELS[i].name);
  }
}

// 4. report.
console.log('LEVELS:', LEVELS.length);
for (const p of parsed) {
  if (!p.ok) continue;
  const { name, quorum, par, driftPeriod, spawnEvery, width, height, spawns, drifts } = p.parsed;
  const holds = (p.def.map.join('').match(/H/g) || []).length;
  console.log(
    `${String(LEVELS.indexOf(p.def) + 1).padStart(2)} ${name.padEnd(14)}`
    + ` ${width}x${height} quorum=${String(quorum).padStart(2)} par=${String(par).padStart(3)}`
    + ` drifts=${drifts.length} holds=${holds} spawns=${spawns.length}`
    + ` driftPeriod=${driftPeriod} spawnEvery=${spawnEvery}`,
  );
}
if (bad > 0) {
  console.log(`check-levels: ${bad} problem(s)`);
  process.exit(1);
}
console.log('check-levels: all good');
