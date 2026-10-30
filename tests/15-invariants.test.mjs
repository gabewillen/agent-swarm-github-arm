import test from 'node:test';
import assert from 'node:assert/strict';
import { load, game } from './helpers.mjs';

const MAP = ['#########', '#@P.M..X#', '#.>..P..#', '#########'];
const check = async (s) => (await load('core/invariants.js')).checkState(s);

test('a fresh state has no errors', async () => {
  assert.deepEqual(await check(await game(MAP)), []);
});

test('bad_status', async () => {
  assert.ok((await check({ ...(await game(MAP)), status: 'dancing' })).includes('bad_status'));
});

test('player_in_wall and off the map', async () => {
  const s = await game(MAP);
  assert.ok((await check({ ...s, player: { x: 0, y: 0 } })).includes('player_in_wall'));
  assert.ok((await check({ ...s, player: { x: 50, y: 1 } })).includes('player_in_wall'));
});

test('carry_overflow', async () => {
  assert.ok((await check({ ...(await game(MAP)), carried: [0, 1, 2, 3] })).includes('carry_overflow'));
});

test('lives_range', async () => {
  const s = await game(MAP);
  assert.ok((await check({ ...s, lives: -1 })).includes('lives_range'));
  assert.ok((await check({ ...s, lives: 4 })).includes('lives_range'));
  assert.ok((await check({ ...s, lives: 1.5 })).includes('lives_range'));
});

test('score_negative', async () => {
  const s = await game(MAP);
  assert.ok((await check({ ...s, score: -10 })).includes('score_negative'));
  assert.ok((await check({ ...s, score: 2.5 })).includes('score_negative'));
});

test('patch_off_spawn', async () => {
  assert.ok((await check({ ...(await game(MAP)), patches: [{ x: 3, y: 1, color: 0 }] })).includes('patch_off_spawn'));
});

test('drift_in_wall', async () => {
  assert.ok((await check({ ...(await game(MAP)), drifts: [{ x: 0, y: 2, dir: 'up' }] })).includes('drift_in_wall'));
});

test('bad_color on carried and lying patches', async () => {
  const s = await game(MAP);
  assert.ok((await check({ ...s, carried: [4] })).includes('bad_color'));
  assert.ok((await check({ ...s, patches: [{ x: 2, y: 1, color: -1 }] })).includes('bad_color'));
});

test('a valid mid-game state has no errors', async () => {
  const s = await game(MAP);
  assert.deepEqual(await check({ ...s, carried: [1, 2], score: 500, lives: 1, status: 'won' }), []);
});
