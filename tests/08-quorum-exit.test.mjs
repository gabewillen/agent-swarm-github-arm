import test from 'node:test';
import assert from 'node:assert/strict';
import { load, lvl, play } from './helpers.mjs';

// Start (1,1), patches (2,1) and (3,1), pad (4,1), hold (5,1), exit (6,1).
const A = lvl(['########', '#@PPMHX#', '#......#', '########'], { name: 'a', quorum: 2, par: 50 });
const B = lvl(['#######', '#.@P.M#', '#..X..#', '#######'], { name: 'b', quorum: 1, par: 40 });

const start = async (levels = [A, B]) => (await load('core/game.js')).init(5, { levels });

test('reaching the quorum opens the level with a quorum event', async () => {
  const s = await play(await start(), ['right', 'right', 'right']);
  assert.equal(s.open, true);
  assert.deepEqual(s.events, ['merge', 'quorum']);
});

test('below the quorum the level stays closed', async () => {
  const s0 = await start();
  const s = await play({ ...s0, patches: s0.patches.slice(0, 1) }, ['right', 'right', 'right']);
  assert.equal(s.merges, 1);
  assert.equal(s.open, false);
  assert.deepEqual(s.events, ['merge']);
});

test('quorum fires once', async () => {
  const s0 = await start();
  const a = await play(s0, ['right', 'right', 'right']);
  const b = await play({ ...a, patches: [{ x: 3, y: 1, color: 0 }] }, ['left', 'right']);
  assert.deepEqual(b.events, ['merge']);
  assert.equal(b.merges, 3);
});

test('an open exit ships the level and loads the next', async () => {
  const s = await play(await start(), ['right', 'right', 'right', 'right', 'right']);
  assert.equal(s.levelIndex, 1);
  assert.equal(s.level.name, 'b');
  assert.deepEqual(s.player, { x: 2, y: 1 });
  assert.deepEqual(s.events, ['level']);
});

test('the time bonus is (par - levelTicks) * 10', async () => {
  const s = await play(await start(), ['right', 'right', 'right', 'right', 'right']);
  assert.equal(s.score, 400 + (50 - 5) * 10);
});

test('no time bonus past par', async () => {
  const slow = lvl(A.map, { name: 'a', quorum: 2, par: 3 });
  const s = await play(await start([slow, B]), ['right', 'right', 'right', 'right', 'right']);
  assert.equal(s.score, 400);
});

test('a new level resets the per-level fields and keeps score, lives, and tick', async () => {
  const s = await play(await start(), ['right', 'right', 'right', 'right', 'right']);
  assert.equal(s.merges, 0);
  assert.equal(s.open, false);
  assert.deepEqual(s.carried, []);
  assert.deepEqual(s.conflicts, []);
  assert.equal(s.levelTicks, 0);
  assert.equal(s.tick, 5);
  assert.equal(s.lives, 3);
  assert.equal(s.invuln, 0);
  assert.equal(s.patches.length, 1);
  assert.deepEqual([s.patches[0].x, s.patches[0].y], [3, 1]);
});

test('the last level\'s exit wins the game', async () => {
  const s = await play(await start([A]), ['right', 'right', 'right', 'right', 'right']);
  assert.equal(s.status, 'won');
  assert.deepEqual(s.events, ['won']);
  assert.equal(s.score, 400 + 450);
});

test('a won game no longer changes', async () => {
  const { step } = await load('core/game.js');
  const s = await play(await start([A]), ['right', 'right', 'right', 'right', 'right']);
  const t = step(s, { move: 'left', pause: false });
  assert.deepEqual(t, { ...s, events: [] });
});

test('the exit ends the step before drifts move', async () => {
  const withDrift = lvl(['########', '#@PPMHX#', '#.....<#', '########'], { name: 'a', quorum: 2, par: 50 });
  const s = await play(await start([withDrift, B]), ['right', 'right', 'right', 'right', 'right']);
  assert.equal(s.levelIndex, 1);
  assert.deepEqual(s.drifts, []);
});

test('the new level draws fresh patch colours from the running seed', async () => {
  const { rngInt } = await load('core/rng.js');
  const a = await play(await start(), ['right', 'right', 'right', 'right']);
  const b = await play(a, ['right']);
  assert.equal(b.patches[0].color, rngInt(a.seed, 4).value);
});
