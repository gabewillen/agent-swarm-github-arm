// Area 5 dev tests — statistics (DESIGN.md §22).
// Synthetic states, so these run without src/core/game.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { statsInit, statsUpdate, statsLines } from '../src/core/stats.js';

const ZERO = statsInit();
const R = { move: 'right', pause: false };
const STILL = { move: null, pause: false };

// prev/next pairs built by hand.
function at(x, y) { return { x, y }; }
const PREV0 = { tick: 0, player: at(1, 1), carried: [] };
const NEXT = (over = {}) => ({ tick: 1, player: at(1, 1), events: [], ...over });

test('statsInit is all zero in §22 order', () => {
  assert.deepEqual(Object.entries(statsInit()), [
    ['ticks', 0], ['moves', 0], ['pickups', 0], ['merges', 0], ['patchesMerged', 0],
    ['bestMerge', 0], ['hits', 0], ['drops', 0], ['conflicts', 0], ['levels', 0],
  ]);
});

test('a move counts a tick and a move', () => {
  const n = NEXT({ player: at(2, 1) });
  assert.deepEqual(statsUpdate(ZERO, PREV0, n, R), { ...ZERO, ticks: 1, moves: 1 });
});

test('a blocked move counts a tick but no move', () => {
  assert.deepEqual(statsUpdate(ZERO, PREV0, NEXT(), R), { ...ZERO, ticks: 1 });
});

test('a pause step counts nothing', () => {
  const input = { move: 'right', pause: true };
  const n = { ...NEXT({ player: at(2, 1) }), tick: 0, events: ['pause'] };
  assert.deepEqual(statsUpdate(statsInit(), PREV0, n, input), ZERO);
});

test('a status-settled step (no tick) counts nothing even with grand movement', () => {
  const n = { ...NEXT({ player: at(7, 7) }), tick: 0 };
  assert.deepEqual(statsUpdate(statsInit(), PREV0, n, R), ZERO);
});

test('a diagonal jump is not a move', () => {
  const n = NEXT({ player: at(2, 2) });
  assert.deepEqual(statsUpdate(statsInit(), PREV0, n, R), { ...ZERO, ticks: 1 });
});

test('statsUpdate keeps and folds an existing table', () => {
  const had = { ...ZERO, ticks: 10, moves: 4, hits: 1, bestMerge: 2 };
  const n = NEXT({ player: at(2, 1), events: ['pickup'] });
  assert.deepEqual(statsUpdate(had, PREV0, n, R), { ...had, ticks: 11, moves: 5, pickups: 1 });
});

test('event tallies count repeats', () => {
  const n = NEXT({ events: ['pickup', 'conflict', 'conflict', 'drop', 'hit', 'level', 'spawn'] });
  assert.deepEqual(statsUpdate(statsInit(), PREV0, n, STILL),
    { ...ZERO, ticks: 1, pickups: 1, conflicts: 2, drops: 1, hits: 1, levels: 1 });
});

test('merge tallies patches and best merge from prev.carried', () => {
  let st = statsUpdate(statsInit(), { ...PREV0, carried: [0, 1] },
    NEXT({ events: ['merge'] }), STILL);
  assert.deepEqual(st, { ...ZERO, ticks: 1, merges: 1, patchesMerged: 2, bestMerge: 2 });
  st = statsUpdate(st, { ...PREV0, tick: 1, carried: [3] },
    NEXT({ tick: 2, events: ['merge', 'won'] }), STILL);
  assert.equal(st.merges, 2);
  assert.equal(st.patchesMerged, 3);
  assert.equal(st.bestMerge, 2);
  assert.equal(st.levels, 1);
});

test('a merge of one patch raises bestMerge to 1', () => {
  const st = statsUpdate(statsInit(), { ...PREV0, carried: [0] },
    NEXT({ events: ['merge', 'quorum'] }), STILL);
  assert.equal(st.bestMerge, 1);
  assert.deepEqual(st, { ...ZERO, ticks: 1, merges: 1, patchesMerged: 1, bestMerge: 1 });
});

test('levels counts level and won events together', () => {
  const n = NEXT({ events: ['level', 'won'] });
  assert.equal(statsUpdate(statsInit(), PREV0, n, STILL).levels, 2);
});

test('won counts as a level, plain steps do not', () => {
  assert.equal(statsUpdate(statsInit(), PREV0, NEXT({ events: ['won'] }), STILL).levels, 1);
  assert.equal(statsUpdate(statsInit(), PREV0, NEXT({ events: ['quorum'] }), STILL).levels, 0);
});

test('statsUpdate does not change its argument', () => {
  const frozen = Object.freeze(statsInit());
  statsUpdate(frozen, PREV0, NEXT({ events: ['pickup'] }), STILL);
  assert.deepEqual(frozen, ZERO);
});

test('statsUpdate works when the stats argument is missing', () => {
  const st = statsUpdate(undefined, PREV0, NEXT({ events: ['hit'] }), STILL);
  assert.deepEqual(st, { ...ZERO, ticks: 1, hits: 1 });
});

test('missing prev/next pieces do not crash', () => {
  assert.deepEqual(statsUpdate(undefined, null, null, null), ZERO);
  assert.deepEqual(statsUpdate(undefined, {}, { events: ['won'] }, {}), { ...ZERO, levels: 1 });
});

test('statsLines renders the five lines', () => {
  assert.deepEqual(
    statsLines({ ...ZERO, moves: 12, merges: 3, bestMerge: 3, hits: 1, levels: 2 }),
    ['MOVES 12', 'MERGES 3', 'BEST 3', 'HITS 1', 'LEVELS 2'],
  );
  assert.deepEqual(statsLines(ZERO), ['MOVES 0', 'MERGES 0', 'BEST 0', 'HITS 0', 'LEVELS 0']);
  assert.deepEqual(statsLines(undefined), ['MOVES 0', 'MERGES 0', 'BEST 0', 'HITS 0', 'LEVELS 0']);
});
