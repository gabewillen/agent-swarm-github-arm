// The rules-core soak (agent-2, areas 3+4): plays whole games with the
// merged bot and checks every step with the merged invariants, stats,
// achievements, and replay chain, over the shipped campaign and many
// generated levels. Run after any change that touches gameplay:
//
//   node dev/soak-rules.mjs
//
// It prints what it played, every trouble it finds, and "SOAK PASS" when
// the game behaves within its contracts end to end.
import { init, step } from '../src/core/game.js';
import { checkState } from '../src/core/invariants.js';
import { botInput } from '../src/core/bot.js';
import { statsInit, statsUpdate } from '../src/core/stats.js';
import { checkAchievements, ACHIEVEMENTS } from '../src/core/achievements.js';
import { recordReplay, encodeReplay, decodeReplay, playReplay } from '../src/core/replay.js';
import { generateLevel } from '../src/core/generate.js';
import { LEVELS } from '../src/data/levels.js';

const CAMPAIGN_SEEDS = 25;
const GENERATED_SEEDS = 20;

let problems = [];
const byEvent = {};
let campaignRuns = 0;
let campaignWins = 0;
let generatedRuns = 0;
let generatedWins = 0;

function soak(seed, opts, label, cap = 6000) {
  let s;
  try {
    s = init(seed, opts);
  } catch (e) {
    problems.push({ label, seed, errs: [`init throws: ${e.message}`] });
    return null;
  }
  let stats = statsInit();
  let unlocked = [];
  const inputs = [];
  for (let i = 0; i < cap && s.status === 'playing'; i++) {
    const input = botInput(s);
    inputs.push(input);
    const prev = s;
    const next = step(s, input);
    if (next === prev) problems.push({ label, seed, i, errs: ['step returned the same object'] });
    stats = statsUpdate(stats, prev, next, input);
    const errs = checkState(next);
    if (errs.length) problems.push({ label, seed, i, errs, events: next.events, status: next.status });
    unlocked = unlocked.concat(checkAchievements(prev, next, unlocked));
    for (const e of next.events) byEvent[e] = (byEvent[e] || 0) + 1;
    s = next;
  }
  // the recorded inputs replay to the same final state
  try {
    const replay = recordReplay(seed, inputs, opts);
    const round = decodeReplay(encodeReplay(replay));
    if (!round || JSON.stringify(round) !== JSON.stringify(replay)) {
      problems.push({ label, seed, errs: ['replay round trip differs'] });
    } else {
      const fin = playReplay(replay, opts.levels);
      if (JSON.stringify(fin) !== JSON.stringify(s)) {
        problems.push({ label, seed, errs: ['replay final state differs from the stepped one'] });
      }
    }
  } catch (e) {
    problems.push({ label, seed, errs: [`replay chain throws: ${e.message}`] });
  }
  const known = new Set(ACHIEVEMENTS.map((a) => a.id));
  for (const id of unlocked) {
    if (!known.has(id)) problems.push({ label, seed, errs: [`unknown achievement ${id}`] });
  }
  if (stats.moves > stats.ticks) problems.push({ label, seed, errs: ['stats: moves above ticks'] });
  return { s, stats, unlocked };
}

// The shipped campaign, bot-driven, over many seeds.
for (let seed = 1; seed <= CAMPAIGN_SEEDS; seed++) {
  const r = soak(seed, {}, 'campaign');
  if (r) {
    campaignRuns++;
    if (r.s.status === 'won') campaignWins++;
  }
}

// Levels in the shape generateLevel makes, including option variants.
const VARIANTS = [{}, { width: 21, height: 9 }, { drifts: 3, spawns: 6 }, { width: 7, height: 7, spawns: 3 }];
for (let seed = 1; seed <= GENERATED_SEEDS; seed++) {
  for (const opts of VARIANTS) {
    const def = generateLevel(seed, opts);
    const r = soak(seed, { levels: [def] }, 'generated');
    if (r) {
      generatedRuns++;
      if (r.s.status === 'won') generatedWins++;
    }
  }
}

console.log(`campaign: ${campaignWins}/${campaignRuns} games won, bot-driven over LEVELS (${LEVELS?.length ?? 0} shipped levels)`);
console.log(`generated: ${generatedWins}/${generatedRuns} generated games won`);
const fired = Object.keys(byEvent).sort().map((e) => `${e} ${byEvent[e]}`).join(', ');
console.log(`events seen: ${fired}`);
if (problems.length) {
  console.log(`problems (${problems.length}), first few:`);
  for (const p of problems.slice(0, 10)) console.log(JSON.stringify(p));
}
console.log(problems.length === 0 && generatedRuns > 0 && campaignRuns === CAMPAIGN_SEEDS ? 'SOAK PASS' : 'SOAK PROBLEMS');
