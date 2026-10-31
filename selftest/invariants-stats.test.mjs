// agent-42's own tests for src/core/invariants.js and src/core/stats.js.
// These are not part of the acceptance suite (they live outside tests/).
// They build game states by hand, following DESIGN.md §5 and §8, §22, so
// they run before src/core/game.js exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkState } from '../src/core/invariants.js';
import { statsInit, statsUpdate, statsLines } from '../src/core/stats.js';
import { CARRY_MAX, START_LIVES, COLORS } from '../src/core/constants.js';

// DESIGN.md §4's example map, parsed: '@', 'P', and drift chars become '.'.
const MAP = ['#########', '#@P.M..X#', '#.>..P..#', '#########'];
const level = {
  tiles: ['#########', '#...M..X#', '#.......#', '#########'],
  spawns: [{ x: 2, y: 1 }, { x: 5, y: 2 }],
};
const fresh = {
  seed: 1, tick: 0, levelTicks: 0,
  level, levelIndex: 0,
  player: { x: 1, y: 1 }, carried: [],
  patches: [{ x: 2, y: 1, color: 0 }, { x: 5, y: 2, color: 1 }],
  drifts: [{ x: 2, y: 2, dir: 'right' }],
  conflicts: [], score: 0, lives: START_LIVES, merges: 0, open: false,
  invuln: 0, status: 'playing', paused: false, events: [],
};

const check = (s) => checkState(s);

test('fresh state has no errors', () => {
  assert.deepEqual(check(fresh), []);
});

test('bad_status', () => {
  assert.ok(check({ ...fresh, status: 'dancing' }).includes('bad_status'));
  assert.ok(check({ ...fresh, status: 'lost' }).length === 0);
});

test('player_in_wall and off the map', () => {
  assert.ok(check({ ...fresh, player: { x: 0, y: 0 } }).includes('player_in_wall'));
  assert.ok(check({ ...fresh, player: { x: 50, y: 1 } }).includes('player_in_wall'));
  assert.ok(check({ ...fresh, player: { x: 3, y: 1 } }).length === 0); // floor
  assert.ok(check({ ...fresh, player: { x: 4, y: 1 } }).length === 0); // merge pad
});

test('carry_overflow', () => {
  assert.ok(check({ ...fresh, carried: [0, 1, 2, 3] }).includes('carry_overflow'));
  assert.ok(check({ ...fresh, carried: [0, 1, 2] }).length === 0);
});

test('lives_range', () => {
  assert.ok(check({ ...fresh, lives: -1 }).includes('lives_range'));
  assert.ok(check({ ...fresh, lives: START_LIVES + 1 }).includes('lives_range'));
  assert.ok(check({ ...fresh, lives: 1.5 }).includes('lives_range'));
  assert.ok(check({ ...fresh, lives: 0 }).length === 0);
});

test('score_negative', () => {
  assert.ok(check({ ...fresh, score: -10 }).includes('score_negative'));
  assert.ok(check({ ...fresh, score: 2.5 }).includes('score_negative'));
  assert.ok(check({ ...fresh, score: 12345 }).length === 0);
});

test('patch_off_spawn', () => {
  assert.ok(check({ ...fresh, patches: [{ x: 3, y: 1, color: 0 }] }).includes('patch_off_spawn'));
  assert.ok(check({ ...fresh, patches: [{ x: 2, y: 1, color: 0 }] }).length === 0);
});

test('drift_in_wall', () => {
  assert.ok(check({ ...fresh, drifts: [{ x: 0, y: 2, dir: 'up' }] }).includes('drift_in_wall'));
  assert.ok(check({ ...fresh, drifts: [{ x: 7, y: 1, dir: 'left' }] }).length === 0); // on the X
});

test('bad_color on carried and lying patches', () => {
  assert.ok(check({ ...fresh, carried: [4] }).includes('bad_color'));
  assert.ok(check({ ...fresh, carried: [-1] }).includes('bad_color'));
  assert.ok(check({ ...fresh, carried: [1.5] }).includes('bad_color'));
  assert.ok(check({ ...fresh, patches: [{ x: 2, y: 1, color: -1 }] }).includes('bad_color'));
  assert.ok(check({ ...fresh, patches: [{ x: 2, y: 1, color: COLORS - 1 }] }).length === 0);
});

test('valid mid-game state has no errors', () => {
  const s = { ...fresh, carried: [1, 2], score: 500, lives: 1, status: 'won' };
  assert.deepEqual(check(s), []);
});

test('checkState never changes its argument', () => {
  const s = { ...fresh, patches: [{ x: 9, y: 9 }] };
  const before = JSON.stringify(s);
  check(s);
  assert.equal(JSON.stringify(s), before);
});

// ---------- stats.js ----------

const ZERO = statsInit();
const s = { ...fresh }; // a stand-in prev state

test('statsInit is all zero', () => {
  assert.deepEqual(ZERO, { ticks: 0, moves: 0, pickups: 0, merges: 0, patchesMerged: 0, bestMerge: 0, hits: 0, drops: 0, conflicts: 0, levels: 0 });
});

test('a move counts a tick and a move', () => {
  const prev = { ...s, tick: 0, player: { x: 1, y: 1 } };
  const next = { ...s, tick: 1, player: { x: 2, y: 1 }, events: [] };
  assert.deepEqual(statsUpdate(ZERO, prev, next, { move: 'right', pause: false }), { ...ZERO, ticks: 1, moves: 1 });
});

test('a step that stays put counts a tick but no move', () => {
  const prev = { ...s, tick: 4, player: { x: 2, y: 2 } };
  const next = { ...s, tick: 5, player: { x: 2, y: 2 }, events: [] };
  assert.deepEqual(statsUpdate(ZERO, prev, next, { move: 'up', pause: false }), { ...ZERO, ticks: 1 });
});

test('no tick passed, no move counted', () => {
  const prev = { ...s, tick: 3, player: { x: 1, y: 1 }, events: [] };
  const next = { ...s, tick: 3, player: { x: 2, y: 1 }, events: [] };
  assert.deepEqual(statsUpdate(ZERO, prev, next, { move: 'right', pause: false }), ZERO);
});

test('a pause step counts nothing', () => {
  const prev = { ...s, tick: 0, player: { x: 1, y: 1 }, events: [] };
  const next = { ...s, tick: 0, player: { x: 1, y: 1 }, events: ['pause'] };
  assert.deepEqual(statsUpdate(ZERO, prev, next, { move: 'right', pause: true }), ZERO);
});

test('events are counted', () => {
  const prev = { ...s, tick: 0, player: { x: 1, y: 1 }, events: [] };
  const next = { ...s, tick: 1, player: { x: 1, y: 1 }, events: ['pickup', 'conflict', 'conflict', 'drop', 'hit', 'level'] };
  assert.deepEqual(statsUpdate(ZERO, prev, next, { move: null, pause: false }),
    { ...ZERO, ticks: 1, pickups: 1, conflicts: 2, drops: 1, hits: 1, levels: 1 });
});

test('a merge counts its patches and the best merge', () => {
  let st = statsUpdate(ZERO, { ...s, tick: 0, carried: [0, 1] }, { ...s, tick: 1, events: ['merge'] }, { move: null, pause: false });
  st = statsUpdate(st, { ...s, tick: 1, carried: [3] }, { ...s, tick: 2, events: ['merge', 'won'] }, { move: null, pause: false });
  assert.equal(st.merges, 2);
  assert.equal(st.patchesMerged, 3);
  assert.equal(st.bestMerge, 2);
  assert.equal(st.levels, 1);
});

test('statsUpdate does not change its argument', () => {
  const frozen = Object.freeze(statsInit());
  const prev = { ...s, tick: 0, player: { x: 1, y: 1 }, events: [] };
  const next = { ...s, tick: 1, player: { x: 1, y: 1 }, events: ['pickup'] };
  statsUpdate(frozen, prev, next, { move: null, pause: false });
  assert.deepEqual(frozen, ZERO);
});

test('statsLines', () => {
  assert.deepEqual(statsLines({ ...ZERO, moves: 12, merges: 3, bestMerge: 3, hits: 1, levels: 2 }),
    ['MOVES 12', 'MERGES 3', 'BEST 3', 'HITS 1', 'LEVELS 2']);
});
