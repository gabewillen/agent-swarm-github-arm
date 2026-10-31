// Area 5 dev tests — invariants (DESIGN.md §8).
// Hand-built states, so these run without src/core/game.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkState } from '../src/core/invariants.js';
import { CARRY_MAX, START_LIVES, COLORS } from '../src/core/constants.js';

const TILES = ['#########', '#@P.M..X#', '#.>..P..#', '#########'];

// A valid state shaped like game.js's, without loading game.js.
function baseState() {
  return {
    seed: 1,
    tick: 0,
    levelTicks: 0,
    level: {
      name: 't', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000,
      width: 9, height: 4, tiles: TILES,
      start: { x: 1, y: 1 },
      spawns: [{ x: 2, y: 1 }, { x: 5, y: 2 }],
      drifts: [{ x: 2, y: 2, dir: 'right' }],
    },
    player: { x: 1, y: 1 },
    carried: [],
    patches: [
      { x: 2, y: 1, color: 0 },
      { x: 5, y: 2, color: 3 },
    ],
    drifts: [{ x: 2, y: 2, dir: 'right' }],
    conflicts: [],
    score: 0,
    lives: START_LIVES,
    merges: 0,
    open: false,
    invuln: 0,
    status: 'playing',
    paused: false,
    events: [],
  };
}

test('a valid state has no errors', () => {
  assert.deepEqual(checkState(baseState()), []);
});

test('mid-game valid states: every colour carried, full carry, spent lives', () => {
  const s = baseState();
  assert.deepEqual(checkState({ ...s, carried: [0, 1, 2], lives: 0, score: 123456, status: 'lost' }), []);
  assert.deepEqual(checkState({ ...s, carried: [3, 3, 3], status: 'won', open: true }), []);
});

test('bad_status for each illegitimate status and missing one', () => {
  for (const status of ['dancing', 'PLAYING', '', null, 7]) {
    assert.ok(checkState({ ...baseState(), status }).includes('bad_status'), status);
  }
  assert.ok(checkState({ ...baseState(), status: undefined }).includes('bad_status'));
});

test('player_in_wall: wall cell, off the map, non-integer cell', () => {
  const s = baseState();
  assert.ok(checkState({ ...s, player: { x: 0, y: 0 } }).includes('player_in_wall'));
  assert.ok(checkState({ ...s, player: { x: 50, y: 1 } }).includes('player_in_wall'));
  assert.ok(checkState({ ...s, player: { x: 1, y: 9 } }).includes('player_in_wall'));
  assert.ok(checkState({ ...s, player: { x: 1.5, y: 1 } }).includes('player_in_wall'));
});

test('carry_overflow at CARRY_MAX + 1 only', () => {
  const s = baseState();
  const carried = (n) => Array.from({ length: n }, (_, i) => i % COLORS);
  assert.deepEqual(checkState({ ...s, carried: carried(CARRY_MAX) }), []);
  assert.ok(checkState({ ...s, carried: carried(CARRY_MAX + 1) }).includes('carry_overflow'));
});

test('lives_range bounds', () => {
  const s = baseState();
  for (const lives of [-1, START_LIVES + 1, 1.5, NaN, '3', null, undefined]) {
    assert.ok(checkState({ ...s, lives }).includes('lives_range'), String(lives));
  }
  assert.deepEqual(checkState({ ...s, lives: 0 }), []);
  assert.deepEqual(checkState({ ...s, lives: START_LIVES }), []);
});

test('score_negative', () => {
  const s = baseState();
  for (const score of [-1, -100, 2.5]) {
    assert.ok(checkState({ ...s, score }).includes('score_negative'), String(score));
  }
  assert.deepEqual(checkState({ ...s, score: 999999999 }), []);
});

test('patch_off_spawn: off a spawn, off the map, missing coordinates', () => {
  const s = baseState();
  const any = checkState({ ...s, patches: [{ x: 3, y: 1, color: 0 }] });
  assert.ok(any.includes('patch_off_spawn'));
  assert.ok(!any.includes('bad_color'));
  assert.ok(checkState({ ...s, patches: [{ x: 0, y: 0, color: 1 }] }).includes('patch_off_spawn'));
  assert.ok(checkState({ ...s, patches: [{ x: -1, y: -1, color: 1 }] }).includes('patch_off_spawn'));
  assert.ok(checkState({ ...s, patches: [{}] }).includes('patch_off_spawn'));
});

test('patch_off_spawn reported once for many bad patches', () => {
  const s = baseState();
  const codes = checkState({ ...s, patches: [{ x: 0, y: 0, color: 1 }, { x: 3, y: 1, color: 2 }] });
  assert.equal(codes.filter((c) => c === 'patch_off_spawn').length, 1);
});

test('drift_in_wall: wall cell and off the map', () => {
  const s = baseState();
  assert.ok(checkState({ ...s, drifts: [{ x: 0, y: 2, dir: 'up' }] }).includes('drift_in_wall'));
  assert.ok(checkState({ ...s, drifts: [{ x: 9, y: 9, dir: 'up' }] }).includes('drift_in_wall'));
  assert.ok(checkState({ ...s, drifts: [{ x: 0, y: 2, dir: 'up' }, { x: 8, y: 8, dir: 'left' }] })
    .filter((c) => c === 'drift_in_wall').length === 1);
});

test('bad_color on carried and lying patches', () => {
  const s = baseState();
  assert.ok(checkState({ ...s, carried: [4] }).includes('bad_color'));
  assert.ok(checkState({ ...s, carried: [-1] }).includes('bad_color'));
  assert.ok(checkState({ ...s, carried: [1.5] }).includes('bad_color'));
  assert.ok(checkState({ ...s, patches: [{ x: 2, y: 1, color: -1 }] }).includes('bad_color'));
  assert.ok(checkState({ ...s, patches: [{ x: 2, y: 1, color: COLORS }] }).includes('bad_color'));
  assert.ok(checkState({ ...s, patches: [{ x: 2, y: 1 }] }).includes('bad_color'));
});

test('bad_color reported once even when carried and lying both fail', () => {
  const s = baseState();
  const codes = checkState({ ...s, carried: [9], patches: [{ x: 2, y: 1, color: -1 }] });
  assert.equal(codes.filter((c) => c === 'bad_color').length, 1);
});

test('codes come in the §8 table order', () => {
  const s = baseState();
  const codes = checkState({
    ...s, status: 'gone', player: { x: 0, y: 0 }, carried: [9, 9, 9, 9],
    lives: -2, score: -5, patches: [{ x: 0, y: 0, color: -1 }],
    drifts: [{ x: 0, y: 1, dir: 'left' }],
  });
  assert.deepEqual(codes, [
    'bad_status', 'player_in_wall', 'carry_overflow', 'lives_range',
    'score_negative', 'patch_off_spawn', 'drift_in_wall', 'bad_color',
  ]);
});

test('a state without a usable level skips terrain checks without crashing', () => {
  const s = baseState();
  const bare = {
    status: 'playing', player: { x: 1, y: 1 }, carried: [],
    patches: [], drifts: [], score: 0, lives: START_LIVES,
  };
  assert.deepEqual(checkState(bare), []);
  assert.deepEqual(checkState({ ...s, level: { ...s.level, tiles: undefined } }), []);
});

test('null and non-object states only say bad_status', () => {
  assert.deepEqual(checkState(null), ['bad_status']);
  assert.deepEqual(checkState(7), ['bad_status']);
});
