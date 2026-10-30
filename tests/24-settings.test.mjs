import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';

const settings = () => load('ui/settings.js');
const DEF = { sound: true, music: true, volume: 0.8, speed: 'normal', colorblind: false };

test('DEFAULT_SETTINGS', async () => {
  assert.deepEqual((await settings()).DEFAULT_SETTINGS, DEF);
});

test('loadSettings applies valid fields', async () => {
  const { loadSettings } = await settings();
  assert.deepEqual(loadSettings('{"sound":false,"music":false,"volume":0.25,"speed":"fast","colorblind":true}'),
    { sound: false, music: false, volume: 0.25, speed: 'fast', colorblind: true });
});

test('loadSettings ignores wrong types and unknown keys', async () => {
  const { loadSettings } = await settings();
  assert.deepEqual(loadSettings('{"sound":"no","volume":"loud","speed":"warp","colorblind":1,"cheat":true}'), DEF);
});

test('loadSettings clamps the volume', async () => {
  const { loadSettings } = await settings();
  assert.equal(loadSettings('{"volume":3}').volume, 1);
  assert.equal(loadSettings('{"volume":-1}').volume, 0);
});

test('loadSettings falls back to the defaults for bad text', async () => {
  const { loadSettings } = await settings();
  for (const t of ['', 'nope', '[]', 'null', '42']) assert.deepEqual(loadSettings(t), DEF, t);
});

test('saveSettings writes exactly the five keys, and loads back', async () => {
  const { saveSettings, loadSettings } = await settings();
  const s = { sound: false, music: true, volume: 0.5, speed: 'slow', colorblind: true };
  const text = saveSettings({ ...s, extra: 1 });
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ['colorblind', 'music', 'sound', 'speed', 'volume']);
  assert.deepEqual(loadSettings(text), s);
});

test('tickMs follows the speed', async () => {
  const { tickMs, DEFAULT_SETTINGS } = await settings();
  assert.equal(tickMs({ ...DEFAULT_SETTINGS, speed: 'slow' }), 160);
  assert.equal(tickMs(DEFAULT_SETTINGS), 120);
  assert.equal(tickMs({ ...DEFAULT_SETTINGS, speed: 'fast' }), 90);
});
