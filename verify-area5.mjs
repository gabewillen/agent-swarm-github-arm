// Local verification for agent-42's area 5 (src/core/invariants.js,
// src/core/stats.js). Builds the stub states the acceptance tests build and
// asserts the same things tests 15 and 29 assert, without needing the other
// areas' modules. Run: node verify-area5.mjs
import assert from 'node:assert/strict';
import { checkState } from './src/core/invariants.js';
import { statsInit, statsUpdate, statsLines } from './src/core/stats.js';

const MAP = ['#########', '#@P.M..X#', '#.>..P..#', '#########'];
// §5's state shape, as init(seed) would produce for this map.
const s = {
  seed: 1,
  tick: 0,
  levelTicks: 0,
  level: {
    name: 'test', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000,
    width: 9, height: 4, tiles: MAP,
    start: { x: 1, y: 1 },
    spawns: [{ x: 2, y: 1 }, { x: 5, y: 2 }],
    drifts: [{ x: 2, y: 2, dir: 'right' }],
  },
  player: { x: 1, y: 1 },
  carried: [],
  patches: [{ x: 2, y: 1, color: 0 }, { x: 5, y: 2, color: 3 }],
  drifts: [{ x: 2, y: 2, dir: 'right' }],
  conflicts: [],
  score: 0,
  lives: 3,
  merges: 0,
  open: false,
  invuln: 0,
  status: 'playing',
  paused: false,
  events: [],
};

// test 15
assert.deepEqual(checkState(s), []);
assert.ok(checkState({ ...s, status: 'dancing' }).includes('bad_status'));
assert.ok(checkState({ ...s, player: { x: 0, y: 0 } }).includes('player_in_wall'));
assert.ok(checkState({ ...s, player: { x: 50, y: 1 } }).includes('player_in_wall'));
assert.ok(checkState({ ...s, carried: [0, 1, 2, 3] }).includes('carry_overflow'));
assert.ok(checkState({ ...s, lives: -1 }).includes('lives_range'));
assert.ok(checkState({ ...s, lives: 4 }).includes('lives_range'));
assert.ok(checkState({ ...s, lives: 1.5 }).includes('lives_range'));
assert.ok(checkState({ ...s, score: -10 }).includes('score_negative'));
assert.ok(checkState({ ...s, score: 2.5 }).includes('score_negative'));
assert.ok(checkState({ ...s, patches: [{ x: 3, y: 1, color: 0 }] }).includes('patch_off_spawn'));
assert.ok(checkState({ ...s, drifts: [{ x: 0, y: 2, dir: 'up' }] }).includes('drift_in_wall'));
assert.ok(checkState({ ...s, carried: [4] }).includes('bad_color'));
assert.ok(checkState({ ...s, patches: [{ x: 2, y: 1, color: -1 }] }).includes('bad_color'));
assert.deepEqual(checkState({ ...s, carried: [1, 2], score: 500, lives: 1, status: 'won' }), []);
console.log('invariants ok');

// test 29
const ZERO = { ticks: 0, moves: 0, pickups: 0, merges: 0, patchesMerged: 0, bestMerge: 0, hits: 0, drops: 0, conflicts: 0, levels: 0 };
assert.deepEqual(statsInit(), ZERO);
assert.deepEqual(statsUpdate(statsInit(), s, { ...s, tick: 1, player: { x: 2, y: 1 } }, { move: 'right', pause: false }), { ...ZERO, ticks: 1, moves: 1 });
assert.deepEqual(statsUpdate(statsInit(), s, { ...s, tick: 1 }, { move: 'up', pause: false }), { ...ZERO, ticks: 1 });
// a real pause step does not grow the tick (§6 step 2: nothing else changes)
assert.deepEqual(statsUpdate(statsInit(), s, { ...s, paused: true, events: ['pause'] }, { move: 'right', pause: true }), ZERO);
const n = { ...s, tick: 1, events: ['pickup', 'conflict', 'conflict', 'drop', 'hit', 'level'] };
assert.deepEqual(statsUpdate(statsInit(), s, n, { move: null, pause: false }), { ...ZERO, ticks: 1, pickups: 1, conflicts: 2, drops: 1, hits: 1, levels: 1 });
let st = statsUpdate(statsInit(), { ...s, carried: [0, 1] }, { ...s, tick: 1, events: ['merge'] }, { move: null, pause: false });
st = statsUpdate(st, { ...s, tick: 1, carried: [3] }, { ...s, tick: 2, events: ['merge', 'won'] }, { move: null, pause: false });
assert.equal(st.merges, 2);
assert.equal(st.patchesMerged, 3);
assert.equal(st.bestMerge, 2);
assert.equal(st.levels, 1);
const frozen = Object.freeze(statsInit());
statsUpdate(frozen, s, { ...s, tick: 1, events: ['pickup'] }, { move: null, pause: false });
assert.deepEqual(frozen, ZERO);
assert.deepEqual(statsLines({ ...ZERO, moves: 12, merges: 3, bestMerge: 3, hits: 1, levels: 2 }), ['MOVES 12', 'MERGES 3', 'BEST 3', 'HITS 1', 'LEVELS 2']);
console.log('stats ok');
