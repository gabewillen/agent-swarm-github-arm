// Local extra tests for src/core/achievements.js (agent's own tests, kept
// out of tests/ run by tests/run.mjs and ci/check.sh on purpose: the
// acceptance suite already has tests/28-achievements.test.mjs, which needs
// src/core/game.js; this file proves the module's logic without it, using
// hand-built states in the shape §5 gives).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, checkAchievements } from '../src/core/achievements.js';
import { START_LIVES } from '../src/core/constants.js';

// A state like init's (§5), trimmed to the fields read here.
function game(extra = {}) {
  return {
    seed: 1, tick: 0, levelTicks: 0, levelIndex: 0, carried: [],
    score: 0, lives: START_LIVES, merges: 0, open: false,
    invuln: 0, status: 'playing', paused: false, events: [], ...extra,
  };
}

test('ACHIEVEMENTS holds the ten ids in DESIGN.md order, titled and described', () => {
  assert.deepEqual(ACHIEVEMENTS.map((a) => a.id), [
    'first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum',
    'shipped', 'flawless', 'conflict', 'survivor', 'champion',
  ]);
  for (const a of ACHIEVEMENTS) {
    assert.equal(typeof a.title, 'string');
    assert.ok(a.title.length > 0);
    assert.equal(typeof a.description, 'string');
    assert.ok(a.description.length > 0);
  }
});

test('a pickup earns first_pickup, once', () => {
  const s = game();
  const n = { ...s, events: ['pickup'], carried: [0] };
  assert.deepEqual(checkAchievements(s, n, []), ['first_pickup']);
  assert.deepEqual(checkAchievements(s, n, ['first_pickup']), []);
});

test('a merge of one patch earns first_merge only', () => {
  const s = game();
  assert.deepEqual(checkAchievements({ ...s, carried: [1] }, { ...s, events: ['merge'] }, []), ['first_merge']);
  assert.deepEqual(checkAchievements({ ...s, carried: [1] }, { ...s, events: ['merge'], merges: 1 }, ['first_merge']), []);
});

test('a merge of three earns full_hands; one colour earns monochrome too', () => {
  const s = game();
  assert.deepEqual(checkAchievements({ ...s, carried: [0, 1, 2] }, { ...s, events: ['merge'] }, ['first_merge']), ['full_hands']);
  assert.deepEqual(checkAchievements({ ...s, carried: [2, 2, 2] }, { ...s, events: ['merge'] }, ['first_merge']), ['full_hands', 'monochrome']);
  assert.deepEqual(checkAchievements({ ...s, carried: [2, 2] }, { ...s, events: ['merge'] }, []), ['first_merge']);
  assert.deepEqual(checkAchievements({ ...s, carried: [] }, { ...s, events: ['merge'] }, []), ['first_merge']);
});

test('the quorum event earns quorum', () => {
  const s = game();
  assert.deepEqual(checkAchievements(s, { ...s, events: ['merge', 'quorum'], merges: 3, open: true }, ['first_merge']), ['quorum']);
});

test('a level event earns shipped, and flawless with all lives', () => {
  const s = game();
  assert.deepEqual(checkAchievements(s, { ...s, events: ['level'], levelIndex: 1 }, []), ['shipped', 'flawless']);
  assert.deepEqual(checkAchievements(s, { ...s, events: ['level'], levelIndex: 1, lives: 2 }, []), ['shipped']);
});

test('a conflict, the fourth level, and a win', () => {
  const s = game();
  assert.deepEqual(checkAchievements(s, { ...s, events: ['conflict'], conflicts: [{ x: 2, y: 1, ttl: 10 }] }, []), ['conflict']);
  assert.deepEqual(checkAchievements(s, { ...s, events: ['level'], levelIndex: 3, lives: 1 }, ['shipped']), ['survivor']);
  // A win is a ship of the last level: shipped and champion, no flawless
  // at one life, and no survivor (only a level event reaches index 3).
  assert.deepEqual(checkAchievements(s, { ...s, events: ['won'], status: 'won', lives: 1 }, []), ['shipped', 'champion']);
});

test('a step with no events earns nothing', () => {
  const s = game();
  assert.deepEqual(checkAchievements(s, { ...s, tick: 1, levelTicks: 1 }, []), []);
});

test('one step can earn all ten, and again earns none', () => {
  const s = game({ carried: [3, 3, 3] });
  const next = { ...s, events: ['pickup', 'merge', 'quorum', 'level', 'conflict', 'won'], carried: [], conflicts: [{ x: 1, y: 1, ttl: 10 }], levelIndex: 3, lives: START_LIVES };
  const all = ACHIEVEMENTS.map((a) => a.id);
  assert.deepEqual(checkAchievements(s, next, all), []);
  assert.deepEqual(checkAchievements(s, next, []), all);
});

test('the ids come back in ACHIEVEMENTS order, not event order', () => {
  const s = game();
  const n = { ...s, events: ['won', 'conflict'], status: 'won', lives: 1 };
  assert.deepEqual(checkAchievements(s, n, []), ['shipped', 'conflict', 'champion']);
});

test('a whole pickup-and-merge run earns five achievements in order (§6 shape)', () => {
  // The hands and events a real step loop would report for four right
  // steps from the start of the §21 map, patches all colour 1 (§6 steps
  // 6 to 8: three pickups, then a merge of three on the pad, opening the
  // quorum of three).
  let s = game();
  const hands = [];
  const moves = ['pickup', 'pickup', 'pickup', 'merge'];
  const unlocked = [];
  for (let i = 0; i < moves.length; i++) {
    const events = [moves[i]];
    const next = { ...s, tick: i + 1, levelTicks: i + 1 };
    if (moves[i] === 'pickup') { hands.push(1); next.events = events; next.carried = [...hands]; next.patches = []; }
    else {
      next.events = [...events, 'quorum'];
      next.carried = [];
      next.merges = 3;
      next.open = true;
      next.score = 300 + 150;
    }
    unlocked.push(...checkAchievements(s, next, unlocked));
    s = next;
  }
  assert.deepEqual(unlocked, ['first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum']);
});
