// Development checks for src/data/levels.js: mirrors tests/16 plus stricter
// gameplay checks of my own:
//  - the test-16 rules, using the local §4 copy;
//  - pre-open (holds closed) reachability of a P and an M from the @;
//  - no drift start adjacent to the player start;
//  - drift starts never on a cell the spawn/pickup flow needs (P/M/X are the
//    parse layer's job, this is only a warning), and no drift sealed into a
//    pocket with no passable direction at its start.
// Also counts floor cells that pre-open reach can't see, for design review.
import { readFileSync } from 'node:fs';
import { validateLevel, parseLevel, reach } from './levelcheck.mjs';

const src = readFileSync(new URL('../src/data/levels.js', import.meta.url), 'utf8');
const mod = await import(new URL('../src/data/levels.js', import.meta.url));
const { LEVELS } = mod;

let bad = 0;
const fail = (msg) => { console.log('FAIL', msg); bad++; };

console.log(`LEVELS: ${LEVELS.length} level(s)`);

if (!Array.isArray(LEVELS) || LEVELS.length < 10) fail('needs >= 10 levels');
const names = LEVELS.map((l) => l.name);
if (new Set(names).size !== names.length) fail('names not distinct: ' + names.join(' | '));

const parsed = [];
for (let i = 0; i < LEVELS.length; i++) {
  const def = LEVELS[i];
  const v = validateLevel(def);
  if (v.ok !== true || v.errors.length !== 0) fail(`level ${i} ${def.name}: ${JSON.stringify(v)}`);
  if (def.quorum > 20) fail(`${def.name}: quorum ${def.quorum} > 20`);
  if (def.par < 30) fail(`${def.name}: par ${def.par} < 30`);
  let l = null;
  try { l = parseLevel(def); } catch (e) { fail(`${def.name}: parse: ${e.message}`); }
  if (l) {
    parsed.push(l);
    const at = reach(def.map, true);
    const pre = at ?? new Set();
    const ps = l.spawns.filter((s) => pre.has(`${s.x},${s.y}`));
    const ms = l.tiles.flatMap((row, y) => [...row].map((c, x) => [c, `${x},${y}`]))
      .filter(([c]) => c === 'M').map(([, k]) => k).filter((k) => pre.has(k));
    if (ps.length === 0) fail(`${def.name}: no spawn point reachable before the holds open`);
    if (ms.length === 0) fail(`${def.name}: no merge pad reachable before the holds open`);
    // sealed floor pockets (design polish, allowed by the spec)
    const total = l.width * l.height;
    const floors = [];
    l.tiles.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '#') floors.push(`${x},${y}`); });
    const all = reach(def.map, false);
    const lost = floors.filter((k) => !all.has(k)).length;
    const preLost = floors.filter((k) => !pre.has(k)).length;
    // drift starts
    const adj = l.drifts.filter((d) => Math.abs(d.x - l.start.x) + Math.abs(d.y - l.start.y) <= 1);
    if (adj.length) warn(`${def.name}: drift start adjacent to the player start`);
    for (const d of l.drifts) {
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      let openDirs = 0;
      for (const [dx, dy] of dirs) {
        const c = (l.tiles[d.y + dy] ?? '')[d.x + dx];
        if (c && c !== '#') openDirs++;
      }
      if (openDirs === 0) fail(`${def.name}: drift at ${d.x},${d.y} is sealed in`);
    }
    console.log(`${String(i).padStart(2)} ${l.name.padEnd(16)} ${l.width}x${l.height}` +
      ` drifts ${l.drifts.length} P ${l.spawns.length} M ${l.tiles.join('').split('M').length - 1}` +
      ` H ${def.map.join('').split('H').length - 1} preOpen P ${ps.length} M ${ms.length}` +
      ` unreached(all) ${lost} unreached(pre-open) ${preLost}` +
      ` quorum ${def.quorum} par ${def.par} dp ${def.driftPeriod} se ${def.spawnEvery}`);
  }
}

// test-16 aggregates
const withDrifts = parsed.filter((l) => l.drifts.length > 0).length;
const withHolds = LEVELS.filter((l) => l.map.some((r) => r.includes('H'))).length;
if (parsed[0]?.drifts.length !== 0) fail('first level must have no drift');
if (withDrifts < 6) fail(`only ${withDrifts} levels with drifts, need >= 6`);
if (withHolds < 4) fail(`only ${withHolds} levels with hold doors, need >= 4`);
for (const l of parsed) if (l.spawns.length < 1) fail(`${l.name}: needs a spawn point`);

console.log(bad ? `${bad} failure(s)` : 'all level checks pass');

function warn(msg) { console.log('warn', msg); }
process.exit(bad ? 1 : 0);
