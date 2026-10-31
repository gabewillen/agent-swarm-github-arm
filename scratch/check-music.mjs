// Scratch sanity checks for my part (src/audio/music.js, §24). Not part of
// the acceptance suite; run with `node scratch/check-music.mjs`.
import assert from 'node:assert/strict';
import * as m from '../src/audio/music.js';

// SCALE / ROOT_HZ
assert.deepEqual(m.SCALE, [0, 2, 3, 5, 7, 8, 10]);
assert.equal(m.ROOT_HZ, 220);

// noteHz formula across degrees and octaves, including negatives
for (const [d, o] of [[0, 0], [3, 0], [6, 0], [7, 0], [9, -1], [14, 1], [-1, 0], [-8, -1]]) {
  const expect = 220 * 2 ** (([0, 2, 3, 5, 7, 8, 10][((d % 7) + 7) % 7] + 12 * (o + Math.floor(d / 7))) / 12);
  assert.ok(Math.abs(m.noteHz(d, o) - expect) < 1e-9, `noteHz(${d}, ${o})`);
}
assert.equal(m.noteHz(0), 220);

// tempo
assert.equal(m.tempo(0), 96);
assert.equal(m.tempo(3), 120);
assert.equal(m.tempo(8), 160);
assert.equal(m.tempo(20), 160);

// bars: shape, ranges, purity, the loop of 4, distinctness
let distinct = new Set();
for (let l = 0; l < 40; l++) {
  const tune = [0, 1, 2, 3, 4, 5, 6, 7, 8, 11].map((b) => m.bar(l, b));
  for (const steps of tune) {
    assert.equal(steps.length, 8);
    let notes = 0;
    for (const s of steps) {
      if (s === null) continue;
      notes++;
      assert.ok(Number.isInteger(s.degree) && s.degree >= 0 && s.degree <= 6, JSON.stringify(s));
      assert.ok(Number.isInteger(s.octave) && s.octave >= -1 && s.octave <= 1, JSON.stringify(s));
    }
    assert.ok(notes >= 3, `level ${l} bar has ${notes} notes`);
  }
  for (let b = 0; b < 4; b++) {
    assert.deepEqual(m.bar(l, b), m.bar(l, b + 4), `loop ${l} ${b}`);
    assert.deepEqual(m.bar(l, b), m.bar(l, b), 'pure');
  }
  distinct.add(JSON.stringify([0, 1, 2, 3].map((b) => m.bar(l, b))));
}
assert.ok(distinct.size >= 39, `distinct tunes: ${distinct.size}/40`);

// scheduleBar on a tiny fake context: notes on time, rests silent
const oscs = [];
const gains = [];
const ctx = {
  destination: { name: 'destination' },
  createOscillator() { const o = { type: '', frequency: { value: 0 }, to: [], connect(n) { this.to.push(n); return n; }, start(t) { this.t0 = t; }, stop(t) { this.t1 = t; } }; oscs.push(o); return o; },
  createGain() { const g = { gain: { value: 1 }, to: [], connect(n) { this.to.push(n); return n; } }; gains.push(g); return g; },
};
const steps = [{ degree: 5, octave: 0 }, null, { degree: 0, octave: 1 }];
m.scheduleBar(ctx, steps, 2, 96, 0.5);
assert.equal(oscs.length, 2);
assert.deepEqual(oscs.map((o) => o.t0), [2, 2 + 2 * 30 / 96]);
assert.deepEqual(oscs.map((o) => o.frequency.value), [m.noteHz(5, 0), m.noteHz(0, 1)]);
assert.equal(oscs[0].type, 'triangle');
for (const o of oscs) {
  assert.ok(o.t1 > o.t0 && o.t1 - o.t0 <= 30 / 96 + 1e-9);
  assert.ok(gains.includes(o.to[0]));
}
for (const g of gains) {
  assert.equal(g.gain.value, 0.5);
  assert.equal(g.to[0].name, 'destination');
}
// an all-rest bar schedules nothing
oscs.length = 0;
m.scheduleBar(ctx, [null, null, null], 0, 120, 1);
assert.equal(oscs.length, 0);

console.log('scratch music checks pass');
