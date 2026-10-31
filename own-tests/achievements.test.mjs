// agent-17's own sanity checks for src/core/achievements.js (§21).
// Mirrors tests/28 but with hand-built §5 states, so it does not depend
// on src/core/game.js. Run: node --test own-tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAchievements, ACHIEVEMENTS } from '../src/core/achievements.js';

const IDS = ['first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum', 'shipped', 'flawless', 'conflict', 'survivor', 'champion'];

// A minimal §5 state as `init` would leave it for the design's sample map.
const base = () => ({
  seed: 1, tick: 0, levelTicks: 0, levels: [], levelIndex: 0,
  player: { x: 1, y: 1 }, carried: [], patches: [], drifts: [],
  conflicts: [], score: 0, lives: 3, merges: 0, open: false,
  invuln: 0, status: 'playing', paused: false, events: [],
});

test('ACHIEVEMENTS lists the ten ids in order with titles and descriptions', () => {
  assert.deepEqual(ACHIEVEMENTS.map((a) => a.id), IDS);
  for (const a of ACHIEVEMENTS) {
    assert.ok(typeof a.title === 'string' && a.title.length > 0);
    assert.ok(typeof a.description === 'string' && a.description.length > 0);
    assert.deepEqual(Object.keys(a).sort(), ['description', 'id', 'title']);
  }
});

test('a pickup earns first_pickup once', () => {
  const s = base();
  const n = { ...s, events: ['pickup'], carried: [0] };
  assert.deepEqual(checkAchievements(s, n, []), ['first_pickup']);
  assert.deepEqual(checkAchievements(s, n, ['first_pickup']), []);
});

test('merging one patch earns first_merge only', () => {
  const s = base();
  assert.deepEqual(checkAchievements({ ...s, carried: [1] }, { ...s, events: ['merge'] }, []), ['first_merge']);
});

test('merging three earns full_hands; one colour earns monochrome too', () => {
  const s = base();
  assert.deepEqual(checkAchievements({ ...s, carried: [0, 1, 2] }, { ...s, events: ['merge'] }, ['first_merge']), ['full_hands']);
  assert.deepEqual(checkAchievements({ ...s, carried: [2, 2, 2] }, { ...s, events: ['merge'] }, ['first_merge']), ['full_hands', 'monochrome']);
  // A merge of fewer than three earns neither.
  assert.deepEqual(checkAchievements({ ...s, carried: [0, 1] }, { ...s, events: ['merge'] }, ['first_merge']), []);
});

test('quorum, shipped, and flawless', () => {
  const s = base();
  assert.deepEqual(checkAchievements(s, { ...s, events: ['merge', 'quorum'] }, ['first_merge']), ['quorum']);
  assert.deepEqual(checkAchievements(s, { ...s, events: ['level'], levelIndex: 1 }, []), ['shipped', 'flawless']);
  assert.deepEqual(checkAchievements(s, { ...s, events: ['level'], levelIndex: 1, lives: 2 }, []), ['shipped']);
});

test('conflict, survivor, and champion', () => {
  const s = base();
  assert.deepEqual(checkAchievements(s, { ...s, events: ['conflict'] }, []), ['conflict']);
  assert.deepEqual(checkAchievements(s, { ...s, events: ['level'], levelIndex: 3, lives: 1 }, ['shipped']), ['survivor']);
  assert.deepEqual(checkAchievements(s, { ...s, events: ['won'], status: 'won', lives: 1 }, []), ['shipped', 'champion']);
  // Winning with every life earns flawless too.
  assert.deepEqual(checkAchievements(s, { ...s, events: ['won'], status: 'won' }, []), ['shipped', 'flawless', 'champion']);
});

test('nothing happening earns nothing', () => {
  const s = base();
  assert.deepEqual(checkAchievements(s, { ...s, events: [] }, []), []);
  assert.deepEqual(checkAchievements(s, { ...s, events: ['pause', 'resume'] }, []), []);
});

test('the whole rise of ids over one game, in ACHIEVEMENTS order', () => {
  const s = base();
  // One step that merges a full, single-colour hand and hits the quorum
  // while the first pickup is still locked: every id so far at once.
  const n = { ...s, events: ['pickup'] };
  assert.deepEqual(checkAchievements(s, n, []), ['first_pickup']);
  const hand = { ...n, carried: [1, 1, 1] };
  const m = { ...hand, carried: [], events: ['merge', 'quorum'] };
  assert.deepEqual(checkAchievements(hand, m, []), ['first_merge', 'full_hands', 'monochrome', 'quorum']);
  const x = { ...m, events: ['conflict', 'level'], carried: [], levelIndex: 1 };
  assert.deepEqual(checkAchievements(m, x, ['first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum']), ['conflict', 'shipped', 'flawless', 'survivor']);
  const w = { ...x, events: ['won'], status: 'won', levelIndex: 3 };
  assert.deepEqual(checkAchievements(x, w, ['first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum', 'conflict', 'shipped', 'survivor']), ['flawless', 'champion']);
});

test('robustness: odd arguments never throw', () => {
  assert.deepEqual(checkAchievements(null, null, []), []);
  assert.deepEqual(checkAchievements(base(), base(), []), []); // events []
  assert.deepEqual(checkAchievements({ carried: [0, 0, 0] }, { events: ['merge'] }, []), ['first_merge', 'full_hands', 'monochrome']);
  assert.deepEqual(checkAchievements(base(), { events: 'no array' }, []), []);
  assert.deepEqual(checkAchievements(base(), { events: ['won'], levelIndex: 'zzz' }, []), ['shipped', 'champion']);
  assert.deepEqual(checkAchievements(base(), { events: ['level'], levelIndex: 3, lives: null }, []), ['shipped', 'survivor']);
  assert.deepEqual(checkAchievements(base(), { ...base(), events: ['won'] }, ['first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum', 'shipped', 'flawless', 'conflict', 'survivor', 'champion']), []);
});
