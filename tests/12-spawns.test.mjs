import test from 'node:test';
import assert from 'node:assert/strict';
import { game, play, mulberryInt } from './helpers.mjs';

// Spawns at (2,1), (4,1), and (6,1) in reading order; the player at (1,1).
const MAP = ['#########', '#@P.P.PM#', '#X......#', '#########'];

test('a patch respawns every spawnEvery level ticks when one is missing', async () => {
  const s0 = await game(MAP, { spawnEvery: 3 });
  const a = await play({ ...s0, patches: s0.patches.slice(1) }, ['down', null]);
  assert.equal(a.patches.length, 2);
  assert.deepEqual(a.events, []);
  const b = await play(a, [null]);
  assert.equal(b.patches.length, 3);
  assert.deepEqual(b.events, ['spawn']);
});

test('no spawn while every spawn point holds a patch', async () => {
  const s0 = await game(MAP, { spawnEvery: 1 });
  const a = await play(s0, ['down']);
  assert.equal(a.patches.length, 3);
  assert.deepEqual(a.events, []);
  assert.equal(a.seed, s0.seed);
});

test('the spawn point and colour come from the seed: point first, then colour', async () => {
  const s0 = await game(MAP, { spawnEvery: 1 });
  const s = { ...s0, patches: [] };
  const t = await play(s, [null]);
  const a = mulberryInt(s.seed, 3);
  const b = mulberryInt(a.seed, 4);
  const spots = [{ x: 2, y: 1 }, { x: 4, y: 1 }, { x: 6, y: 1 }];
  assert.deepEqual(t.patches, [{ ...spots[a.value], color: b.value }]);
  assert.equal(t.seed, b.seed);
});

test('the player\'s cell is not free', async () => {
  const s0 = await game(MAP, { spawnEvery: 1 });
  const s = { ...s0, patches: [{ x: 2, y: 1, color: 0 }, { x: 6, y: 1, color: 0 }], player: { x: 4, y: 1 } };
  const t = await play(s, [null]);
  assert.equal(t.patches.length, 2);
  assert.deepEqual(t.events, []);
  assert.equal(t.seed, s.seed);
});

test('a cell with a drift on it is not free', async () => {
  const s0 = await game(MAP, { spawnEvery: 1, driftPeriod: 99 });
  const s = { ...s0, patches: [{ x: 2, y: 1, color: 0 }, { x: 6, y: 1, color: 0 }], drifts: [{ x: 4, y: 1, dir: 'up' }], player: { x: 1, y: 2 } };
  const t = await play(s, [null]);
  assert.equal(t.patches.length, 2);
});

test('carried patches count against the spawn points', async () => {
  const s0 = await game(MAP, { spawnEvery: 1 });
  const s = { ...s0, patches: [{ x: 2, y: 1, color: 0 }, { x: 6, y: 1, color: 0 }], carried: [1] };
  const t = await play(s, [null]);
  assert.equal(t.patches.length, 2);
  assert.deepEqual(t.events, []);
});

test('the new patch is appended', async () => {
  const s0 = await game(MAP, { spawnEvery: 1 });
  const keep = { x: 4, y: 1, color: 2 };
  const t = await play({ ...s0, patches: [keep] }, ['down']);
  assert.deepEqual(t.patches[0], keep);
  assert.equal(t.patches.length, 2);
});

test('spawns follow levelTicks, not tick', async () => {
  const s0 = await game(MAP, { spawnEvery: 4 });
  const s = { ...s0, tick: 101, patches: [] };
  const a = await play(s, [null, null, null]);
  assert.equal(a.patches.length, 0);
  const b = await play(a, [null]);
  assert.equal(b.patches.length, 1);
});

test('at most one patch spawns per tick', async () => {
  const s0 = await game(MAP, { spawnEvery: 1 });
  const t = await play({ ...s0, patches: [] }, [null]);
  assert.equal(t.patches.length, 1);
});
