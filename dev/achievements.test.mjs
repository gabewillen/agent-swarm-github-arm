// My own check of src/core/achievements.js against DESIGN.md §21 and the
// expectations of tests/28-achievements.test.mjs, using handcrafted state
// stubs so it runs before src/core/game.js lands (test 28 itself needs
// game.js and waits on the agents who own it).
//   node --test dev/achievements.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, checkAchievements } from '../src/core/achievements.js';

const IDS = [
  'first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum',
  'shipped', 'flawless', 'conflict', 'survivor', 'champion',
];

// A minimal state stub carrying only the fields achievements read.
const st = (over = {}) => ({
  carried: [], events: [], lives: 3, levelIndex: 0, status: 'playing', ...over,
});

test('ACHIEVEMENTS lists the ten ids in order with titles and descriptions', () => {
  assert.deepEqual(ACHIEVEMENTS.map((a) => a.id), IDS);
  for (const a of ACHIEVEMENTS) {
    assert.ok(typeof a.title === 'string' && a.title.length > 0);
    assert.ok(typeof a.description === 'string' && a.description.length > 0);
  }
});

test('a pickup earns first_pickup once', () => {
  const s = st();
  const n = st({ events: ['pickup'], carried: [0] });
  assert.deepEqual(checkAchievements(s, n, []), ['first_pickup']);
  assert.deepEqual(checkAchievements(s, n, ['first_pickup']), []);
});

test('merging one patch earns first_merge only', () => {
  const s = st({ carried: [1] });
  assert.deepEqual(checkAchievements(s, st({ events: ['merge'] }), []), ['first_merge']);
});

test('merging three earns full_hands; one colour earns monochrome too', () => {
  const a = checkAchievements(st({ carried: [0, 1, 2] }), st({ events: ['merge'] }), ['first_merge']);
  assert.deepEqual(a, ['full_hands']);
  const b = checkAchievements(st({ carried: [2, 2, 2] }), st({ events: ['merge'] }), ['first_merge']);
  assert.deepEqual(b, ['full_hands', 'monochrome']);
});

test('quorum, shipped, and flawless', () => {
  const s = st();
  assert.deepEqual(checkAchievements(s, st({ events: ['merge', 'quorum'] }), ['first_merge']), ['quorum']);
  assert.deepEqual(checkAchievements(s, st({ events: ['level'], levelIndex: 1 }), []), ['shipped', 'flawless']);
  assert.deepEqual(checkAchievements(s, st({ events: ['level'], levelIndex: 1, lives: 2 }), []), ['shipped']);
});

test('conflict, survivor, and champion', () => {
  const s = st();
  assert.deepEqual(checkAchievements(s, st({ events: ['conflict'] }), []), ['conflict']);
  assert.deepEqual(checkAchievements(s, st({ events: ['level'], levelIndex: 3, lives: 1 }), ['shipped']), ['survivor']);
  assert.deepEqual(checkAchievements(s, st({ events: ['won'], status: 'won', lives: 1 }), []), ['shipped', 'champion']);
});

test('nothing happening earns nothing', () => {
  assert.deepEqual(checkAchievements(st(), st(), []), []);
});

test('a step Towards the merge earns achievements in ACHIEVEMENTS order', () => {
  // The same four steps tests/28 plays with real game.js, hand-stepped:
  // two pickups wait, the merge of 3 same-colour patches also hits quorum.
  const s0 = st();
  const s1 = st({ events: ['pickup'], carried: [1] });
  const s2 = st({ events: ['pickup'], carried: [1, 1] });
  const s3 = st({ events: ['pickup'], carried: [1, 1, 1] });
  const s4 = st({ events: ['merge', 'quorum'], carried: [] });
  const unlocked = [];
  unlocked.push(...checkAchievements(s0, s1, unlocked));
  unlocked.push(...checkAchievements(s1, s2, unlocked));
  unlocked.push(...checkAchievements(s2, s3, unlocked));
  unlocked.push(...checkAchievements(s3, s4, unlocked));
  assert.deepEqual(unlocked, ['first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum']);
});

test('ids are reported in ACHIEVEMENTS order even when many land at once', () => {
  const s = st({ events: ['level'], levelIndex: 3 });
  assert.deepEqual(checkAchievements(s, s, []), ['shipped', 'flawless', 'survivor']);
  const won = st({ events: ['won'], status: 'won', levelIndex: 3 });
  assert.deepEqual(checkAchievements(s, won, []), ['shipped', 'flawless', 'champion']);
});
