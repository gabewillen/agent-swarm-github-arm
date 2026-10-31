// Local smoke checks for src/core/achievements.js (mirrors tests/28 without
// importing the rest of the core, so it runs before merge).
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, checkAchievements } from '../src/core/achievements.js';

const IDS = ['first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum', 'shipped', 'flawless', 'conflict', 'survivor', 'champion'];
assert.deepEqual(ACHIEVEMENTS.map((a) => a.id), IDS);
for (const a of ACHIEVEMENTS) {
  assert.ok(typeof a.title === 'string' && a.title.length > 0, a.id + ' title');
  assert.ok(typeof a.description === 'string' && a.description.length > 0, a.id + ' description');
}

const s = { levelIndex: 0, lives: 3, carried: [] };

assert.deepEqual(checkAchievements(s, { ...s, events: ['pickup'], carried: [0] }, []), ['first_pickup']);
assert.deepEqual(checkAchievements(s, { ...s, events: ['pickup'], carried: [0] }, ['first_pickup']), []);

assert.deepEqual(checkAchievements({ ...s, carried: [1] }, { ...s, events: ['merge'] }, []), ['first_merge']);

assert.deepEqual(
  checkAchievements({ ...s, carried: [0, 1, 2] }, { ...s, events: ['merge'] }, ['first_merge']),
  ['full_hands'],
);
assert.deepEqual(
  checkAchievements({ ...s, carried: [2, 2, 2] }, { ...s, events: ['merge'] }, ['first_merge']),
  ['full_hands', 'monochrome'],
);

assert.deepEqual(checkAchievements(s, { ...s, events: ['merge', 'quorum'] }, ['first_merge']), ['quorum']);
assert.deepEqual(checkAchievements(s, { ...s, events: ['level'], levelIndex: 1 }, []), ['shipped', 'flawless']);
assert.deepEqual(checkAchievements(s, { ...s, events: ['level'], levelIndex: 1, lives: 2 }, []), ['shipped']);
assert.deepEqual(checkAchievements(s, { ...s, events: ['conflict'] }, []), ['conflict']);
assert.deepEqual(checkAchievements(s, { ...s, events: ['level'], levelIndex: 3, lives: 1 }, ['shipped']), ['survivor']);
assert.deepEqual(checkAchievements(s, { ...s, events: ['won'], status: 'won', lives: 1 }, []), ['shipped', 'champion']);
assert.deepEqual(checkAchievements(s, { ...s, events: [] }, []), []);

console.log('achievements local checks: all pass');
