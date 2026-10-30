import test from 'node:test';
import assert from 'node:assert/strict';
import { game, play } from './helpers.mjs';

test('a drift moves one cell in its direction each tick at driftPeriod 1', async () => {
  const s = await play(await game(['#########', '#@P.M..X#', '#.>.....#', '#########']), [null]);
  assert.deepEqual(s.drifts, [{ x: 3, y: 2, dir: 'right' }]);
});

test('drifts move only when tick % driftPeriod === 0', async () => {
  const s0 = await game(['#########', '#@P.M..X#', '#.>.....#', '#########'], { driftPeriod: 3 });
  const a = await play(s0, [null, null]);
  assert.deepEqual(a.drifts, [{ x: 2, y: 2, dir: 'right' }]);
  const b = await play(a, [null]);
  assert.deepEqual(b.drifts, [{ x: 3, y: 2, dir: 'right' }]);
});

test('a blocked drift turns clockwise', async () => {
  const s = await play(await game(['#######', '#@P.MX#', '#....>#', '#.....#', '#######']), [null]);
  assert.deepEqual(s.drifts, [{ x: 5, y: 3, dir: 'down' }]);
});

test('a drift tries up to four directions in clockwise order', async () => {
  // facing up into a wall, right and down are walls too: it turns left
  const s = await play(await game(['#######', '#@PMX.#', '#######', '#..^###', '#######']), [null]);
  assert.deepEqual(s.drifts, [{ x: 2, y: 3, dir: 'left' }]);
});

test('a boxed-in drift stays and keeps its direction', async () => {
  const s = await play(await game(['#######', '#@PMX.#', '#######', '###^###', '#######']), [null]);
  assert.deepEqual(s.drifts, [{ x: 3, y: 3, dir: 'up' }]);
});

test('drifts treat holds and the exit as walls even when open', async () => {
  const s0 = await game(['########', '#@PMH<.#', '#.....X#', '#......#', '########']);
  const a = await play(s0, ['right', 'right']);
  assert.equal(a.open, true);
  // tick 1: left is the hold, up a wall, so right to (6,1); tick 2: right is
  // a wall, down the open exit, so left back to (5,1)
  assert.deepEqual(a.drifts, [{ x: 5, y: 1, dir: 'left' }]);
});

test('drifts pass over merge pads and patches', async () => {
  const s = await play(await game(['########', '#@....X#', '#.>MP..#', '########']), [null, null]);
  assert.deepEqual(s.drifts, [{ x: 4, y: 2, dir: 'right' }]);
  assert.equal(s.patches.length, 1);
});

test('drifts move in array order and ignore each other while moving', async () => {
  const s = await play(await game(['#########', '#@P.M..X#', '#.>>....#', '#########']), [null]);
  assert.deepEqual(s.drifts, [{ x: 3, y: 2, dir: 'right' }, { x: 4, y: 2, dir: 'right' }]);
});

test('a drift bounces back from a dead end, turning clockwise', async () => {
  const s = await play(await game(['#######', '#@P.MX#', '#.....#', '#>....#', '#######']), [null, null, null, null, null]);
  assert.deepEqual(s.drifts, [{ x: 4, y: 3, dir: 'left' }]);
});

test('drifts do not move while paused', async () => {
  const s = await play(await game(['#########', '#@P.M..X#', '#.>.....#', '#########']), [{ move: null, pause: true }, null, null]);
  assert.deepEqual(s.drifts, [{ x: 2, y: 2, dir: 'right' }]);
});
