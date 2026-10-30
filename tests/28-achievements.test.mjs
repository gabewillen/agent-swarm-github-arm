import test from 'node:test';
import assert from 'node:assert/strict';
import { load, game } from './helpers.mjs';

const IDS = ['first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum', 'shipped', 'flawless', 'conflict', 'survivor', 'champion'];
const ach = () => load('core/achievements.js');
const MAP = ['########', '#@PPPM.#', '#X.....#', '########'];

test('ACHIEVEMENTS lists the ten ids in order with titles and descriptions', async () => {
  const { ACHIEVEMENTS } = await ach();
  assert.deepEqual(ACHIEVEMENTS.map((a) => a.id), IDS);
  for (const a of ACHIEVEMENTS) {
    assert.ok(typeof a.title === 'string' && a.title.length > 0);
    assert.ok(typeof a.description === 'string' && a.description.length > 0);
  }
});

test('a pickup earns first_pickup once', async () => {
  const { checkAchievements } = await ach();
  const s = await game(MAP);
  const n = { ...s, events: ['pickup'], carried: [0] };
  assert.deepEqual(checkAchievements(s, n, []), ['first_pickup']);
  assert.deepEqual(checkAchievements(s, n, ['first_pickup']), []);
});

test('merging one patch earns first_merge only', async () => {
  const { checkAchievements } = await ach();
  const s = await game(MAP, { quorum: 9 });
  assert.deepEqual(checkAchievements({ ...s, carried: [1] }, { ...s, events: ['merge'] }, []), ['first_merge']);
});

test('merging three earns full_hands; one colour earns monochrome too', async () => {
  const { checkAchievements } = await ach();
  const s = await game(MAP, { quorum: 9 });
  assert.deepEqual(checkAchievements({ ...s, carried: [0, 1, 2] }, { ...s, events: ['merge'] }, ['first_merge']), ['full_hands']);
  assert.deepEqual(checkAchievements({ ...s, carried: [2, 2, 2] }, { ...s, events: ['merge'] }, ['first_merge']), ['full_hands', 'monochrome']);
});

test('quorum, shipped, and flawless', async () => {
  const { checkAchievements } = await ach();
  const s = await game(MAP);
  assert.deepEqual(checkAchievements(s, { ...s, events: ['merge', 'quorum'] }, ['first_merge']), ['quorum']);
  assert.deepEqual(checkAchievements(s, { ...s, events: ['level'], levelIndex: 1 }, []), ['shipped', 'flawless']);
  assert.deepEqual(checkAchievements(s, { ...s, events: ['level'], levelIndex: 1, lives: 2 }, []), ['shipped']);
});

test('conflict, survivor, and champion', async () => {
  const { checkAchievements } = await ach();
  const s = await game(MAP);
  assert.deepEqual(checkAchievements(s, { ...s, events: ['conflict'] }, []), ['conflict']);
  assert.deepEqual(checkAchievements(s, { ...s, events: ['level'], levelIndex: 3, lives: 1 }, ['shipped']), ['survivor']);
  assert.deepEqual(checkAchievements(s, { ...s, events: ['won'], status: 'won', lives: 1 }, []), ['shipped', 'champion']);
});

test('nothing happening earns nothing', async () => {
  const { checkAchievements } = await ach();
  const s = await game(MAP);
  assert.deepEqual(checkAchievements(s, { ...s, events: [] }, []), []);
});

test('a real game earns achievements in order', async () => {
  const { checkAchievements } = await ach();
  const { step } = await load('core/game.js');
  let s = await game(MAP, { quorum: 3 });
  s = { ...s, patches: s.patches.map((p) => ({ ...p, color: 1 })) };
  const unlocked = [];
  for (const m of ['right', 'right', 'right', 'right']) {
    const n = step(s, { move: m, pause: false });
    unlocked.push(...checkAchievements(s, n, unlocked));
    s = n;
  }
  assert.deepEqual(unlocked, ['first_pickup', 'first_merge', 'full_hands', 'monochrome', 'quorum']);
});
