import test from 'node:test';
import assert from 'node:assert/strict';
import { game, play } from './helpers.mjs';

const OPEN = ['#######', '#.....#', '#..@..#', '#.....#', '#P...M#', '#X....#', '#######'];

test('moves up, right, down, left one cell', async () => {
  const s = await game(OPEN);
  assert.deepEqual((await play(s, ['up'])).player, { x: 3, y: 1 });
  assert.deepEqual((await play(s, ['right'])).player, { x: 4, y: 2 });
  assert.deepEqual((await play(s, ['down'])).player, { x: 3, y: 3 });
  assert.deepEqual((await play(s, ['left'])).player, { x: 2, y: 2 });
});

test('a null move stays put and still ticks', async () => {
  const s = await play(await game(OPEN), [null]);
  assert.deepEqual(s.player, { x: 3, y: 2 });
  assert.equal(s.tick, 1);
  assert.equal(s.levelTicks, 1);
});

test('a missing or null input means no move', async () => {
  const { step } = await import('../src/core/game.js');
  const s = await game(OPEN);
  assert.deepEqual(step(s, undefined).player, { x: 3, y: 2 });
  assert.deepEqual(step(s, null).player, { x: 3, y: 2 });
  assert.deepEqual(step(s, {}).player, { x: 3, y: 2 });
});

test('walls block', async () => {
  const s = await play(await game(OPEN), ['up', 'up', 'up']);
  assert.deepEqual(s.player, { x: 3, y: 1 });
});

test('the player walks along a corridor', async () => {
  const s = await play(await game(OPEN), ['right', 'right', 'right', 'up']);
  assert.deepEqual(s.player, { x: 5, y: 1 });
});

test('a closed exit blocks the player', async () => {
  const s = await game(['######', '#@X.M#', '#P...#', '######']);
  assert.deepEqual((await play(s, ['right'])).player, { x: 1, y: 1 });
});

test('a closed hold blocks the player', async () => {
  const s = await game(['######', '#@H.M#', '#P..X#', '######']);
  assert.deepEqual((await play(s, ['right'])).player, { x: 1, y: 1 });
});

test('an open hold lets the player through', async () => {
  const s = await game(['#######', '#PM@H.#', '#....X#', '#######']);
  const t = await play(s, ['left', 'left', 'right', 'right', 'right']);
  assert.equal(t.open, true);
  assert.deepEqual(t.player, { x: 4, y: 1 });
});

test('tick counts each playing step', async () => {
  const s = await play(await game(OPEN), ['up', null, 'left', 'down', 'right']);
  assert.equal(s.tick, 5);
  assert.equal(s.levelTicks, 5);
});

test('the player can walk onto a merge pad empty-handed', async () => {
  const s = await play(await game(OPEN), ['down', 'down', 'right', 'right']);
  assert.deepEqual(s.player, { x: 5, y: 4 });
  assert.equal(s.score, 0);
  assert.deepEqual(s.events, []);
});
