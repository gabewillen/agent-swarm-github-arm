// Scratch harness (not part of tests/): replays tests/28's assertions for
// checkAchievements against a stub state shaped like game(MAP)'s, so my
// logic can be verified before src/core/game.js exists.
import assert from 'node:assert/strict';
import { checkAchievements, ACHIEVEMENTS } from '../src/core/achievements.js';

const IDS = ['first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum', 'shipped', 'flawless', 'conflict', 'survivor', 'champion'];
assert.deepEqual(ACHIEVEMENTS.map((a) => a.id), IDS);
for (const a of ACHIEVEMENTS) {
  assert.ok(typeof a.title === 'string' && a.title.length > 0);
  assert.ok(typeof a.description === 'string' && a.description.length > 0);
}

// A stand-in for init(1, { levels: [lvl(MAP)] }): only the fields
// checkAchievements reads matter (carried, events, lives, levelIndex).
const s = { levelIndex: 0, lives: 3, carried: [], events: [] };

assert.deepEqual(checkAchievements(s, { ...s, events: ['pickup'], carried: [0] }, []), ['first_pickup']);
assert.deepEqual(checkAchievements(s, { ...s, events: ['pickup'], carried: [0] }, ['first_pickup']), []);

assert.deepEqual(checkAchievements({ ...s, carried: [1] }, { ...s, events: ['merge'] }, []), ['first_merge']);

assert.deepEqual(checkAchievements({ ...s, carried: [0, 1, 2] }, { ...s, events: ['merge'] }, ['first_merge']), ['full_hands']);
assert.deepEqual(checkAchievements({ ...s, carried: [2, 2, 2] }, { ...s, events: ['merge'] }, ['first_merge']), ['full_hands', 'monochrome']);

assert.deepEqual(checkAchievements(s, { ...s, events: ['merge', 'quorum'] }, ['first_merge']), ['quorum']);
assert.deepEqual(checkAchievements(s, { ...s, events: ['level'], levelIndex: 1 }, []), ['shipped', 'flawless']);
assert.deepEqual(checkAchievements(s, { ...s, events: ['level'], levelIndex: 1, lives: 2 }, []), ['shipped']);

assert.deepEqual(checkAchievements(s, { ...s, events: ['conflict'] }, []), ['conflict']);
assert.deepEqual(checkAchievements(s, { ...s, events: ['level'], levelIndex: 3, lives: 1 }, ['shipped']), ['survivor']);
assert.deepEqual(checkAchievements(s, { ...s, events: ['won'], status: 'won', lives: 1 }, []), ['shipped', 'champion']);

assert.deepEqual(checkAchievements(s, { ...s, events: [] }, []), []);

// A real-step shape: picking up 3 same-colour patches then merging them.
run([
  { prev: { ...s, carried: [] }, next: { ...s, events: ['pickup'], carried: [1] } },
  { prev: { ...s, carried: [1] }, next: { ...s, events: ['pickup'], carried: [1, 1] } },
  { prev: { ...s, carried: [1, 1] }, next: { ...s, events: ['pickup'], carried: [1, 1, 1] } },
  { prev: { ...s, carried: [1, 1, 1] }, next: { ...s, events: ['merge', 'quorum'], carried: [] } },
], ['first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum']);

function run(steps, expected) {
  const unlocked = [];
  for (const { prev, next } of steps) unlocked.push(...checkAchievements(prev, next, unlocked));
  assert.deepEqual(unlocked, expected);
}

console.log('all 28-section assertions hold');
