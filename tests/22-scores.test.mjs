import test from 'node:test';
import assert from 'node:assert/strict';
import { load, deepFreeze } from './helpers.mjs';

const scores = () => load('ui/scores.js');

test('addScore puts a new best first', async () => {
  const { addScore } = await scores();
  assert.deepEqual(addScore([{ name: 'a', score: 10 }], { name: 'b', score: 20 }), [{ name: 'b', score: 20 }, { name: 'a', score: 10 }]);
});

test('addScore puts a tie after the earlier entry', async () => {
  const { addScore } = await scores();
  assert.deepEqual(addScore([{ name: 'a', score: 10 }], { name: 'b', score: 10 }).map((e) => e.name), ['a', 'b']);
});

test('addScore keeps the best 10', async () => {
  const { addScore } = await scores();
  let t = [];
  for (let i = 1; i <= 12; i++) t = addScore(t, { name: `p${i}`, score: i * 10 });
  assert.equal(t.length, 10);
  assert.equal(t[0].score, 120);
  assert.equal(t[9].score, 30);
});

test('addScore does not change its argument', async () => {
  const { addScore } = await scores();
  const t = deepFreeze([{ name: 'a', score: 5 }]);
  addScore(t, { name: 'b', score: 7 });
  assert.equal(t.length, 1);
});

test('formatScore pads to 6 digits and caps at 999999', async () => {
  const { formatScore } = await scores();
  assert.equal(formatScore(0), '000000');
  assert.equal(formatScore(420), '000420');
  assert.equal(formatScore(999999), '999999');
  assert.equal(formatScore(1234567), '999999');
});

test('parseTable reads a good table', async () => {
  const { parseTable } = await scores();
  assert.deepEqual(parseTable('[{"name":"a","score":3}]'), [{ name: 'a', score: 3 }]);
});

test('parseTable returns [] for anything else', async () => {
  const { parseTable } = await scores();
  for (const t of ['', 'nope', '{}', '[1]', '[{"name":1,"score":2}]', '[{"name":"a","score":1.5}]', 'null']) assert.deepEqual(parseTable(t), [], t);
});
