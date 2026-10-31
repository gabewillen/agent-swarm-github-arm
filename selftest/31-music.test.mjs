// agent-30's selfcheck of generative music (DESIGN.md §24). Goes beyond
// tests/31-music.test.mjs: pitch folding over a wide degree/octave grid, a
// purity and range sweep over level/bar space, a pin on the shipped tune,
// and scheduleBar timing at several tempos. Only src/audio/music.js is
// imported, so §24 is verified on its own — and nothing under tests/ is
// touched. Run with `node --test selftest/`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCALE, ROOT_HZ, noteHz, tempo, bar, scheduleBar } from '../src/audio/music.js';

test('SCALE and ROOT_HZ are the natural minor over 220 Hz', () => {
  assert.deepEqual(SCALE, [0, 2, 3, 5, 7, 8, 10]);
  assert.equal(ROOT_HZ, 220);
});

test('noteHz folds degrees and octaves per the §24 formula', () => {
  // The formula, computed independently of the module.
  const hz = (d, o = 0) => ROOT_HZ * 2 ** ((SCALE[((d % 7) + 7) % 7] + 12 * (o + Math.floor(d / 7))) / 12);
  for (let d = -21; d <= 21; d++) {
    for (let o = -2; o <= 2; o++) {
      const got = noteHz(d, o);
      assert.ok(Math.abs(got - hz(d, o)) < 1e-9, `noteHz(${d}, ${o})`);
      assert.ok(got > 0 && Number.isFinite(got));
    }
  }
  // The octave wraps of the tonic land exactly, and degree mod 7 is never
  // negative even for multiples of -7.
  assert.equal(noteHz(0), ROOT_HZ);
  assert.equal(noteHz(0, 1), ROOT_HZ * 2);
  assert.equal(noteHz(0, -1), ROOT_HZ / 2);
  assert.equal(noteHz(7), noteHz(0) * 2);
  assert.equal(noteHz(-7), noteHz(0, -1));
  assert.equal(noteHz(14), noteHz(0, 2));
  assert.equal(noteHz(-1), ROOT_HZ * 2 ** (-2 / 12));
});

test('tempo rises by 8 bpm per level and caps at 160', () => {
  for (let l = 0; l < 8; l++) assert.equal(tempo(l), 96 + 8 * l);
  assert.equal(tempo(8), 160);
  for (let l = 8; l < 100; l++) {
    assert.equal(tempo(l), 160);
    assert.ok(Number.isInteger(tempo(l)));
  }
  assert.ok(tempo(0) < tempo(1) && tempo(1) < tempo(2));
});

test('bar sweeps the whole level/bar space cleanly', () => {
  for (let l = -6; l <= 49; l++) {
    for (let b = -14; b <= 53; b++) {
      const steps = bar(l, b);
      assert.equal(steps.length, 8, `bar(${l}, ${b}) length`);
      // 8 steps, each `null` or a plain JSON pair of in-range integers.
      assert.deepEqual(JSON.parse(JSON.stringify(steps)), steps, `bar(${l}, ${b}) plain JSON`);
      for (const s of steps) {
        if (s === null) continue;
        assert.deepEqual(Object.keys(s).sort(), ['degree', 'octave']);
        assert.ok(Number.isInteger(s.degree) && s.degree >= 0 && s.degree <= 6, JSON.stringify(s));
        assert.ok(Number.isInteger(s.octave) && s.octave >= -1 && s.octave <= 1, JSON.stringify(s));
      }
      // At least 3 notes in every bar.
      assert.ok(steps.filter(Boolean).length >= 3, `bar(${l}, ${b}) notes`);
      // A loop of 4 bars, forwards and backwards.
      assert.deepEqual(steps, bar(l, b + 4));
      assert.deepEqual(steps, bar(l, b - 4));
      // Pure: a repeat call gives the identical steps.
      assert.deepEqual(steps, bar(l, b));
    }
  }
});

test('bar gives every level its own tune', () => {
  const tune = (l) => JSON.stringify([0, 1, 2, 3].map((b) => bar(l, b)));
  const six = new Set();
  for (let l = 0; l < 6; l++) six.add(tune(l));
  assert.ok(six.size >= 5, 'the first ten levels sound distinct');
  const twelve = new Set();
  for (let l = 0; l < 12; l++) twelve.add(tune(l));
  assert.equal(twelve.size, 12);
});

test('bar: the shipped tune is pinned', () => {
  // The campaign's first four levels, first four bars. A change here is a
  // change to what players hear — keep it deliberate.
  const shipped = [];
  for (let l = 0; l < 4; l++) for (let b = 0; b < 4; b++) shipped.push(bar(l, b));
  assert.deepEqual(shipped, [
    [{ degree: 0, octave: 0 }, null, { degree: 0, octave: 0 }, null, null, { degree: 2, octave: 1 }, null, { degree: 3, octave: 0 }],
    [{ degree: 0, octave: 0 }, null, { degree: 4, octave: 0 }, null, { degree: 0, octave: 1 }, { degree: 4, octave: 0 }, null, { degree: 0, octave: -1 }],
    [{ degree: 0, octave: 0 }, null, { degree: 2, octave: 0 }, null, { degree: 1, octave: 1 }, { degree: 3, octave: 0 }, null, { degree: 3, octave: 0 }],
    [{ degree: 0, octave: 0 }, null, { degree: 3, octave: 0 }, null, null, { degree: 3, octave: 0 }, null, { degree: 3, octave: 0 }],
    [{ degree: 0, octave: 0 }, null, { degree: 6, octave: 1 }, { degree: 5, octave: 0 }, null, { degree: 6, octave: 0 }, null, { degree: 5, octave: -1 }],
    [null, { degree: 2, octave: 0 }, null, null, { degree: 0, octave: 0 }, null, { degree: 5, octave: 0 }, { degree: 2, octave: 0 }],
    [null, { degree: 2, octave: 0 }, null, null, { degree: 0, octave: -1 }, null, { degree: 2, octave: 1 }, { degree: 4, octave: 0 }],
    [null, { degree: 0, octave: 1 }, { degree: 1, octave: 0 }, null, { degree: 0, octave: -1 }, null, null, { degree: 3, octave: 0 }],
    [null, { degree: 6, octave: 1 }, null, null, { degree: 0, octave: 0 }, null, { degree: 0, octave: 0 }, { degree: 2, octave: 0 }],
    [{ degree: 0, octave: 0 }, null, { degree: 2, octave: -1 }, null, null, { degree: 2, octave: 1 }, null, { degree: 2, octave: 0 }],
    [{ degree: 0, octave: 0 }, null, { degree: 3, octave: 1 }, null, null, { degree: 6, octave: 0 }, null, { degree: 3, octave: 1 }],
    [{ degree: 0, octave: -1 }, null, null, { degree: 6, octave: 1 }, null, null, null, { degree: 6, octave: 0 }],
    [{ degree: 0, octave: 0 }, null, { degree: 0, octave: 0 }, { degree: 5, octave: 0 }, null, { degree: 2, octave: 0 }, null, { degree: 1, octave: 1 }],
    [{ degree: 0, octave: -1 }, null, { degree: 0, octave: 0 }, null, { degree: 4, octave: 0 }, { degree: 1, octave: -1 }, null, { degree: 6, octave: 0 }],
    [{ degree: 0, octave: 0 }, null, { degree: 5, octave: -1 }, null, { degree: 0, octave: 1 }, { degree: 5, octave: 0 }, null, { degree: 1, octave: 1 }],
    [{ degree: 0, octave: -1 }, null, { degree: 5, octave: 1 }, { degree: 3, octave: 0 }, null, { degree: 1, octave: -1 }, null, { degree: 6, octave: 1 }],
  ]);
});

// A fake AudioContext that records every oscillator and gain, like the
// acceptance test's.
function fakeCtx() {
  const oscs = [];
  const gains = [];
  const ctx = {
    destination: { name: 'destination' },
    oscs, gains,
    createOscillator() {
      const o = {
        type: 'sine', frequency: { value: 0 }, to: [],
        connect(n) { this.to.push(n); return n; },
        start(t) { this.t0 = t; }, stop(t) { this.t1 = t; },
      };
      oscs.push(o);
      return o;
    },
    createGain() {
      const g = { gain: { value: 1 }, to: [], connect(n) { this.to.push(n); return n; } };
      gains.push(g);
      return g;
    },
  };
  return ctx;
}

test('scheduleBar: every note on time at several tempos, rests silent', () => {
  const steps = [{ degree: 0, octave: 0 }, null, { degree: 4, octave: 0 }, null, null, { degree: 1, octave: -1 }, null, null];
  for (const bpm of [96, 120, 160]) {
    const ctx = fakeCtx();
    const before = JSON.stringify(steps);
    scheduleBar(ctx, steps, 7.5, bpm, 0.25);
    // The caller's steps are untouched, and rests made nothing.
    assert.equal(JSON.stringify(steps), before, `steps unchanged at ${bpm}`);
    assert.equal(ctx.oscs.length, 3, `osc count at ${bpm}`);
    assert.equal(ctx.gains.length, 3, `gain count at ${bpm}`);
    const len = 30 / bpm;
    for (let i = 0; i < 8; i++) {
      const s = steps[i];
      if (s === null) continue;
      const o = ctx.oscs.shift();
      assert.equal(o.type, 'triangle');
      assert.equal(o.frequency.value, noteHz(s.degree, s.octave));
      assert.ok(Math.abs(o.t0 - (7.5 + i * len)) < 1e-12, `t0 of step ${i} at ${bpm}`);
      assert.ok(o.t1 > o.t0 && o.t1 - o.t0 <= len + 1e-9, `t1 of step ${i} at ${bpm}`);
      const g = ctx.gains.shift();
      assert.equal(g.gain.value, 0.25);
      assert.equal(o.to[0], g, 'oscillator connects to its gain');
      assert.equal(g.to[0], ctx.destination, 'gain connects to destination');
    }
  }
});

test('scheduleBar: an all-rest bar makes nothing, and every note gets a fresh node', () => {
  const ctx = fakeCtx();
  scheduleBar(ctx, [null, null, null, null, null, null, null, null], 0, 120, 0.3);
  assert.equal(ctx.oscs.length, 0);
  assert.equal(ctx.gains.length, 0);
  // Two bars on one context: no node is reused between them.
  scheduleBar(ctx, bar(0, 0), 0, 120, 0.3);
  const n = ctx.oscs.length;
  scheduleBar(ctx, bar(0, 1), 30 / 120 * 8, 120, 0.3);
  assert.equal(ctx.oscs.length, n + bar(0, 1).filter(Boolean).length);
  for (const [i, o] of ctx.oscs.entries()) {
    for (const [j, p] of ctx.oscs.entries()) if (i !== j) assert.notEqual(o, p);
  }
});
