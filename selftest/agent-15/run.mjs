// agent-15 selftest (not part of the acceptance suite): the §19 generator
// under stress — every level def validates and parses, generation is
// deterministic and varies across seeds, and the bot ships the default
// generated run broadly and (for smaller quorums) nearly always. Run:
//   node selftest/agent-15/run.mjs [seeds] [botSeeds]
import assert from 'node:assert/strict';
import { generateLevel } from '../../src/core/generate.js';
import { parseLevel, validateLevel } from '../../src/core/level.js';
import { checkState } from '../../src/core/invariants.js';
import { init, step } from '../../src/core/game.js';
import { botInput } from '../../src/core/bot.js';

let failures = 0;
function fail(msg) {
  failures += 1;
  console.log('FAIL', msg);
}

const combos = [
  ['defaults', [15, 11, 2, 4, 5, {}]],
  ['big', [21, 13, 4, 6, 9, {}]],
  ['tiny', [7, 7, 1, 2, 3, {}]],
  ['max', [32, 24, 8, 10, 12, {}]],
  ['crowded', [15, 11, 5, 4, 5, {}]],
];
const nSeeds = Number(process.argv[2] ?? 120) + 1;

for (const [w, h, dr, sp, qu, o] of combos.map(([, v]) => v)) {
  const seen = new Set();
  for (let seed = 0; seed < nSeeds; seed++) {
    const opts = { width: w, height: h, drifts: dr, spawns: sp, quorum: qu, ...o };
    let def;
    try {
      def = generateLevel(seed, opts);
    } catch (e) {
      fail(`seed ${seed} ${w}x${h}: threw ${e}`);
      break;
    }
    const errors = validateLevel(def).errors;
    if (errors.length > 0) fail(`seed ${seed} ${w}x${h}: invalid ${errors}`);
    parseLevel(def);
    if (seed % 7 === 0) assert.deepEqual(generateLevel(seed, opts), def, 'determinism');
    seen.add(def.map.join('\n'));
  }
  const label = `${w}x${h} d${dr} s${sp} q${qu}`;
  const floor = Math.min(0.9 * nSeeds, nSeeds);
  if (seen.size < floor) fail(`${label}: only ${seen.size}/${nSeeds} distinct maps`);
}
console.log(`validated ${nSeeds - 1} seeds per combo of ${combos.length} combos, generateLevel`);

// The bot (§9) over the default generated run: the acceptance bar is 6 of
// seeds 1..10; track a wide margin over many more.
const botSeeds = Number(process.argv[3] ?? 60);
let won = 0;
const lost = [];
for (let seed = 1; seed <= botSeeds; seed++) {
  const def = generateLevel(seed);
  let s = init(seed, { levels: [def] });
  const bad = [];
  for (let i = 0; i < 1500 && s.status === 'playing'; i++) {
    s = step(s, botInput(s));
    const errs = checkState(s);
    if (errs.length) bad.push(`step ${i}: checkState ${errs.join(',')}`);
    if (bad.length) break;
  }
  if (bad.length) {
    fail(`seed ${seed}: ${bad[0]}`);
    continue;
  }
  if (s.status === 'won') won += 1;
  else lost.push(`seed ${seed}: ${s.status} merge ${s.merges}/${def.quorum} lives ${s.lives} step ${s.tick}`);
}
console.log(`bot shipped ${won}/${botSeeds} default generated levels (bar: 6/10)`);
if (won < Math.max(6, Math.floor(botSeeds * 0.75))) {
  fail(`bot shipped only ${won}/${botSeeds}:\n  ${lost.join('\n  ')}`);
} else if (lost.length) {
  console.log('not shipped:', lost.join(', '));
}

console.log(failures === 0 ? 'selftest OK' : `selftest FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
