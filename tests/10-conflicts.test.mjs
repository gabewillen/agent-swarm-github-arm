import test from 'node:test';
import assert from 'node:assert/strict';
import { game, play } from './helpers.mjs';

// Two drifts that meet head-on at (4,2) after one tick.
const MEET = ['#########', '#@P.M..X#', '#..>.<..#', '#.......#', '#########'];

test('two drifts meeting on a cell leave a conflict', async () => {
  const s = await play(await game(MEET), [null]);
  assert.deepEqual(s.conflicts, [{ x: 4, y: 2, ttl: 10 }]);
  assert.deepEqual(s.events, ['conflict']);
});

test('colliding drifts reverse direction', async () => {
  const s = await play(await game(MEET), [null]);
  assert.deepEqual(s.drifts, [{ x: 4, y: 2, dir: 'left' }, { x: 4, y: 2, dir: 'right' }]);
});

test('conflicts age by one each tick', async () => {
  const s = await play(await game(MEET, { driftPeriod: 50 }), []);
  const t = await play({ ...s, conflicts: [{ x: 6, y: 3, ttl: 4 }] }, [null, null]);
  assert.deepEqual(t.conflicts, [{ x: 6, y: 3, ttl: 2 }]);
});

test('a conflict vanishes when its ttl reaches 0', async () => {
  const s = await game(MEET, { driftPeriod: 50 });
  const t = await play({ ...s, conflicts: [{ x: 6, y: 3, ttl: 2 }] }, [null, null]);
  assert.deepEqual(t.conflicts, []);
});

test('conflicts do not age while paused', async () => {
  const s = await game(MEET, { driftPeriod: 50 });
  const t = await play({ ...s, conflicts: [{ x: 6, y: 3, ttl: 4 }] }, [{ move: null, pause: true }, null]);
  assert.deepEqual(t.conflicts, [{ x: 6, y: 3, ttl: 4 }]);
});

test('a conflict blocks the player', async () => {
  const s = await game(MEET, { driftPeriod: 50 });
  const t = await play({ ...s, conflicts: [{ x: 2, y: 1, ttl: 5 }] }, ['right']);
  assert.deepEqual(t.player, { x: 1, y: 1 });
  assert.deepEqual(t.carried, []);
});

test('a conflict blocks drifts, which turn', async () => {
  const s = await game(['#########', '#@P.M..X#', '#..>....#', '#.......#', '#########']);
  const t = await play({ ...s, conflicts: [{ x: 4, y: 2, ttl: 5 }] }, [null]);
  assert.deepEqual(t.drifts, [{ x: 3, y: 3, dir: 'down' }]);
});

test('a conflict that ages away frees its cell for a new one', async () => {
  const s = await game(MEET);
  const t = await play({ ...s, conflicts: [{ x: 4, y: 2, ttl: 1 }] }, [null]);
  assert.deepEqual(t.conflicts, [{ x: 4, y: 2, ttl: 10 }]);
});

test('three drifts on one cell make one conflict and one event', async () => {
  const s = await play(await game(['#########', '#@P.M..X#', '#..>.<..#', '#...^...#', '#.......#', '#########']), [null]);
  assert.deepEqual(s.conflicts, [{ x: 4, y: 2, ttl: 10 }]);
  assert.deepEqual(s.events, ['conflict']);
  assert.deepEqual(s.drifts.map((d) => d.dir), ['left', 'right', 'down']);
});

test('collisions in two cells are handled in reading order', async () => {
  const s = await play(await game(['###########', '#@P.M....X#', '#.>.<.....#', '#.....>.<.#', '#.........#', '###########']), [null]);
  assert.deepEqual(s.conflicts, [{ x: 3, y: 2, ttl: 10 }, { x: 7, y: 3, ttl: 10 }]);
  assert.deepEqual(s.events, ['conflict', 'conflict']);
});

test('no collision check on ticks when drifts did not move', async () => {
  const s0 = await game(MEET, { driftPeriod: 2 });
  const stacked = { ...s0, drifts: [{ x: 4, y: 3, dir: 'left' }, { x: 4, y: 3, dir: 'right' }] };
  const t = await play(stacked, [null]);
  assert.deepEqual(t.conflicts, []);
  assert.deepEqual(t.events, []);
});

test('drifts stacked on a conflict cell reverse but add no second conflict', async () => {
  const s0 = await game(['#######', '#@PMX.#', '#######', '###.###', '#######']);
  const s = { ...s0, drifts: [{ x: 3, y: 3, dir: 'up' }, { x: 3, y: 3, dir: 'down' }], conflicts: [{ x: 3, y: 3, ttl: 5 }] };
  const t = await play(s, [null]);
  assert.deepEqual(t.conflicts, [{ x: 3, y: 3, ttl: 4 }]);
  assert.deepEqual(t.drifts, [{ x: 3, y: 3, dir: 'down' }, { x: 3, y: 3, dir: 'up' }]);
  assert.deepEqual(t.events, ['conflict']);
});
