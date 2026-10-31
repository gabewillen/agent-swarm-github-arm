// Extra coverage for src/ui/scores.js and src/ui/settings.js beyond the
// acceptance tests (my part: agent-13, area 14). Nothing under tests/ is
// touched; run with:
//   node --test selftest/agent-13-ui-scores-settings.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const scores = await import('../src/ui/scores.js');
const settings = await import('../src/ui/settings.js');

const DEF = { sound: true, music: true, volume: 0.8, speed: 'normal', colorblind: false };

test('addScore keeps earlier ties in order and the entry last among equals', () => {
  const t = [{ name: 'a', score: 10 }, { name: 'b', score: 10 }, { name: 'c', score: 9 }];
  const out = scores.addScore(t, { name: 'd', score: 10 });
  assert.deepEqual(out.map((e) => e.name), ['a', 'b', 'd', 'c']);
});

test('addScore returns entries with a lower score still in place', () => {
  const t = [{ name: 'a', score: 50 }, { name: 'b', score: 5 }];
  const out = scores.addScore(t, { name: 'c', score: 20 });
  assert.deepEqual(out.map((e) => e.name), ['a', 'c', 'b']);
});

test('addScore cuts to 10 but never mutates its input', () => {
  let t = [];
  for (let i = 0; i < 15; i++) t = scores.addScore(t, { name: `p${i}`, score: i });
  assert.equal(t.length, 10);
  assert.deepEqual(t.map((e) => e.score), [14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
});

test('formatScore floors, clamps low, and caps high', () => {
  assert.equal(scores.formatScore(-7), '000000');
  assert.equal(scores.formatScore(999998), '999998');
  assert.equal(scores.formatScore(1e9), '999999');
});

test('parseTable accepts scores of 0 and entries with extra keys', () => {
  assert.deepEqual(scores.parseTable('[{"name":"a","score":0,"why":"n"}]'), [{ name: 'a', score: 0, why: 'n' }]);
});

test('parseTable rejects an array holding any bad entry', () => {
  assert.deepEqual(scores.parseTable('[{"name":"a","score":3},{"name":"b"}]'), []);
  assert.deepEqual(scores.parseTable('[null]'), []);
  assert.deepEqual(scores.parseTable('["x"]'), []);
  assert.deepEqual(scores.parseTable('[[]]'), []);
});

test('loadSettings leaves DEFAULT_SETTINGS alone', () => {
  const before = { ...settings.DEFAULT_SETTINGS };
  settings.loadSettings('{"sound":false,"volume":0}');
  assert.deepEqual({ ...settings.DEFAULT_SETTINGS }, before);
});

test('loadSettings ignores case-mismatched and speed-like junk', () => {
  assert.deepEqual(settings.loadSettings('{"speed":"SLOW","music":true,}').speed, 'normal');
  assert.deepEqual(settings.loadSettings('{"speed":"fastest"}').speed, 'normal');
});

test('loadSettings clamps within and keeps ordinary values', () => {
  assert.deepEqual(settings.loadSettings('{"volume":1,"speed":"slow"}'),
    { ...DEF, volume: 1, speed: 'slow' });
  assert.deepEqual(settings.loadSettings('{"volume":0,"speed":"fast"}'),
    { ...DEF, volume: 0, speed: 'fast' });
});

test('saveSettings defaults the missing five keys and never adds a sixth', () => {
  const text = settings.saveSettings(undefined);
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ['colorblind', 'music', 'sound', 'speed', 'volume']);
  assert.deepEqual(settings.loadSettings(text), DEF);
  assert.deepEqual(settings.loadSettings(settings.saveSettings(null)), DEF);
});

test('saveSettings normalizes junk values so loadSettings is sane', () => {
  assert.deepEqual(settings.loadSettings(settings.saveSettings({ sound: 'no', volume: 'loud', speed: 'warp' })), DEF);
  assert.deepEqual(settings.loadSettings(settings.saveSettings({ volume: 9 })), { ...DEF, volume: 1 });
});

test('tickMs treats missing or partial settings as normal speed', () => {
  assert.equal(settings.tickMs(), 120);
  assert.equal(settings.tickMs({}), 120);
  assert.equal(settings.tickMs({ speed: 'nope' }), 120);
});
