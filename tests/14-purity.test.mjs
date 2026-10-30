import test from 'node:test';
import assert from 'node:assert/strict';
import { load, lvl, deepFreeze, mv } from './helpers.mjs';

const MAP = ['###########', '#@P.M....X#', '#.>.<.....#', '#..P..>.<.#', '#....v....#', '###########'];
const MOVES = ['right', 'right', 'down', null, 'left', 'up', 'right', 'right', 'down', 'down', null, 'right'];

async function trace(seed) {
  const { init, step } = await load('core/game.js');
  let s = init(seed, { levels: [lvl(MAP, { spawnEvery: 3 })] });
  const out = [s];
  for (let i = 0; i < 60; i++) {
    s = step(s, mv(MOVES[i % MOVES.length]));
    out.push(s);
  }
  return out;
}

test('step never changes the state it is given (deep-frozen input)', async () => {
  const { init, step } = await load('core/game.js');
  let s = deepFreeze(init(3, { levels: [lvl(MAP, { spawnEvery: 3 })] }));
  for (let i = 0; i < 40; i++) s = deepFreeze(step(s, mv(MOVES[i % MOVES.length])));
  assert.ok(s.tick > 0);
});

test('step leaves the input object alone', async () => {
  const { init, step } = await load('core/game.js');
  const input = deepFreeze({ move: 'right', pause: false });
  step(init(3, { levels: [lvl(MAP)] }), input);
  assert.deepEqual(input, { move: 'right', pause: false });
});

test('same seed and inputs give the same states', async () => {
  assert.deepEqual(await trace(11), await trace(11));
});

test('different seeds give different patch colours somewhere', async () => {
  const runs = await Promise.all([1, 2, 3, 4, 5].map(trace));
  const colors = new Set(runs.map((r) => JSON.stringify(r[0].patches.map((p) => p.color))));
  assert.ok(colors.size > 1);
});

test('every state is plain JSON', async () => {
  for (const s of await trace(5)) assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('a JSON round trip of the state plays on identically', async () => {
  const { step } = await load('core/game.js');
  const states = await trace(8);
  const mid = states[20];
  let a = mid;
  let b = JSON.parse(JSON.stringify(mid));
  for (let i = 0; i < 20; i++) {
    a = step(a, mv(MOVES[i % MOVES.length]));
    b = step(b, mv(MOVES[i % MOVES.length]));
  }
  assert.deepEqual(a, b);
});

test('the score never drops and is an integer', async () => {
  let last = 0;
  for (const s of await trace(13)) {
    assert.ok(Number.isInteger(s.score));
    assert.ok(s.score >= last);
    last = s.score;
  }
});
