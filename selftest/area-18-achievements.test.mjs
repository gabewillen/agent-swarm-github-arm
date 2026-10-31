// Area 18 self-tests: src/core/achievements.js against DESIGN.md §21.
// Every acceptance scenario of tests/28, crossed with extra edge cases and
// contract properties (output always in ACHIEVEMENTS order, tolerant of
// odd inputs). Run:
//   node --test selftest/area-18-achievements.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, checkAchievements } from '../src/core/achievements.js';

const IDS = ['first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum', 'shipped', 'flawless', 'conflict', 'survivor', 'champion'];

test('ACHIEVEMENTS lists the ten ids in order with titles and descriptions', () => {
  assert.deepEqual(ACHIEVEMENTS.map((a) => a.id), IDS);
  for (const a of ACHIEVEMENTS) {
    assert.ok(typeof a.title === 'string' && a.title.length > 0);
    assert.ok(typeof a.description === 'string' && a.description.length > 0);
  }
});

const S = { carried: [], lives: 3, levelIndex: 0, events: [] };
const nxt = (over) => ({ ...S, ...over });

test('pickup, merge, and their shape', () => {
  assert.deepEqual(checkAchievements(S, nxt({ events: ['pickup'], carried: [0] }), []), ['first_pickup']);
  assert.deepEqual(checkAchievements(S, nxt({ events: ['pickup'] }), ['first_pickup']), []);
  assert.deepEqual(checkAchievements({ ...S, carried: [1] }, nxt({ events: ['merge'] }), []), ['first_merge']);
  // two same-colour patches merged: the full-size rules still need 3
  assert.deepEqual(checkAchievements({ ...S, carried: [2, 2] }, nxt({ events: ['merge'] }), []), ['first_merge']);
  assert.deepEqual(checkAchievements({ ...S, carried: [0, 1, 2] }, nxt({ events: ['merge'] }), []), ['first_merge', 'full_hands']);
  assert.deepEqual(checkAchievements({ ...S, carried: [2, 2, 2] }, nxt({ events: ['merge'] }), ['first_merge']), ['full_hands', 'monochrome']);
  assert.deepEqual(checkAchievements({ ...S, carried: [0, 0, 1] }, nxt({ events: ['merge'] }), []), ['first_merge', 'full_hands']);
});

test('quorum, shipped, flawless, conflict, survivor, champion', () => {
  assert.deepEqual(checkAchievements(S, nxt({ events: ['merge', 'quorum'] }), ['first_merge']), ['quorum']);
  assert.deepEqual(checkAchievements(S, nxt({ events: ['level'], levelIndex: 1 }), []), ['shipped', 'flawless']);
  assert.deepEqual(checkAchievements(S, nxt({ events: ['level'], levelIndex: 1, lives: 2 }), []), ['shipped']);
  assert.deepEqual(checkAchievements(S, nxt({ events: ['conflict'] }), []), ['conflict']);
  assert.deepEqual(checkAchievements(S, nxt({ events: ['level'], levelIndex: 3, lives: 1 }), ['shipped']), ['survivor']);
  assert.deepEqual(checkAchievements(S, nxt({ events: ['won'], status: 'won' }), []), ['shipped', 'flawless', 'champion']);
  assert.deepEqual(checkAchievements(S, nxt({ events: ['won'], status: 'won', lives: 1 }), []), ['shipped', 'champion']);
});

test('survivor fires on the level event that reaches index 3, not on won', () => {
  assert.deepEqual(checkAchievements(S, nxt({ events: ['level'], levelIndex: 3, lives: 1 }), ['shipped']), ['survivor']);
  assert.deepEqual(checkAchievements(S, nxt({ events: ['won'], status: 'won', levelIndex: 3 }), []), ['shipped', 'flawless', 'champion']);
  assert.deepEqual(checkAchievements(S, nxt({ events: ['level'], levelIndex: 2 }), []), ['shipped', 'flawless']);
});

test('nothing happening earns nothing; the result is always in ACHIEVEMENTS order', () => {
  assert.deepEqual(checkAchievements(S, nxt({ events: [] }), []), []);
  assert.deepEqual(checkAchievements(S, nxt(), []), []);
  // even an out-of-order unlocked list yields an in-order result
  const all = checkAchievements(S, nxt({ events: ['level'], status: 'won' }), ['champion', 'shipped', 'flawless']);
  assert.deepEqual(all, ['survivor']);
  const many = checkAchievements(S, nxt({ events: ['won'], status: 'won' }), []);
  assert.deepEqual(many, ['shipped', 'flawless', 'champion']);
});

test('it is defensive about missing fields and filters everything in unlocked', () => {
  assert.deepEqual(checkAchievements(undefined, undefined, []), []);
  assert.deepEqual(checkAchievements(S, nxt({ events: ['merge'], carried: [] }), []), ['first_merge']);
  assert.deepEqual(checkAchievements({ ...S, carried: [3, 3, 3] }, nxt({ events: ['merge'] }), ['first_merge', 'full_hands', 'monochrome']), []);
  assert.deepEqual(checkAchievements(S, nxt({ events: ['pickup'] }), ['not_an_id']), ['first_pickup']);
});

test('a merge does not look ahead: a quorum-1 merge fires first_merge and quorum', () => {
  assert.deepEqual(checkAchievements(S, nxt({ events: ['merge', 'quorum'] }), []), ['first_merge', 'quorum']);
});

// A run of locked-input steps against the landed module, mirroring the
// acceptance test's real-game loop once core/game.js is available.
test('locked ids: once unlocked, duplicated events earn nothing new', () => {
  const step = (prev, events, carried) => [prev, nxt({ events, carried })];
  const [p, n] = step(S, ['pickup'], [1]);
  assert.deepEqual(checkAchievements(p, n, []), ['first_pickup']);
  assert.deepEqual(checkAchievements(S, nxt({ events: ['pickup'], carried: [1, 2, 3] }), ['first_pickup']), []);
});
