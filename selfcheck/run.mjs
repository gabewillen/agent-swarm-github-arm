// Local self-checks for src/core/invariants.js and src/core/stats.js.
// Hand-crafted states in the §5 shape — no dependency on src/core/game.js,
// so this runs before that module exists:  node selfcheck/run.mjs
import assert from 'node:assert/strict';
import { checkState } from '../src/core/invariants.js';
import { statsInit, statsUpdate, statsLines } from '../src/core/stats.js';

// The parsed-level shape of §4/§5 that game() would produce for
// MAP = ['#########', '#@P.M..X#', '#.>..P..#', '#########'].
const LEVEL = {
  name: 'test', quorum: 3, par: 120, driftPeriod: 2, spawnEvery: 20,
  width: 9, height: 4,
  tiles: ['#########', '#.P.M..X#', '#.....P.#', '#########'],
  start: { x: 1, y: 1 },
  spawns: [{ x: 2, y: 1 }, { x: 5, y: 2 }],
  drifts: [{ x: 2, y: 2, dir: 'right' }],
};

function state(extra = {}) {
  return {
    seed: 1, tick: 0, levelTicks: 0, levels: [], levelIndex: 0, level: LEVEL,
    player: { x: 1, y: 1 }, carried: [], patches: [{ x: 2, y: 1, color: 0 }],
    drifts: [{ x: 2, y: 2, dir: 'right' }], conflicts: [],
    score: 0, lives: 3, merges: 0, open: false, invuln: 0,
    status: 'playing', paused: false, events: [], ...extra,
  };
}

const mv = (move) => ({ move, pause: false });
const ZERO = {
  ticks: 0, moves: 0, pickups: 0, merges: 0, patchesMerged: 0, bestMerge: 0,
  hits: 0, drops: 0, conflicts: 0, levels: 0,
};

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
  } catch (err) {
    failures++;
    console.log('FAIL - ' + name + ': ' + err.message);
  }
}

// ---- invariants.js ----

test('a fresh state has no errors', () => {
  assert.deepEqual(checkState(state()), []);
});

test('bad_status', () => {
  assert.ok(checkState(state({ status: 'dancing' })).includes('bad_status'));
  assert.ok(checkState(state({ status: null })).includes('bad_status'));
});

test('player_in_wall and off the map', () => {
  assert.ok(checkState(state({ player: { x: 0, y: 0 } })).includes('player_in_wall'));
  assert.ok(checkState(state({ player: { x: 50, y: 1 } })).includes('player_in_wall'));
  assert.ok(checkState(state({ player: { x: 3, y: 1 } })).length === 0);
});

test('carry_overflow', () => {
  assert.ok(checkState(state({ carried: [0, 1, 2, 3] })).includes('carry_overflow'));
  assert.ok(checkState(state({ carried: [0, 1, 2] })).length === 0);
});

test('lives_range', () => {
  assert.ok(checkState(state({ lives: -1 })).includes('lives_range'));
  assert.ok(checkState(state({ lives: 4 })).includes('lives_range'));
  assert.ok(checkState(state({ lives: 1.5 })).includes('lives_range'));
  assert.ok(checkState(state({ lives: 0 })).length === 0);
});

test('score_negative', () => {
  assert.ok(checkState(state({ score: -10 })).includes('score_negative'));
  assert.ok(checkState(state({ score: 2.5 })).includes('score_negative'));
  assert.ok(checkState(state({ score: 500 })).length === 0);
});

test('patch_off_spawn', () => {
  assert.ok(checkState(state({ patches: [{ x: 3, y: 1, color: 0 }] })).includes('patch_off_spawn'));
  assert.ok(checkState(state({ patches: [{ x: 2, y: 1, color: 1 }, { x: 5, y: 2, color: 2 }] })).length === 0);
});

test('drift_in_wall', () => {
  assert.ok(checkState(state({ drifts: [{ x: 0, y: 2, dir: 'up' }] })).includes('drift_in_wall'));
  assert.ok(checkState(state({ drifts: [{ x: 100, y: 100, dir: 'up' }] })).includes('drift_in_wall'));
});

test('bad_color on carried and lying patches', () => {
  assert.ok(checkState(state({ carried: [4] })).includes('bad_color'));
  assert.ok(checkState(state({ patches: [{ x: 2, y: 1, color: -1 }] })).includes('bad_color'));
  assert.ok(checkState(state({ patches: [{ x: 2, y: 1, color: 1.5 }] })).includes('bad_color'));
  assert.ok(checkState(state({ carried: [3] })).length === 0);
});

test('a valid mid-game state has no errors', () => {
  assert.deepEqual(checkState(state({ carried: [1, 2], score: 500, lives: 1, status: 'won' })), []);
});

test('several errors at once', () => {
  const errors = checkState(state({ status: 'dancing', lives: 9, score: -1 }));
  assert.deepEqual(errors, ['bad_status', 'lives_range', 'score_negative']);
});

test('checkState never changes its argument', () => {
  const s = state({ carried: [4, 5, 6, 7] });
  const before = JSON.stringify(s);
  checkState(s);
  assert.equal(JSON.stringify(s), before);
});

// ---- stats.js ----

test('statsInit is all zero', () => {
  assert.deepEqual(statsInit(), ZERO);
});

test('a move counts a tick and a move', () => {
  const prev = state();
  const next = { ...state(), tick: 1, player: { x: 2, y: 1 } };
  assert.deepEqual(statsUpdate(statsInit(), prev, next, mv('right')), { ...ZERO, ticks: 1, moves: 1 });
});

test('a blocked move counts a tick but no move', () => {
  const prev = state();
  const next = { ...state(), tick: 1 };
  assert.deepEqual(statsUpdate(statsInit(), prev, next, mv('up')), { ...ZERO, ticks: 1 });
});

test('a pause step counts nothing', () => {
  const input = { move: 'right', pause: true };
  const prev = state();
  const next = { ...state(), paused: true, events: ['pause'] };
  assert.deepEqual(statsUpdate(statsInit(), prev, next, input), ZERO);
});

test('a no-move tick counts a tick only', () => {
  const prev = state({ tick: 3 });
  const next = { ...state({ tick: 4 }) };
  assert.deepEqual(statsUpdate(statsInit(), prev, next, mv(null)), { ...ZERO, ticks: 1 });
});

test('a hit that returns the player home from far away counts no move', () => {
  const prev = state({ tick: 5, player: { x: 3, y: 1 } });
  const next = { ...state({ tick: 6, lives: 2, invuln: 6 }), events: ['drop'] };
  assert.deepEqual(statsUpdate(statsInit(), prev, next, mv('right')), { ...ZERO, ticks: 1, drops: 1 });
});

test('a hit one cell from home counts the move it made', () => {
  const prev = state({ tick: 5, player: { x: 2, y: 1 } });
  const next = { ...state({ tick: 6, lives: 2, invuln: 6 }), events: ['hit'] };
  assert.deepEqual(statsUpdate(statsInit(), prev, next, mv('right')),
    { ...ZERO, ticks: 1, moves: 1, hits: 1 });
});

test('events are counted', () => {
  const prev = state();
  const next = { ...state({ tick: 1 }), events: ['pickup', 'conflict', 'conflict', 'drop', 'hit', 'level'] };
  assert.deepEqual(
    statsUpdate(statsInit(), prev, next, mv(null)),
    { ...ZERO, ticks: 1, pickups: 1, conflicts: 2, drops: 1, hits: 1, levels: 1 });
});

test('a merge counts its patches and the best merge', () => {
  const s1 = { ...state({ carried: [0, 1] }) };
  const s2 = { ...state({ tick: 1, carried: [] }), events: ['merge'] };
  let st = statsUpdate(statsInit(), s1, s2, mv(null));
  const s3 = { ...state({ tick: 1, carried: [3] }) };
  const s4 = { ...state({ tick: 2, carried: [] }), events: ['merge', 'won'] };
  st = statsUpdate(st, s3, s4, mv(null));
  assert.equal(st.merges, 2);
  assert.equal(st.patchesMerged, 3);
  assert.equal(st.bestMerge, 2);
  assert.equal(st.levels, 1);
  st = statsUpdate(st, s1, { ...s2, events: ['merge'] }, mv(null));
  assert.equal(st.bestMerge, 2);
  assert.equal(st.patchesMerged, 5);
});

test('statsUpdate does not change its argument', () => {
  const prev = state();
  const next = { ...state({ tick: 1 }), events: ['pickup'] };
  const st = Object.freeze(statsInit());
  statsUpdate(st, prev, next, mv(null));
  assert.deepEqual(st, ZERO);
});

test('statsUpdate does not change prev or next', () => {
  const prev = state({ carried: [0] });
  const next = { ...state({ tick: 1 }), events: ['merge', 'won'] };
  const a = JSON.stringify(prev);
  const b = JSON.stringify(next);
  statsUpdate(statsInit(), prev, next, mv('left'));
  assert.equal(JSON.stringify(prev), a);
  assert.equal(JSON.stringify(next), b);
});

test('statsLines', () => {
  assert.deepEqual(
    statsLines({ ...ZERO, moves: 12, merges: 3, bestMerge: 3, hits: 1, levels: 2 }),
    ['MOVES 12', 'MERGES 3', 'BEST 3', 'HITS 1', 'LEVELS 2']);
  assert.deepEqual(statsLines(statsInit()),
    ['MOVES 0', 'MERGES 0', 'BEST 0', 'HITS 0', 'LEVELS 0']);
});

// Facts accumulate across many steps.
test('a run of steps accumulates', () => {
  let st = statsInit();
  st = statsUpdate(st, state({ tick: 0, carried: [2, 3] }),
    { ...state({ tick: 1, player: { x: 1, y: 2 } }), events: ['merge'] }, mv('down'));
  st = statsUpdate(st, state({ tick: 1 }), state({ tick: 2 }), mv(null));
  st = statsUpdate(st, state({ tick: 2 }),
    { ...state({ tick: 4, player: { x: 1, y: 2 }, carried: [0, 1, 2] }),
      events: ['pickup', 'pickup', 'pickup', 'drop'] }, mv('down'));
  assert.deepEqual(st, {
    ...ZERO, ticks: 4, moves: 2, pickups: 3, merges: 1, patchesMerged: 2,
    bestMerge: 2, drops: 1,
  });
});

console.log(failures === 0 ? 'all local checks pass' : failures + ' local checks fail');
process.exit(failures === 0 ? 0 : 1);
