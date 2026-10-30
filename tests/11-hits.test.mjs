import test from 'node:test';
import assert from 'node:assert/strict';
import { game, play } from './helpers.mjs';

// A drift two cells east of the player, walking west.
const LANE = ['#########', '#@.<P.MX#', '#.......#', '#########'];

test('a drift reaching the empty-handed player costs a life', async () => {
  const s = await play(await game(LANE), [null]);
  assert.equal(s.lives, 3);
  const t = await play(s, [null]);
  assert.equal(t.lives, 2);
  assert.deepEqual(t.events, ['hit']);
});

test('after a hit the player returns to the start with invuln', async () => {
  const s = await play(await game(LANE), [null, null]);
  assert.deepEqual(s.player, { x: 1, y: 1 });
  assert.equal(s.invuln, 6);
});

test('walking into a drift is a hit', async () => {
  const s = await play(await game(LANE, { driftPeriod: 100 }), ['right', 'right']);
  assert.equal(s.lives, 2);
  assert.deepEqual(s.player, { x: 1, y: 1 });
});

test('swapping cells with a drift is a hit', async () => {
  // the player (2,1) steps east to (3,1) while the drift (3,1) steps west to (2,1)
  const u = await play(await game(['#########', '#.@<P.MX#', '#.......#', '#########']), ['right']);
  assert.equal(u.lives, 2);
  assert.deepEqual(u.events, ['hit']);
  assert.deepEqual(u.player, { x: 2, y: 1 });
});

test('moving onto the cell a drift is leaving is no hit', async () => {
  // the drift (3,1) faces up into a wall and turns east to (4,1); the player follows to (3,1)
  const u = await play(await game(['#########', '#.@^..MX#', '#P......#', '#########']), ['right']);
  assert.equal(u.lives, 3);
  assert.deepEqual(u.player, { x: 3, y: 1 });
});

test('carrying patches, a hit drops them instead of a life', async () => {
  const s0 = await game(['#########', '#@P..<MX#', '#.......#', '#########']);
  const s = await play(s0, ['right', null, null]);
  assert.equal(s.lives, 3);
  assert.deepEqual(s.carried, []);
  assert.equal(s.invuln, 6);
  assert.deepEqual(s.events, ['drop']);
  assert.deepEqual(s.player, { x: 2, y: 1 });
});

test('dropped patches are gone, not put back', async () => {
  const s0 = await game(['#########', '#@P..<MX#', '#.......#', '#########']);
  const s = await play(s0, ['right', null, null]);
  assert.deepEqual(s.patches, []);
});

test('invuln counts down and blocks hits meanwhile', async () => {
  const s0 = await game(LANE, { driftPeriod: 100 });
  const s = await play({ ...s0, invuln: 3 }, ['right', 'right']);
  assert.equal(s.lives, 3);
  assert.equal(s.invuln, 1);
  assert.deepEqual(s.player, { x: 3, y: 1 });
});

test('a hit lands once invuln is spent', async () => {
  const s0 = await game(LANE, { driftPeriod: 100 });
  const s = await play({ ...s0, invuln: 1 }, ['right', 'right']);
  assert.equal(s.lives, 2);
});

test('losing the last life ends the game', async () => {
  const s0 = await game(LANE);
  const s = await play({ ...s0, lives: 1 }, [null, null]);
  assert.equal(s.lives, 0);
  assert.equal(s.status, 'lost');
  assert.deepEqual(s.events, ['hit', 'lost']);
});

test('a lost game no longer changes', async () => {
  const s0 = await game(LANE);
  const s = await play({ ...s0, lives: 1 }, [null, null]);
  const t = await play(s, ['down', null]);
  assert.deepEqual(t, { ...s, events: [] });
});

test('a drift elsewhere is no hit', async () => {
  const s = await play(await game(['#########', '#@P.M..X#', '#.....<.#', '#########']), [null, null, null]);
  assert.equal(s.lives, 3);
  assert.deepEqual(s.events, []);
});
