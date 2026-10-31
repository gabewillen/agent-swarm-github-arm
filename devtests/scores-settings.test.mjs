// Extra tests for area 14 (src/ui/scores.js and src/ui/settings.js),
// beyond tests/22-scores.test.mjs and tests/24-settings.test.mjs:
//   node --test devtests/
// The settings tests only register once src/core/constants.js (TICK_MS)
// exists on the branch, because settings.js imports it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deepFreeze } from '../tests/helpers.mjs';

const load = (rel) => import(new URL(`../src/${rel}`, import.meta.url).href);
const scores = await load('ui/scores.js');

let settings = null;
try {
  settings = await load('ui/settings.js');
} catch {
  settings = null;
}

// ---- scores.js -----------------------------------------------------------

test('addScore on an empty table holds just the entry', () => {
  assert.deepEqual(scores.addScore([], { name: 'a', score: 7 }), [{ name: 'a', score: 7 }]);
});

test('addScore sorts descending', () => {
  let t = [];
  for (const s of [50, 10, 70, 30]) t = scores.addScore(t, { name: `p${s}`, score: s });
  assert.deepEqual(t.map((e) => e.score), [70, 50, 30, 10]);
});

test('addScore ties all sit behind the older ties', () => {
  let t = [{ name: 'a', score: 5 }];
  t = scores.addScore(t, { name: 'b', score: 5 });
  t = scores.addScore(t, { name: 'c', score: 5 });
  assert.deepEqual(t.map((e) => e.name), ['a', 'b', 'c']);
});

test('addScore keeps exactly 10 and the best ones', () => {
  let t = [];
  for (let i = 1; i <= 11; i++) t = scores.addScore(t, { name: `p${i}`, score: -i });
  assert.equal(t.length, 10);
  assert.deepEqual(t.map((e) => e.score), Array.from({ length: 10 }, (_, i) => -(i + 1)));
});

test('addScore leaves its argument untouched', () => {
  const t = deepFreeze([{ name: 'a', score: 1 }]);
  const out = scores.addScore(t, { name: 'b', score: 2 });
  assert.equal(t.length, 1);
  assert.equal(out.length, 2);
});

test('formatScore floors and clamps', () => {
  assert.equal(scores.formatScore(-5), '000000');
  assert.equal(scores.formatScore(1000000), '999999');
  assert.equal(scores.formatScore(1.9), '000001');
  assert.equal(scores.formatScore('420'), '000420');
});

test('parseTable is all-or-nothing', () => {
  assert.deepEqual(scores.parseTable('[{"name":"a","score":3}]'), [{ name: 'a', score: 3 }]);
  assert.deepEqual(scores.parseTable('[{"name":"a","score":3},{"name":"b","score":true}]'), []);
  assert.deepEqual(scores.parseTable('["x"]'), []);
  assert.deepEqual(scores.parseTable('[[1]]'), []);
  assert.deepEqual(scores.parseTable('[]'), []);
  assert.deepEqual(scores.parseTable('{"name":"a","score":3}'), []);
  assert.deepEqual(scores.parseTable('{"a":1}'), []);
  assert.deepEqual(scores.parseTable('[null]'), []);
  assert.deepEqual(scores.parseTable('{"name":"a","score":3},]'), []);
});

test('parseTable keeps name and score', () => {
  assert.deepEqual(scores.parseTable('[{"name":"a","score":3,"extra":true}]'), [{ name: 'a', score: 3 }]);
  assert.deepEqual(scores.parseTable('[{"name":"","score":-4}]'), [{ name: '', score: -4 }]);
});

// ---- settings.js ---------------------------------------------------------

const DEF = { sound: true, music: true, volume: 0.8, speed: 'normal', colorblind: false };

if (settings !== null) {
  test('loadSettings applies fields one at a time', () => {
    assert.deepEqual(settings.loadSettings('{"sound":false}'), { ...DEF, sound: false }, 'sound');
    assert.deepEqual(settings.loadSettings('{"music":false}'), { ...DEF, music: false }, 'music');
    assert.deepEqual(settings.loadSettings('{"colorblind":true}'), { ...DEF, colorblind: true }, 'colorblind');
    assert.deepEqual(settings.loadSettings('{"volume":0}'), { ...DEF, volume: 0 }, 'volume');
    assert.deepEqual(settings.loadSettings('{"speed":"slow"}'), { ...DEF, speed: 'slow' }, 'speed');
  });

  test('loadSettings returns a fresh object each call', () => {
    const a = settings.loadSettings('{"sound":false}');
    const b = settings.loadSettings('{}');
    assert.equal(a.sound, false);
    assert.equal(b.sound, true);
    assert.notEqual(a, settings.DEFAULT_SETTINGS);
  });

  test('loadSettings ignores null and nested wrong shapes', () => {
    assert.deepEqual(settings.loadSettings('[{"sound":true}]'), DEF);
    assert.deepEqual(settings.loadSettings('null'), DEF);
    assert.deepEqual(settings.loadSettings('{"sound":{"x":1}}'), DEF);
  });

  test('loadSettings clamps the volume only for numbers', () => {
    assert.equal(settings.loadSettings('{"volume":2.5}').volume, 1);
    assert.equal(settings.loadSettings('{"volume":0.123}').volume, 0.123);
    assert.equal(settings.loadSettings('{"volume":true}').volume, 0.8);
  });

  test('saveSettings keeps valid values and falls back on holes', () => {
    assert.deepEqual(JSON.parse(settings.saveSettings({ sound: false, volume: 1 })),
      { sound: false, music: true, volume: 1, speed: 'normal', colorblind: false });
    assert.deepEqual(settings.loadSettings(settings.saveSettings(DEF)), DEF);
    assert.deepEqual(settings.loadSettings(settings.saveSettings(null)), DEF);
  });

  test('tickMs falls back to TICK_MS for an unknown speed', () => {
    assert.equal(settings.tickMs({}), 120);
    assert.equal(settings.tickMs({ speed: 'warp' }), 120);
  });
}
