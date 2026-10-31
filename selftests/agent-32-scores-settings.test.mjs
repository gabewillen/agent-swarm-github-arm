// Self-test for agent-32's area: the high-score table (DESIGN.md §14,
// src/ui/scores.js) and player settings (§17, src/ui/settings.js).
// Not part of the acceptance suite (tests/ is pinned); run with:
//   node --test selftests/agent-32-scores-settings.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { addScore, formatScore, parseTable } from '../src/ui/scores.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, tickMs } from '../src/ui/settings.js';

test('addScore keeps best-first order, ties after equals, and caps at 10', () => {
  assert.deepEqual(addScore([], { name: 'x', score: 1 }), [{ name: 'x', score: 1 }]);
  let t = [{ name: 'a', score: 100 }, { name: 'b', score: 50 }];
  t = addScore(t, { name: 'c', score: 50 });
  assert.deepEqual(t.map((e) => e.name), ['a', 'b', 'c']);
  for (let i = 0; i < 12; i++) t = addScore(t, { name: `n${i}`, score: 900 + i });
  assert.equal(t.length, 10);
  assert.equal(t[0].score, 911);
});

test('addScore does not change its argument', () => {
  const t = [Object.freeze({ name: 'a', score: 5 })];
  const snap = JSON.stringify(t);
  const out = addScore(t, { name: 'z', score: 9 });
  assert.equal(JSON.stringify(t), snap);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 'z');
});

test('formatScore pads to 6 digits and caps', () => {
  assert.equal(formatScore(0), '000000');
  assert.equal(formatScore(420), '000420');
  assert.equal(formatScore(999999), '999999');
  assert.equal(formatScore(1234567), '999999');
});

test('parseTable validates every entry and fails whole on any bad one', () => {
  assert.deepEqual(parseTable('[{"name":"a","score":3}]'), [{ name: 'a', score: 3 }]);
  assert.deepEqual(parseTable('[{"name":"a","score":0}]'), [{ name: 'a', score: 0 }]);
  for (const t of ['', 'nope', '{}', '[1]', '[{"name":1,"score":2}]', '[{"name":"a","score":1.5}]',
    '[null]', '[[]]', '[{"score":3}]', '[{"name":"a"}]', 'null']) {
    assert.deepEqual(parseTable(t), [], t);
  }
});

test('DEFAULT_SETTINGS stays untouched by loadSettings', () => {
  const before = JSON.stringify(DEFAULT_SETTINGS);
  loadSettings('{"sound":false,"volume":1}');
  loadSettings('junk');
  assert.equal(JSON.stringify(DEFAULT_SETTINGS), before);
  assert.deepEqual(loadSettings('{"sound":false,"volume":1}'),
    { sound: false, music: true, volume: 1, speed: 'normal', colorblind: false });
});

test('volume clamps, speed whitelists, junk falls back to defaults', () => {
  assert.equal(loadSettings('{"volume":3}').volume, 1);
  assert.equal(loadSettings('{"volume":-1}').volume, 0);
  assert.equal(loadSettings('{"volume":0}').volume, 0);
  assert.deepEqual(loadSettings('{}'), DEFAULT_SETTINGS);
  for (const t of ['', 'nope', '[]', 'null', '42', '"{}"', '{"speed":"warp"}']) {
    assert.deepEqual(loadSettings(t), DEFAULT_SETTINGS, t);
  }
});

test('saveSettings writes exactly the five keys and loads back', () => {
  const s = { sound: false, music: true, volume: 0.5, speed: 'slow', colorblind: true };
  const text = saveSettings({ ...s, extra: 1 });
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ['colorblind', 'music', 'sound', 'speed', 'volume']);
  assert.deepEqual(loadSettings(text), s);
  assert.deepEqual(loadSettings(saveSettings(null)), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(saveSettings({ sound: 'x' })), DEFAULT_SETTINGS);
});

test('tickMs follows the speed and defaults to TICK_MS', () => {
  assert.equal(tickMs({ speed: 'slow' }), 160);
  assert.equal(tickMs({ speed: 'normal' }), 120);
  assert.equal(tickMs({ speed: 'fast' }), 90);
  assert.equal(tickMs(DEFAULT_SETTINGS), 120);
  assert.equal(tickMs(null), 120);
  assert.equal(tickMs(undefined), 120);
  assert.equal(tickMs({}), 120);
});
