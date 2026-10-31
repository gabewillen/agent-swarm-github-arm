// agent-23's integration soak, area 5 (invariants + statistics), run like:
//   node check/invariants-soak.mjs [seeds] [stepCap]
// It plays full campaigns of the shipped LEVELS through the bot and, every
// step, chains the state through checkState, the stats fold, the replay
// round trip, and the achievements check. A nonzero exit means a hole.
// Pure harness: the modules under src/ stay the only game code it loads.

const seeds = Number.isInteger(Number(process.argv[2])) && Number(process.argv[2]) > 0
  ? Number(process.argv[2]) : 20;
const stepCap = Number.isInteger(Number(process.argv[3])) && Number(process.argv[3]) > 0
  ? Number(process.argv[3]) : 2000;

const load = async (rel) => import(new URL(`../src/${rel}`, import.meta.url).href);
const { init, step } = await load('core/game.js');
const { checkState } = await load('core/invariants.js');
const { statsInit, statsUpdate, statsLines } = await load('core/stats.js');
const { botInput } = await load('core/bot.js');
const { LEVELS } = await load('data/levels.js');
const { recordReplay, encodeReplay, decodeReplay, playReplay } = await load('core/replay.js');
const { checkAchievements, ACHIEVEMENTS } = await load('core/achievements.js');

let problems = 0;
const fails = [];
const fail = (msg) => {
  problems++;
  if (fails.length < 40) fails.push(msg);
};

let campaignWins = 0;
let ships = 0;
let steps = 0;
const endStatus = new Map();

const ids = new Set(ACHIEVEMENTS.map((a) => a.id));

for (const seed of Array.from({ length: seeds }, (_, i) => i + 1)) {
  let s = init(seed, { levels: LEVELS });
  let stats = statsInit();
  const played = [];
  const unlocked = [];

  for (let i = 0; i < stepCap && s.status === 'playing'; i++) {
    const input = botInput(s);
    played.push(input);
    const next = step(s, input);
    steps++;

    // §8: every core state the game hands on must pass its invariants.
    const codes = checkState(next);
    if (codes.length > 0) {
      fail(`seed ${seed} tick ${next.tick}: checkState ${JSON.stringify(codes)} player ${JSON.stringify(next.player)} carried ${JSON.stringify(next.carried)}`);
    }

    // §22: the accumulated stats never disagree with one eventful step.
    const before = { ...stats };
    stats = statsUpdate(stats, s, next, input);
    const count = (name) => next.events.reduce((n, e) => n + (e === name ? 1 : 0), 0);
    if (stats.ticks !== next.tick) fail(`seed ${seed} tick ${next.tick}: accumulated ticks ${stats.ticks} != the game's tick`);
    if (stats.pickups !== before.pickups + count('pickup')) fail(`seed ${seed} tick ${next.tick}: pickups ${stats.pickups} missed ${count('pickup')}`);
    if (stats.merges !== before.merges + count('merge')) fail(`seed ${seed} tick ${next.tick}: merges ${stats.merges} missed ${count('merge')}`);
    if (stats.hits !== before.hits + count('hit')) fail(`seed ${seed} tick ${next.tick}: hits ${stats.hits} missed ${count('hit')}`);
    if (stats.drops !== before.drops + count('drop')) fail(`seed ${seed} tick ${next.tick}: drops ${stats.drops} missed ${count('drop')}`);
    if (stats.conflicts !== before.conflicts + count('conflict')) fail(`seed ${seed} tick ${next.tick}: conflicts ${stats.conflicts} missed ${count('conflict')}`);
    if (stats.levels !== before.levels + count('level') + count('won')) fail(`seed ${seed} tick ${next.tick}: levels ${stats.levels} missed level/won events`);
    if (next.events.includes('merge')) {
      const n = Array.isArray(s.carried) ? s.carried.length : 0;
      if (stats.patchesMerged !== before.patchesMerged + n) fail(`seed ${seed} tick ${next.tick}: patchesMerged ${stats.patchesMerged} expected +${n}`);
      if (n > stats.bestMerge) fail(`seed ${seed} tick ${next.tick}: bestMerge ${stats.bestMerge} below ${n}`);
    }
    if (stats.moves > stats.ticks) fail(`seed ${seed} tick ${next.tick}: moves ${stats.moves} over ticks ${stats.ticks}`);
    if (stats.moves > 0 && stats.patchesMerged / Math.max(1, stats.merges) > 3) fail(`seed ${seed} tick ${next.tick}: merges carry more than 3 patches`);

    // §18: the replay of every move so far re-runs to the same step.
    if (i > 0 && i % 250 === 0) {
      const replay = recordReplay(seed, played, { levels: LEVELS });
      const text = encodeReplay(replay);
      const back = decodeReplay(text);
      if (!back) fail(`seed ${seed} tick ${next.tick}: encoded replay ${text} did not decode`);
      else {
        const rerun = playReplay(back, LEVELS);
        if (rerun.tick !== next.tick || JSON.stringify(rerun.player) !== JSON.stringify(next.player)
            || rerun.score !== next.score) {
          fail(`seed ${seed} tick ${next.tick}: replay did not catch up (player ${JSON.stringify(rerun.player)} vs ${JSON.stringify(next.player)}, tick ${rerun.tick}, score ${rerun.score})`);
        }
      }
    }

    // §21: achievements earn exactly what the step shows.
    for (const id of checkAchievements(s, next, unlocked)) {
      if (!ids.has(id)) fail(`seed ${seed} tick ${next.tick}: unknown achievement id ${id}`);
      unlocked.push(id);
    }

    if (next.events.includes('level')) ships++;
    s = next;
  }

  if (s.status === 'playing') fail(`seed ${seed}: still playing after ${stepCap} steps`);
  endStatus.set(s.status, (endStatus.get(s.status) ?? 0) + 1);
  if (s.status === 'won') campaignWins++;
  if (!statsLines(stats).every((line) => /^(MOVES|MERGES|BEST|HITS|LEVELS) \d+$/.test(line))) {
    fail(`seed ${seed}: statsLines malformed ${JSON.stringify(statsLines(stats))}`);
  }
}

for (const line of fails) console.log('PROBLEM:', line);
const parts = [...endStatus.entries()].map(([k, n]) => `${k} ${n}`).join(', ');
console.log(`seeds ${seeds}, steps ${steps}: ${parts}; levels shipped ${ships}`);
console.log('stats sample:', statsLines({ ...statsInit(), moves: 12, merges: 3, bestMerge: 3, hits: 1, levels: 2 }).join(' | '));
console.log(problems === 0 ? 'invariants soak: clean' : `invariants soak: ${problems} problems`);
process.exit(problems === 0 ? 0 : 1);
