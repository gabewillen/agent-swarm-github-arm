import test from 'node:test';
import assert from 'node:assert/strict';
import { game, play } from './helpers.mjs';

const MAP = ['#########', '#@P.M..X#', '#.>.....#', '#########'];
const P = { move: null, pause: true };

test('pause flips paused with a pause event', async () => {
  const s = await play(await game(MAP), [P]);
  assert.equal(s.paused, true);
  assert.deepEqual(s.events, ['pause']);
});

test('pausing again resumes with a resume event', async () => {
  const s = await play(await game(MAP), [P, P]);
  assert.equal(s.paused, false);
  assert.deepEqual(s.events, ['resume']);
});

test('a pause step does not tick or move', async () => {
  const s = await play(await game(MAP), [{ move: 'right', pause: true }]);
  assert.equal(s.tick, 0);
  assert.deepEqual(s.player, { x: 1, y: 1 });
});

test('while paused nothing moves and no tick passes', async () => {
  const s0 = await game(MAP);
  const s = await play(s0, [P, 'right', 'right']);
  assert.equal(s.tick, 0);
  assert.deepEqual(s.player, s0.player);
  assert.deepEqual(s.drifts, s0.drifts);
  assert.deepEqual(s.events, []);
});

test('play continues after resume', async () => {
  const s = await play(await game(MAP), [P, 'right', P, 'right']);
  assert.equal(s.tick, 1);
  assert.deepEqual(s.player, { x: 2, y: 1 });
});

test('events hold only the last step\'s events', async () => {
  const s = await play(await game(MAP), ['right', 'left']);
  assert.deepEqual(s.events, []);
});
