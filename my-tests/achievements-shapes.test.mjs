// Local (out-of-tree) test for src/core/achievements.js: replicates the
// cases of tests/28 whose fixture needs core/game.js, using hand-built
// states of the same shape as §5's init, so the checker can be verified
// before game.js itself exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, checkAchievements } from '../src/core/achievements.js';

// A minimal state like init(seed, ...) ends with (§5): zero quorum noise,
// no merges, plenty of lives. MAP mirrors tests/28's level fixture.
const base = {
  seed: 1, tick: 0, levelTicks: 0, levelIndex: 0,
  level: { name: 'test', quorum: 1, par: 100, width: 8, height: 4, tiles: [], start: { x: 1, y: 1 }, spawns: [], drifts: [] },
  player: { x: 1, y: 1 }, carried: [], patches: [], drifts: [], conflicts: [],
  score: 0, lives: 3, merges: 0, open: false, invuln: 0,
  status: 'playing', paused: false, events: [],
};

test('ids in order with titles and descriptions (local copy of the §21 check)', () => {
  const IDS = ['first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum', 'shipped', 'flawless', 'conflict', 'survivor', 'champion'];
  assert.deepEqual(ACHIEVEMENTS.map((a) => a.id), IDS);
  for (const a of ACHIEVEMENTS) {
    assert.ok(typeof a.title === 'string' && a.title.length > 0);
    assert.ok(typeof a.description === 'string' && a.description.length > 0);
  }
});

test('merge of one, three, and monochrome', () => {
  assert.deepEqual(checkAchievements({ ...base, carried: [1] }, { ...base, events: ['merge'] }, []), ['first_merge']);
  assert.deepEqual(checkAchievements({ ...base, carried: [0, 1, 2] }, { ...base, events: ['merge'] }, ['first_merge']), ['full_hands']);
  assert.deepEqual(checkAchievements({ ...base, carried: [2, 2, 2] }, { ...base, events: ['merge'] }, ['first_merge']), ['full_hands', 'monochrome']);
});

test('quorum, shipped, flawless, conflict, survivor, champion', () => {
  assert.deepEqual(checkAchievements(base, { ...base, events: ['merge', 'quorum'] }, ['first_merge']), ['quorum']);
  assert.deepEqual(checkAchievements(base, { ...base, events: ['level'], levelIndex: 1 }, []), ['shipped', 'flawless']);
  assert.deepEqual(checkAchievements(base, { ...base, events: ['level'], levelIndex: 1, lives: 2 }, []), ['shipped']);
  assert.deepEqual(checkAchievements(base, { ...base, events: ['conflict'] }, []), ['conflict']);
  assert.deepEqual(checkAchievements(base, { ...base, events: ['level'], levelIndex: 3, lives: 1 }, ['shipped']), ['survivor']);
  assert.deepEqual(checkAchievements(base, { ...base, events: ['won'], status: 'won', lives: 1 }, []), ['shipped', 'champion']);
});

test('flawless counts only at full lives, in either shipping way', () => {
  assert.deepEqual(checkAchievements(base, { ...base, events: ['won'], status: 'won' }, []), ['shipped', 'flawless', 'champion']);
  assert.deepEqual(checkAchievements(base, { ...base, events: ['won'], status: 'won' }, ['shipped', 'champion']), ['flawless']);
  assert.deepEqual(checkAchievements(base, { ...base, events: ['level'], levelIndex: 5, lives: 0 }, []), ['shipped', 'survivor']);
});

test('survivor honours both level and won ways, past the fourth level too', () => {
  assert.deepEqual(checkAchievements(base, { ...base, events: ['won'], status: 'won', levelIndex: 4 }, []), ['shipped', 'flawless', 'survivor', 'champion']);
});
