// Scratch checks for src/audio/music.js beyond the acceptance test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../tests/helpers.mjs';

const music = () => load('audio/music.js');

test('bar loops exactly every 4 for far and negative barIndexes', async () => {
  const { bar } = await music();
  for (let l = 0; l < 8; l++) {
    for (let b = 0; b < 8; b++) {
      assert.deepEqual(bar(l, b), bar(l, b + 4), `l=${l} b=${b}`);
      assert.deepEqual(bar(l, b), bar(l, b + 400), `l=${l} b=${b} +400`);
      assert.deepEqual(bar(l, b), bar(l, b - 4), `l=${l} b=${b} -4`);
    }
  }
});

test('levels sound distinct over a wide range', async () => {
  const { bar } = await music();
  const tunes = new Set();
  for (let l = 0; l < 24; l++) tunes.add(JSON.stringify([0, 1, 2, 3].map((b) => bar(l, b))));
  assert.ok(tunes.size >= 22, `only ${tunes.size} distinct of 24`);
});

test('every bar of many levels obeys the shape', async () => {
  const { bar } = await music();
  for (let l = 0; l < 24; l++) {
    for (let b = 0; b < 12; b++) {
      const steps = bar(l, b);
      assert.equal(steps.length, 8);
      assert.ok(steps.filter(Boolean).length >= 3, `l=${l} b=${b}`);
      for (const s of steps) {
        if (s === null) continue;
        assert.ok(Number.isInteger(s.degree) && s.degree >= 0 && s.degree <= 6);
        assert.ok(Number.isInteger(s.octave) && s.octave >= -1 && s.octave <= 1);
      }
    }
  }
});

test('bar is pure: does not mutate its inputs and returns fresh data', async () => {
  const { bar } = await music();
  const a = bar(3, 2);
  const b = bar(3, 2);
  assert.notEqual(a, b);
  assert.deepEqual(a, b);
});

test('noteHz edges: big degrees, negative degrees', async () => {
  const { noteHz } = await music();
  assert.equal(noteHz(14), noteHz(0, 2));
  assert.equal(noteHz(-8), noteHz(-1, -1));
  assert.ok(noteHz(6, -1) > 0);
  assert.ok(Number.isFinite(noteHz(6, 1)));
});

test('tempo caps below 160 and starts at 96', async () => {
  const { tempo } = await music();
  for (let l = 0; l <= 40; l++) assert.ok(tempo(l) <= 160 && tempo(l) >= 96);
  assert.equal(tempo(8), 160);
});

test('scheduleBar with all rests makes nothing', async () => {
  const { scheduleBar } = await music();
  let created = 0;
  const ctx = {
    destination: {},
    createOscillator() { created++; return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; },
    createGain() { created++; return { gain: { value: 0 }, connect() {} }; },
  };
  scheduleBar(ctx, [null, null, null, null, null, null, null, null], 0, 120, 0.3);
  assert.equal(created, 0);
});

test('scheduleBar honors bpm timings at the cap', async () => {
  const { scheduleBar } = await music();
  const oscs = [];
  const ctx = {
    destination: {},
    createOscillator() { const o = { frequency: { value: 0 }, connect() {}, start(t) { o.t0 = t; }, stop(t) { o.t1 = t; } }; oscs.push(o); return o; },
    createGain() { return { gain: { value: 0 }, connect() {} }; },
  };
  const steps = Array.from({ length: 8 }, (_, i) => (i % 2 ? null : { degree: i / 2, octave: 0 }));
  scheduleBar(ctx, steps, 5, 160, 0.2);
  const stepDur = 30 / 160;
  assert.deepEqual(oscs.map((o) => o.t0), [5, 5 + 2 * stepDur, 5 + 4 * stepDur, 5 + 6 * stepDur]);
  for (const o of oscs) assert.ok(o.t1 - o.t0 <= stepDur + 1e-9);
});

test('scheduleBar keeps every note frequency consistent with noteHz', async () => {
  const { scheduleBar, noteHz, bar, tempo } = await music();
  const freqs = [];
  const ctx = {
    destination: {},
    createOscillator() { const o = { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; freqs.push(o.frequency); return o; },
    createGain() { return { gain: { value: 0 }, connect() {} }; },
  };
  const steps = bar(7, 3);
  scheduleBar(ctx, steps, 0, tempo(7), 0.25);
  const want = steps.filter(Boolean).map((s) => noteHz(s.degree, s.octave));
  assert.deepEqual(freqs.map((f) => f.value), want);
});

test('importing the module is side-effect free', async () => {
  const before = Object.keys(globalThis).length;
  await music();
  assert.equal(Object.keys(globalThis).length, before);
});
