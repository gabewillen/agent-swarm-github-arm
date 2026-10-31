// Local smoke tests for src/core/invariants.js and src/core/stats.js.
// Hand-built states, so they run before src/core/game.js exists.
// Run: node local-tests/smoke.mjs
import assert from 'node:assert/strict';
import { checkState } from '../src/core/invariants.js';
import { statsInit, statsUpdate, statsLines } from '../src/core/stats.js';

const LEVEL = {
  tiles: ['#########', '#@P.M..X#', '#.>..P..#', '#########'],
  width: 9, height: 4,
  spawns: [{ x: 2, y: 1 }, { x: 5, y: 2 }],
};
const base = () => ({
  seed: 1, tick: 0, levelTicks: 0, level: LEVEL, levelIndex: 0,
  player: { x: 1, y: 1 }, carried: [], patches: [], drifts: [],
  conflicts: [], score: 0, lives: 3, merges: 0, open: false,
  invuln: 0, status: 'playing', paused: false, events: [],
});
const mv = (move) => ({ move, pause: false });

// --- invariants ---
assert.deepEqual(checkState(base()), []);
assert.ok(checkState({ ...base(), status: 'dancing' }).includes('bad_status'));
assert.ok(checkState({ ...base(), player: { x: 0, y: 0 } }).includes('player_in_wall'));
assert.ok(checkState({ ...base(), player: { x: 50, y: 1 } }).includes('player_in_wall'));
assert.ok(checkState({ ...base(), carried: [0, 1, 2, 3] }).includes('carry_overflow'));
assert.ok(checkState({ ...base(), lives: -1 }).includes('lives_range'));
assert.ok(checkState({ ...base(), lives: 4 }).includes('lives_range'));
assert.ok(checkState({ ...base(), lives: 1.5 }).includes('lives_range'));
assert.ok(checkState({ ...base(), score: -10 }).includes('score_negative'));
assert.ok(checkState({ ...base(), score: 2.5 }).includes('score_negative'));
assert.ok(checkState({ ...base(), patches: [{ x: 3, y: 1, color: 0 }] }).includes('patch_off_spawn'));
assert.ok(checkState({ ...base(), drifts: [{ x: 0, y: 2, dir: 'up' }] }).includes('drift_in_wall'));
assert.ok(checkState({ ...base(), carried: [4] }).includes('bad_color'));
assert.ok(checkState({ ...base(), patches: [{ x: 2, y: 1, color: -1 }] }).includes('bad_color'));
// a valid spawn-based patch passes
assert.deepEqual(checkState({ ...base(), patches: [{ x: 2, y: 1, color: 2 }] }), []);
// valid mid-game state
assert.deepEqual(checkState({ ...base(), carried: [1, 2], score: 500, lives: 1, status: 'won' }), []);
// a patch on a merge pad also counts as off-spawn
assert.ok(checkState({ ...base(), patches: [{ x: 4, y: 1, color: 0 }] }).includes('patch_off_spawn'));

// --- stats ---
const ZERO = { ticks: 0, moves: 0, pickups: 0, merges: 0, patchesMerged: 0, bestMerge: 0, hits: 0, drops: 0, conflicts: 0, levels: 0 };
assert.deepEqual(statsInit(), ZERO);

// move right one cell
const s = base();
const n = { ...s, tick: 1, player: { x: 2, y: 1 }, events: [] };
assert.deepEqual(statsUpdate(statsInit(), s, n, mv('right')), { ...ZERO, ticks: 1, moves: 1 });
// blocked: tick but no move
assert.deepEqual(statsUpdate(statsInit(), s, { ...s, tick: 1, events: [] }, mv('up')), { ...ZERO, ticks: 1 });
// drift tick killed the patch? no: a teleport counts no move
assert.deepEqual(statsUpdate(statsInit(), s, { ...s, tick: 1, player: { x: 5, y: 2 }, events: [] }, mv('right')), { ...ZERO, ticks: 1 });
// pause counts nothing
const pauseIn = { move: 'right', pause: true };
const p = { ...s, paused: true, events: ['pause'] };
assert.deepEqual(statsUpdate(statsInit(), s, p, pauseIn), ZERO);
// events counted
const e = { ...s, tick: 1, events: ['pickup', 'conflict', 'conflict', 'drop', 'hit', 'level'] };
assert.deepEqual(statsUpdate(statsInit(), s, e, mv(null)), { ...ZERO, ticks: 1, pickups: 1, conflicts: 2, drops: 1, hits: 1, levels: 1 });
// merges: patches merged from prev.carried, best merge kept
let st = statsUpdate(statsInit(), { ...s, carried: [0, 1] }, { ...s, tick: 1, events: ['merge'] }, mv(null));
st = statsUpdate(st, { ...s, tick: 1, carried: [3] }, { ...s, tick: 2, events: ['merge', 'won'] }, mv(null));
assert.equal(st.merges, 2);
assert.equal(st.patchesMerged, 3);
assert.equal(st.bestMerge, 2);
assert.equal(st.levels, 1);
// does not change its arguments
const frozen = Object.freeze(statsInit());
const frozenState = Object.freeze(base());
statsUpdate(frozen, frozenState, { ...base(), tick: 1, events: ['pickup'] }, mv(null));
assert.deepEqual(frozen, ZERO);
assert.deepEqual(frozenState, base());
// lines
assert.deepEqual(statsLines({ ...ZERO, moves: 12, merges: 3, bestMerge: 3, hits: 1, levels: 2 }),
  ['MOVES 12', 'MERGES 3', 'BEST 3', 'HITS 1', 'LEVELS 2']);

console.log('smoke tests passed');
