import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';

const music = () => load('audio/music.js');

test('SCALE and ROOT_HZ', async () => {
  const m = await music();
  assert.deepEqual(m.SCALE, [0, 2, 3, 5, 7, 8, 10]);
  assert.equal(m.ROOT_HZ, 220);
});

test('noteHz follows the scale and octaves', async () => {
  const { noteHz } = await music();
  assert.equal(noteHz(0), 220);
  assert.equal(noteHz(0, 1), 440);
  assert.equal(noteHz(0, -1), 110);
  assert.ok(Math.abs(noteHz(4) - 220 * 2 ** (7 / 12)) < 1e-9);
  assert.ok(Math.abs(noteHz(7) - 440) < 1e-9);
  assert.ok(Math.abs(noteHz(-1) - 220 * 2 ** (-2 / 12)) < 1e-9);
});

test('tempo rises with the level and caps at 160', async () => {
  const { tempo } = await music();
  assert.equal(tempo(0), 96);
  assert.equal(tempo(3), 120);
  assert.equal(tempo(20), 160);
});

test('a bar is 8 steps of rests and in-range notes', async () => {
  const { bar } = await music();
  for (let l = 0; l < 5; l++) {
    for (let b = 0; b < 4; b++) {
      const steps = bar(l, b);
      assert.equal(steps.length, 8);
      for (const s of steps) {
        if (s === null) continue;
        assert.ok(Number.isInteger(s.degree) && s.degree >= 0 && s.degree <= 6);
        assert.ok(Number.isInteger(s.octave) && s.octave >= -1 && s.octave <= 1);
      }
      assert.ok(steps.filter(Boolean).length >= 3);
    }
  }
});

test('bars are pure and loop every 4', async () => {
  const { bar } = await music();
  assert.deepEqual(bar(2, 1), bar(2, 1));
  assert.deepEqual(bar(2, 1), bar(2, 5));
  assert.deepEqual(bar(0, 3), bar(0, 11));
});

test('different levels sound different', async () => {
  const { bar } = await music();
  const tunes = new Set();
  for (let l = 0; l < 6; l++) tunes.add(JSON.stringify([0, 1, 2, 3].map((b) => bar(l, b))));
  assert.ok(tunes.size >= 5);
});

test('scheduleBar plays each note on time and rests make nothing', async () => {
  const { scheduleBar, noteHz } = await music();
  const oscs = [];
  const gains = [];
  const ctx = {
    destination: { name: 'destination' },
    createOscillator() { const o = { type: 'sine', frequency: { value: 0 }, to: [], connect(n) { this.to.push(n); return n; }, start(t) { this.t0 = t; }, stop(t) { this.t1 = t; } }; oscs.push(o); return o; },
    createGain() { const g = { gain: { value: 1 }, to: [], connect(n) { this.to.push(n); return n; } }; gains.push(g); return g; },
  };
  const steps = [{ degree: 0, octave: 0 }, null, { degree: 2, octave: 1 }, null, null, null, null, { degree: 6, octave: -1 }];
  scheduleBar(ctx, steps, 10, 120, 0.3);
  assert.equal(oscs.length, 3);
  assert.deepEqual(oscs.map((o) => o.t0), [10, 10.5, 11.75]);
  assert.deepEqual(oscs.map((o) => o.frequency.value), [noteHz(0, 0), noteHz(2, 1), noteHz(6, -1)]);
  for (const o of oscs) {
    assert.equal(o.type, 'triangle');
    assert.ok(o.t1 > o.t0 && o.t1 - o.t0 <= 0.25 + 1e-9);
    assert.ok(gains.includes(o.to[0]));
  }
  for (const g of gains) {
    assert.equal(g.gain.value, 0.3);
    assert.equal(g.to[0].name, 'destination');
  }
});
