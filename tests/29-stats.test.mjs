import test from 'node:test';
import assert from 'node:assert/strict';
import { load, game, mv } from './helpers.mjs';

const stats = () => load('core/stats.js');
const ZERO = { ticks: 0, moves: 0, pickups: 0, merges: 0, patchesMerged: 0, bestMerge: 0, hits: 0, drops: 0, conflicts: 0, levels: 0 };

test('statsInit is all zero', async () => {
  assert.deepEqual((await stats()).statsInit(), ZERO);
});

test('a move counts a tick and a move', async () => {
  const { statsInit, statsUpdate } = await stats();
  const { step } = await load('core/game.js');
  const s = await game(['#######', '#@.P.M#', '#..X..#', '#######']);
  const n = step(s, mv('right'));
  assert.deepEqual(statsUpdate(statsInit(), s, n, mv('right')), { ...ZERO, ticks: 1, moves: 1 });
});

test('a blocked move counts a tick but no move', async () => {
  const { statsInit, statsUpdate } = await stats();
  const { step } = await load('core/game.js');
  const s = await game(['#######', '#@.P.M#', '#..X..#', '#######']);
  const n = step(s, mv('up'));
  assert.deepEqual(statsUpdate(statsInit(), s, n, mv('up')), { ...ZERO, ticks: 1 });
});

test('a pause step counts nothing', async () => {
  const { statsInit, statsUpdate } = await stats();
  const { step } = await load('core/game.js');
  const s = await game(['#######', '#@.P.M#', '#..X..#', '#######']);
  const input = { move: 'right', pause: true };
  assert.deepEqual(statsUpdate(statsInit(), s, step(s, input), input), ZERO);
});

test('events are counted', async () => {
  const { statsInit, statsUpdate } = await stats();
  const s = await game(['#######', '#@.P.M#', '#..X..#', '#######']);
  const n = { ...s, tick: 1, events: ['pickup', 'conflict', 'conflict', 'drop', 'hit', 'level'] };
  assert.deepEqual(statsUpdate(statsInit(), s, n, mv(null)), { ...ZERO, ticks: 1, pickups: 1, conflicts: 2, drops: 1, hits: 1, levels: 1 });
});

test('a merge counts its patches and the best merge', async () => {
  const { statsInit, statsUpdate } = await stats();
  const s = await game(['#######', '#@.P.M#', '#..X..#', '#######']);
  let st = statsUpdate(statsInit(), { ...s, carried: [0, 1] }, { ...s, tick: 1, events: ['merge'] }, mv(null));
  st = statsUpdate(st, { ...s, tick: 1, carried: [3] }, { ...s, tick: 2, events: ['merge', 'won'] }, mv(null));
  assert.equal(st.merges, 2);
  assert.equal(st.patchesMerged, 3);
  assert.equal(st.bestMerge, 2);
  assert.equal(st.levels, 1);
});

test('statsUpdate does not change its argument', async () => {
  const { statsInit, statsUpdate } = await stats();
  const s = await game(['#######', '#@.P.M#', '#..X..#', '#######']);
  const st = Object.freeze(statsInit());
  statsUpdate(st, s, { ...s, tick: 1, events: ['pickup'] }, mv(null));
  assert.deepEqual(st, ZERO);
});

test('statsLines', async () => {
  const { statsLines } = await stats();
  assert.deepEqual(statsLines({ ...ZERO, moves: 12, merges: 3, bestMerge: 3, hits: 1, levels: 2 }), ['MOVES 12', 'MERGES 3', 'BEST 3', 'HITS 1', 'LEVELS 2']);
});
