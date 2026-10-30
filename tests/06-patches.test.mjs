import test from 'node:test';
import assert from 'node:assert/strict';
import { game, play } from './helpers.mjs';

// Four patches in a row east of the start, a merge pad at the end.
const ROW = ['#########', '#@PPPP.M#', '#X......#', '#########'];

test('walking onto a patch picks it up', async () => {
  const s0 = await game(ROW);
  const color = s0.patches[0].color;
  const s = await play(s0, ['right']);
  assert.deepEqual(s.carried, [color]);
  assert.equal(s.patches.length, 3);
  assert.ok(!s.patches.some((p) => p.x === 2 && p.y === 1));
  assert.deepEqual(s.events, ['pickup']);
});

test('carried keeps pickup order', async () => {
  const s0 = await game(ROW);
  const s = await play(s0, ['right', 'right', 'right']);
  assert.deepEqual(s.carried, s0.patches.slice(0, 3).map((p) => p.color));
});

test('at most CARRY_MAX patches are carried; the rest stay on the floor', async () => {
  const s0 = await game(ROW);
  const s = await play(s0, ['right', 'right', 'right', 'right']);
  assert.equal(s.carried.length, 3);
  assert.deepEqual(s.patches, [s0.patches[3]]);
  assert.deepEqual(s.events, []);
});

test('the remaining patches keep their order', async () => {
  const s0 = await game(ROW);
  const s = await play(s0, ['right', 'right']);
  assert.deepEqual(s.patches, s0.patches.slice(2));
});

test('standing still on an empty cell picks up nothing', async () => {
  const s = await play(await game(ROW), [null]);
  assert.deepEqual(s.carried, []);
  assert.equal(s.patches.length, 4);
});

test('a blocked move onto nothing picks up nothing', async () => {
  const s = await play(await game(ROW), ['up']);
  assert.deepEqual(s.carried, []);
  assert.deepEqual(s.events, []);
});
