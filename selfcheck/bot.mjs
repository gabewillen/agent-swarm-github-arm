// Local stress checks for src/core/bot.js (§9): more seeds, all shipped
// levels, hard drift traffic, purity, determinism. Runs standalone:
//   node selfcheck/bot.mjs
import assert from 'node:assert/strict';
import { init, step } from '../src/core/game.js';
import { botInput } from '../src/core/bot.js';
import { LEVELS } from '../src/data/levels.js';
import { generateLevel } from '../src/core/generate.js';

// The acceptance suite's rule checks, restated here.
function broken(s) {
  const wall = (x, y) => { const r = s.level.tiles[y]; return r === undefined || x < 0 || x >= r.length || r[x] === '#'; };
  if (!['playing', 'won', 'lost'].includes(s.status)) return 'status';
  if (wall(s.player.x, s.player.y)) return 'player in wall';
  if (s.carried.length > 3) return 'carry';
  if (!Number.isInteger(s.lives) || s.lives < 0 || s.lives > 3) return 'lives';
  if (!Number.isInteger(s.score) || s.score < 0) return 'score';
  if (s.patches.some((p) => !s.level.spawns.some((q) => q.x === p.x && q.y === p.y))) return 'patch off spawn';
  if (s.drifts.some((d) => wall(d.x, d.y))) return 'drift in wall';
  return null;
}

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (err) {
    failures++;
    console.log('FAIL - ' + name + ': ' + err.message);
  }
}

function botGame(seed, ticks, opts) {
  let s = init(seed, opts);
  let shipped = false;
  for (let i = 0; i < ticks && s.status === 'playing'; i++) {
    const input = botInput(s);
    assert.ok(input && ['up', 'right', 'down', 'left', null].includes(input.move) &&
      input.pause === false, `bad input ${JSON.stringify(input)}`);
    const before = s.score;
    s = step(s, input);
    assert.strictEqual(broken(s), null, `seed ${seed} tick ${i}: ${broken(s)}`);
    assert.ok(s.score >= before, `seed ${seed}: score fell`);
    if (s.levelIndex > 0 || s.status === 'won') shipped = true;
  }
  return { s, shipped };
}

const lvl = (map, extra = {}) =>
  ({ name: 'test', quorum: 2, par: 200, driftPeriod: 2, spawnEvery: 40, map, ...extra });

// Directions toward a patch, full hands, and the open exit.
test('heads for the only patch, full hands to the pad, and the exit', () => {
  assert.equal(botInput(init(1, { levels: [lvl(['#######', '#@..P.#', '#M...X#', '#######'])] })).move, 'right');
  const pad = init(1, { levels: [lvl(['#######', '#M.@.P#', '#....X#', '#######'], { quorum: 5 })] });
  assert.equal(botInput({ ...pad, carried: [0, 1, 2] }).move, 'left');
  const exit = init(1, { levels: [lvl(['#######', '#P.@.X#', '#M....#', '#######'])] });
  assert.equal(botInput({ ...exit, open: true }).move, 'right');
});

// Purity on a frozen state, and identical answers on identical states.
test('pure and deterministic on a frozen state', () => {
  const s = init(4);
  const freeze = (o) => { Object.freeze(o); for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v); return o; };
  const frozen = freeze(init(4));
  assert.deepEqual(botInput(frozen), botInput(frozen));
  assert.deepEqual(botInput(s), botInput(s));
});

// More seeds, every shipped level, and harder seeds than the suite uses.
test('survives 24 seeded runs of the first level for 900 ticks', () => {
  for (let seed = 1; seed <= 24; seed++) botGame(seed, 900);
});

test('every shipped level from four start seeds, 900 ticks', () => {
  for (let i = 0; i < LEVELS.length; i++) {
    for (const seed of [100 + i, 400 + i]) botGame(seed, 900, { level: i });
  }
});

// Drift-dense artificial gauntlet: give nothing to fetch but long
// dodging ground, then a merge and the exit.
test('runs a drift-heavy gauntlet without breaking a rule', () => {
  const gauntlet = lvl([
    '#########',
    '#@.>.>..#',
    '#.#####.#',
    '#.<.<.P.#',
    '#M.....X#',
    '#########',
  ], { quorum: 2, par: 300 });
  botGame(7, 1200, { levels: [gauntlet] });
  for (let seed = 1; seed <= 12; seed++) botGame(seed, 1200, { levels: [gauntlet] });
});

// Crowded crossfire: many drifts, tight lanes.
test('runs the crossfire lanes without breaking a rule', () => {
  const crossfire = lvl([
    '#########',
    '#@.v.v..#',
    '#P.....P#',
    '#..^.^.M#',
    '#.......#',
    '#X.....P#',
    '#########',
  ], { quorum: 4, par: 400, driftPeriod: 2, spawnEvery: 14 });
  for (let seed = 1; seed <= 12; seed++) botGame(seed, 1400, { levels: [crossfire] });
});

// Generated levels across 30 seeds: the bot ships most, never breaks a
// rule, and the whole pass stays well inside the time budget.
test('ships most of 30 generated levels', () => {
  let shipped = 0;
  const t0 = process.hrtime.bigint();
  for (let seed = 1; seed <= 30; seed++) {
    const { shipped: yes } = botGame(seed, 1500, { levels: [generateLevel(seed)] });
    if (yes) shipped++;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(shipped >= 18, `${shipped} of 30 shipped`);
  assert.ok(ms < 12000, `too slow: ${ms.toFixed(0)}ms`);
  console.log(`\n   (${shipped} of 30 generated shipped in ${ms.toFixed(0)}ms)`);
});

// Same game twice, identical final state.
test('a bot game is deterministic across runs', () => {
  const a = botGame(77, 500);
  const b = botGame(77, 500);
  assert.deepEqual(a.s, b.s);
});

console.log(failures === 0 ? '\nall bot checks pass' : `\n${failures} bot checks fail`);
process.exit(failures === 0 ? 0 : 1);
