import assert from 'node:assert/strict';
import { addScore, formatScore, parseTable } from '../src/ui/scores.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, tickMs } from '../src/ui/settings.js';
import { TICK_MS } from '../src/core/constants.js';

const DEF = { sound: true, music: true, volume: 0.8, speed: 'normal', colorblind: false };
assert.deepEqual(DEFAULT_SETTINGS, DEF);

// scores
assert.deepEqual(addScore([{ name: 'a', score: 10 }], { name: 'b', score: 20 }), [{ name: 'b', score: 20 }, { name: 'a', score: 10 }]);
assert.deepEqual(addScore([{ name: 'a', score: 10 }], { name: 'b', score: 10 }).map((e) => e.name), ['a', 'b']);
let t = [];
for (let i = 1; i <= 12; i++) t = addScore(t, { name: `p${i}`, score: i * 10 });
assert.equal(t.length, 10);
assert.equal(t[0].score, 120);
assert.equal(t[9].score, 30);
const frozen = Object.freeze([{ name: 'a', score: 5 }]);
addScore(frozen, { name: 'b', score: 7 });
assert.equal(frozen.length, 1);
assert.equal(formatScore(0), '000000');
assert.equal(formatScore(420), '000420');
assert.equal(formatScore(999999), '999999');
assert.equal(formatScore(1234567), '999999');
assert.deepEqual(parseTable('[{"name":"a","score":3}]'), [{ name: 'a', score: 3 }]);
for (const txt of ['', 'nope', '{}', '[1]', '[{"name":1,"score":2}]', '[{"name":"a","score":1.5}]', 'null']) {
  assert.deepEqual(parseTable(txt), [], txt);
}

// settings
assert.deepEqual(loadSettings('{"sound":false,"music":false,"volume":0.25,"speed":"fast","colorblind":true}'),
  { sound: false, music: false, volume: 0.25, speed: 'fast', colorblind: true });
assert.deepEqual(loadSettings('{"sound":"no","volume":"loud","speed":"warp","colorblind":1,"cheat":true}'), DEF);
assert.equal(loadSettings('{"volume":3}').volume, 1);
assert.equal(loadSettings('{"volume":-1}').volume, 0);
for (const txt of ['', 'nope', '[]', 'null', '42']) assert.deepEqual(loadSettings(txt), DEF, txt);
const s = { sound: false, music: true, volume: 0.5, speed: 'slow', colorblind: true };
const text = saveSettings({ ...s, extra: 1 });
assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ['colorblind', 'music', 'sound', 'speed', 'volume']);
assert.deepEqual(loadSettings(text), s);
assert.equal(tickMs({ ...DEF, speed: 'slow' }), 160);
assert.equal(tickMs(DEF), TICK_MS);
assert.equal(tickMs({ ...DEF, speed: 'fast' }), 90);

console.log('scores+settings local checks: all pass');
