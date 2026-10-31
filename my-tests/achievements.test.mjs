// agent-17's local checks for src/core/achievements.js (not part of the
// acceptance suite). Mirrors tests/28's assertions with synthetic states so
// they run even while src/core/game.js is still unmerged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, checkAchievements } from '../src/core/achievements.js';

const IDS = ['first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum', 'shipped', 'flawless', 'conflict', 'survivor', 'champion'];
// stand-in for init(seed, { levels: [...] }): only the fields §21 reads.
const base = () => ({ events: [], carried: [], levelIndex: 0, lives: 3 });
const n = (over) => ({ ...base(), ...over });

test('ids in order', () => {
  assert.deepEqual(ACHIEVEMENTS.map((a) => a.id), IDS);
  for (const a of ACHIEVEMENTS) {
    assert.ok(typeof a.title === 'string' && a.title.length > 0);
    assert.ok(typeof a.description === 'string' && a.description.length > 0);
  }
});

test('pickup earns first_pickup once', () => {
  const s = base();
  const next = n({ events: ['pickup'], carried: [0] });
  assert.deepEqual(checkAchievements(s, next, []), ['first_pickup']);
  assert.deepEqual(checkAchievements(s, next, ['first_pickup']), []);
});

test('one-patch merge earns first_merge only', () => {
  assert.deepEqual(checkAchievements(n({ carried: [1] }), n({ events: ['merge'] }), []), ['first_merge']);
  // nothing earned while unlocked holds everything
  assert.deepEqual(checkAchievements(n({ carried: [1] }), n({ events: ['merge'] }), IDS), []);
});

test('three-patch merge earns full_hands; one colour adds monochrome', () => {
  const prev = n({ carried: [0, 1, 2] });
  assert.deepEqual(checkAchievements(prev, n({ events: ['merge'] }), ['first_merge']), ['full_hands']);
  assert.deepEqual(checkAchievements(n({ carried: [2, 2, 2] }), n({ events: ['merge'] }), ['first_merge']), ['full_hands', 'monochrome']);
  assert.deepEqual(checkAchievements(n({ carried: [0, 1, 2] }), n({ events: ['merge'] }), []), ['first_merge', 'full_hands']);
});

test('quorum, shipped, flawless', () => {
  assert.deepEqual(checkAchievements(base(), n({ events: ['merge', 'quorum'] }), ['first_merge']), ['quorum']);
  assert.deepEqual(checkAchievements(base(), n({ events: ['level'], levelIndex: 1 }), []), ['shipped', 'flawless']);
  assert.deepEqual(checkAchievements(base(), n({ events: ['level'], levelIndex: 1, lives: 2 }), []), ['shipped']);
});

test('conflict, survivor, champion', () => {
  assert.deepEqual(checkAchievements(base(), n({ events: ['conflict'] }), []), ['conflict']);
  assert.deepEqual(checkAchievements(base(), n({ events: ['level'], levelIndex: 3, lives: 1 }), ['shipped']), ['survivor']);
  assert.deepEqual(checkAchievements(base(), n({ events: ['won'], status: 'won', lives: 1 }), []), ['shipped', 'champion']);
});

test('nothing happening earns nothing', () => {
  assert.deepEqual(checkAchievements(base(), n({}), []), []);
});

test('purity: arguments unchanged', () => {
  const prev = { events: [], carried: [1, 1, 1], levelIndex: 0, lives: 3 };
  const next = { events: ['merge'], carried: [], levelIndex: 0, lives: 3 };
  const unlocked = ['first_merge'];
  const frozenPrev = structuredClone(prev);
  const frozenNext = structuredClone(next);
  checkAchievements(prev, next, unlocked);
  assert.deepEqual(prev, frozenPrev);
  assert.deepEqual(next, frozenNext);
  assert.deepEqual(unlocked, ['first_merge']);
});
