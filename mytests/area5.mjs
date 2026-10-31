// Agent-29's own checks for area 5 (not part of tests/). Builds states by
// hand in §5's shape — the acceptance tests can't build them until
// src/core/game.js lands — and mirrors tests 15 and 29's expectations.
import assert from 'node:assert/strict';
import { checkState } from '../src/core/invariants.js';
import { statsInit, statsUpdate, statsLines } from '../src/core/stats.js';

// MAP from tests/15: '#@P.M..X#' / '#.>..P..#' → player (1,1), spawns
// (2,1) and (5,2), drift at (2,2) facing right.
const level = {
  name: 'test', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000,
  width: 9, height: 4,
  tiles: ['#########', '#@P.M..X#', '#.>..P..#', '#########'],
  start: { x: 1, y: 1 },
  spawns: [{ x: 2, y: 1 }, { x: 5, y: 2 }],
  drifts: [{ x: 2, y: 2, dir: 'right' }],
};
const fresh = {
  seed: 1, tick: 0, levelTicks: 0, levels: [{}], levelIndex: 0, level,
  player: { x: 1, y: 1 },
  carried: [],
  patches: [{ x: 2, y: 1, color: 0 }, { x: 5, y: 2, color: 3 }],
  drifts: [{ x: 2, y: 2, dir: 'right' }],
  conflicts: [], score: 0, lives: 3, merges: 0, open: false, invuln: 0,
  status: 'playing', paused: false, events: [],
};
const check = (s) => checkState(s);

assert.deepEqual(check(fresh), []);
assert.ok(check({ ...fresh, status: 'dancing' }).includes('bad_status'));
assert.ok(check({ ...fresh, player: { x: 0, y: 0 } }).includes('player_in_wall'));
assert.ok(check({ ...fresh, player: { x: 50, y: 1 } }).includes('player_in_wall'));
assert.ok(check({ ...fresh, carried: [0, 1, 2, 3] }).includes('carry_overflow'));
assert.ok(check({ ...fresh, lives: -1 }).includes('lives_range'));
assert.ok(check({ ...fresh, lives: 4 }).includes('lives_range'));
assert.ok(check({ ...fresh, lives: 1.5 }).includes('lives_range'));
assert.ok(check({ ...fresh, score: -10 }).includes('score_negative'));
assert.ok(check({ ...fresh, score: 2.5 }).includes('score_negative'));
assert.ok(check({ ...fresh, patches: [{ x: 3, y: 1, color: 0 }] }).includes('patch_off_spawn'));
assert.ok(check({ ...fresh, drifts: [{ x: 0, y: 2, dir: 'up' }] }).includes('drift_in_wall'));
assert.ok(check({ ...fresh, carried: [4] }).includes('bad_color'));
assert.ok(check({ ...fresh, patches: [{ x: 2, y: 1, color: -1 }] }).includes('bad_color'));
assert.deepEqual(check({ ...fresh, carried: [1, 2], score: 500, lives: 1, status: 'won' }), []);

// §22 with hand-built prev/next pairs.
const ZERO = statsInit();
assert.deepEqual(ZERO, {
  ticks: 0, moves: 0, pickups: 0, merges: 0, patchesMerged: 0, bestMerge: 0,
  hits: 0, drops: 0, conflicts: 0, levels: 0,
});

const base = { ...fresh, tick: 0 };
const mv = (move) => ({ move, pause: false });

// A move counts a tick and a move.
let n = { ...base, tick: 1, player: { x: 2, y: 1 }, events: [] };
assert.deepEqual(statsUpdate(statsInit(), base, n, mv('right')), { ...ZERO, ticks: 1, moves: 1 });

// A blocked move counts a tick but no move.
let n2 = { ...base, tick: 1, player: { x: 1, y: 1 } };
assert.deepEqual(statsUpdate(statsInit(), base, n2, mv('up')), { ...ZERO, ticks: 1 });

// A pause step counts nothing.
let n3 = { ...base, tick: 0, paused: true, events: ['pause'] };
assert.deepEqual(statsUpdate(statsInit(), base, n3, { move: 'right', pause: true }), ZERO);

// Events are counted.
let n4 = { ...base, tick: 1, events: ['pickup', 'conflict', 'conflict', 'drop', 'hit', 'level'] };
assert.deepEqual(statsUpdate(statsInit(), base, n4, mv(null)), { ...ZERO, ticks: 1, pickups: 1, conflicts: 2, drops: 1, hits: 1, levels: 1 });

// A merge counts its patches and the best merge.
const st1 = statsUpdate(statsInit(), { ...base, carried: [0, 1] }, { ...base, tick: 1, events: ['merge'] }, mv(null));
const st2 = statsUpdate(st1, { ...base, tick: 1, carried: [3] }, { ...base, tick: 2, events: ['merge', 'won'] }, mv(null));
assert.equal(st2.merges, 2);
assert.equal(st2.patchesMerged, 3);
assert.equal(st2.bestMerge, 2);
assert.equal(st2.levels, 1);

// statsUpdate does not change its argument.
const frozen = Object.freeze(statsInit());
statsUpdate(frozen, base, { ...base, tick: 1, events: ['pickup'] }, mv(null));
assert.deepEqual(frozen, ZERO);

// statsLines.
assert.deepEqual(statsLines({ ...ZERO, moves: 12, merges: 3, bestMerge: 3, hits: 1, levels: 2 }),
  ['MOVES 12', 'MERGES 3', 'BEST 3', 'HITS 1', 'LEVELS 2']);

console.log('area5 self-checks: all pass');
