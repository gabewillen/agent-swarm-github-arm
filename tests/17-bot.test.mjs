import test from 'node:test';
import assert from 'node:assert/strict';
import { load, lvl, deepFreeze } from './helpers.mjs';

const MOVES = new Set(['up', 'right', 'down', 'left', null]);

// The test suite's own rule checks, independent of src/core/invariants.js.
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

async function botGame(seed, ticks, opts) {
  const { init, step } = await load('core/game.js');
  const { botInput } = await load('core/bot.js');
  let s = init(seed, opts);
  let shipped = false;
  for (let i = 0; i < ticks && s.status === 'playing'; i++) {
    const input = botInput(s);
    assert.ok(input && MOVES.has(input.move) && input.pause === false, `bad input ${JSON.stringify(input)}`);
    const before = s.score;
    s = step(s, input);
    if (s.levelIndex > 0 || s.status === 'won') shipped = true;
    const why = broken(s);
    assert.equal(why, null, `seed ${seed} tick ${i}: ${why}`);
    assert.ok(s.score >= before);
  }
  return { s, shipped };
}

test('botInput returns a valid input', async () => {
  const { init } = await load('core/game.js');
  const { botInput } = await load('core/bot.js');
  const input = botInput(init(1));
  assert.ok(MOVES.has(input.move));
  assert.equal(input.pause, false);
});

test('botInput is pure and deterministic', async () => {
  const { init } = await load('core/game.js');
  const { botInput } = await load('core/bot.js');
  const s = deepFreeze(init(4));
  assert.deepEqual(botInput(s), botInput(s));
});

test('the bot heads for the only patch', async () => {
  const { init } = await load('core/game.js');
  const { botInput } = await load('core/bot.js');
  const s = init(1, { levels: [lvl(['#######', '#@..P.#', '#M...X#', '#######'])] });
  assert.equal(botInput(s).move, 'right');
});

test('the bot takes full hands to the merge pad', async () => {
  const { init } = await load('core/game.js');
  const { botInput } = await load('core/bot.js');
  const s = init(1, { levels: [lvl(['#######', '#M.@.P#', '#....X#', '#######'], { quorum: 5 })] });
  assert.equal(botInput({ ...s, carried: [0, 1, 2] }).move, 'left');
});

test('the bot heads for the open exit', async () => {
  const { init } = await load('core/game.js');
  const { botInput } = await load('core/bot.js');
  const s = init(1, { levels: [lvl(['#######', '#P.@.X#', '#M....#', '#######'])] });
  assert.equal(botInput({ ...s, open: true }).move, 'right');
});

test('the bot plays 10 seeded games of the shipped levels for 2000 ticks without breaking a rule', async () => {
  for (let seed = 1; seed <= 10; seed++) await botGame(seed, 2000);
});

test('the bot scores in every seeded game', async () => {
  for (let seed = 1; seed <= 10; seed++) {
    const { s } = await botGame(seed, 600);
    assert.ok(s.score > 0, `seed ${seed}`);
  }
});

test('the bot ships the first level in at least 7 of 10 seeds', async () => {
  let n = 0;
  for (let seed = 1; seed <= 10; seed++) if ((await botGame(seed, 1500)).shipped) n++;
  assert.ok(n >= 7, `${n} of 10`);
});

test('the bot plays every shipped level from its start without breaking a rule', async () => {
  const { LEVELS } = await load('data/levels.js');
  for (let i = 0; i < LEVELS.length; i++) await botGame(100 + i, 800, { level: i });
});

test('a bot game is deterministic', async () => {
  const a = await botGame(77, 500);
  const b = await botGame(77, 500);
  assert.deepEqual(a.s, b.s);
});
