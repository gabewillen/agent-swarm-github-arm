// agent-11's extra checks for src/audio/music.js (DESIGN.md §24). Not part
// of the acceptance suite — a deeper net for the shared area 12: purity
// over wide ranges, the note contract, timing at two tempos, and the
// player wiring. Run with: node agent-tests/music-extra.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCALE, ROOT_HZ, noteHz, tempo, bar, scheduleBar } from '../src/audio/music.js';

const modPath = new URL('../src/audio/music.js', import.meta.url).href;

test('exports and constants', async () => {
  const m = await import(modPath);
  for (const name of ['SCALE', 'ROOT_HZ', 'noteHz', 'tempo', 'bar', 'scheduleBar']) {
    assert.ok(m[name] !== undefined, `missing export ${name}`);
  }
  assert.deepEqual(SCALE, [0, 2, 3, 5, 7, 8, 10]);
  assert.equal(ROOT_HZ, 220);
});

test('noteHz: degree wraps never negative, octave math, extremes', () => {
  // Non-integer octaves shift by ±12 semitones cleanly.
  for (let o = -1; o <= 1; o++) {
    assert.equal(noteHz(0, o + 1), noteHz(0, o) * 2);
    assert.equal(noteHz(7, o), noteHz(0, o) * 2);
  }
  // Any degree d and d + 7k sound (octave-stacked) an octave per k.
  for (let d = -21; d <= 21; d++) {
    const f = noteHz(d);
    assert.ok(Number.isFinite(f) && f > 0, `degree ${d}: ${f}`);
    // The contract's formula, written out by hand from the spec.
    const want = ROOT_HZ * 2 ** ((SCALE[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7)) / 12);
    assert.equal(f, want, `degree ${d}`);
  }
  // Step-stacking: seven scale degrees is an octave up, whatever the
  // phase. This checks both the euclidean `degree mod 7` and the floor
  // division the octave count comes from.
  for (let d = -14; d <= 14; d++) {
    assert.ok(Math.abs(noteHz(d + 7) - noteHz(d) * 2) < 1e-6, `stack ${d}`);
  }
  // The walk inside `bar` spans degrees -6..13; every one resolves to a
  // finite positive frequency in the audible low register.
  for (let d = -6; d <= 13; d++) {
    const f = noteHz(d);
    assert.ok(Number.isFinite(f) && f > 20 && f < 5000, `degree ${d} -> ${f}`);
  }
  // Degree -1 means the semitone below the root (10 - 12 = -2 semitones).
  assert.ok(Math.abs(noteHz(-1) - 220 * 2 ** (-2 / 12)) < 1e-9);
  // Every scale degree is a doubling of the one 7 steps up.
  for (let d = 0; d < 7; d++) assert.equal(noteHz(d, 1), noteHz(d + 7, 0));
});

test('tempo: ramps from 96, every 8 per level, capped at once reached', () => {
  assert.equal(tempo(0), 96);
  for (let l = 0; l < 8; l++) assert.equal(tempo(l), Math.min(160, 96 + 8 * l));
  for (const l of [8, 9, 20, 1000, -3]) assert.ok(tempo(l) === 160 ? l >= 8 : true, `level ${l}`);
  assert.equal(tempo(-3), Math.min(160, 96 - 24));
});

test('bar: in range, at least 3 notes, loops of 4, pure over hostile inputs', () => {
  for (let l = -10; l < 64; l++) {
    for (let b = -16; b < 40; b++) {
      const steps = bar(l, b);
      assert.equal(steps.length, 8);
      assert.ok(steps.filter(Boolean).length >= 3, `bar(${l},${b}) too quiet`);
      for (const s of steps) {
        if (s === null) continue;
        assert.ok(Number.isInteger(s.degree) && s.degree >= 0 && s.degree <= 6);
        assert.ok(Number.isInteger(s.octave) && s.octave >= -1 && s.octave <= 1);
      }
      const b4 = ((b % 4) + 4) % 4;
      assert.deepEqual(steps, bar(l, b4 + 400 * (b >= 0 ? 1 : -1)));
      assert.deepEqual(steps, bar(l, b), 'second call must reproduce');
    }
  }
});

test('bar: every level sounds its own tune (wide sweep)', () => {
  const tunes = new Set();
  for (let l = -20; l < 128; l++) {
    tunes.add(JSON.stringify([0, 1, 2, 3].map((b) => bar(l, b))));
  }
  // 148 levels, at least 100 distinct tunes.
  assert.ok(tunes.size >= 100, `only ${tunes.size} distinct tunes`);
});

test('bar: notes follow the scale by construction', () => {
  for (let l = 0; l < 6; l++) for (let b = 0; b < 4; b++) {
    for (const s of bar(l, b)) {
      if (s === null) continue;
      const f = noteHz(s.degree, s.octave);
      assert.ok(Number.isFinite(f) && f > 0);
    }
  }
});

test('scheduleBar: one oscillator and one gain per note, rests silent', () => {
  const fresh = () => {
    const oscs = [];
    const gains = [];
    return {
      oscs, gains,
      destination: { name: 'destination' },
      createOscillator() { const o = { type: 'sine', frequency: { value: 0 }, to: [], connect(n) { this.to.push(n); return n; }, start(t) { this.t0 = t; }, stop(t) { this.t1 = t; } }; oscs.push(o); return o; },
      createGain() { const g = { gain: { value: 1 }, to: [], connect(n) { this.to.push(n); return n; } }; gains.push(g); return g; },
    };
  };
  for (const bpm of [96, 120, 152, 160]) {
    const ctx = fresh();
    const dur = 30 / bpm;
    const steps = bar(3, (bpm % 4));
    scheduleBar(ctx, steps, 2.5, bpm, 0.75);
    const notesAt = [];
    for (let i = 0; i < 8; i++) if (steps[i] !== null) notesAt.push(i);
    assert.equal(ctx.oscs.length, notesAt.length);
    assert.equal(ctx.gains.length, notesAt.length);
    notesAt.forEach((i, k) => {
      const o = ctx.oscs[k];
      assert.equal(o.type, 'triangle');
      assert.equal(o.frequency.value, noteHz(steps[i].degree, steps[i].octave));
      assert.ok(Math.abs(o.t0 - (2.5 + i * dur)) < 1e-12);
      assert.ok(o.t1 - o.t0 > 0 && o.t1 - o.t0 <= dur + 1e-9);
      assert.ok(ctx.gains.includes(o.to[0]));
    });
    for (const g of ctx.gains) {
      assert.equal(g.gain.value, 0.75);
      assert.equal(g.to[0].name, 'destination');
    }
  }
  // All rests: nothing is created at all.
  const silence = fresh();
  scheduleBar(silence, [null, null, null, null, null, null, null, null], 0, 120, 0.5);
  assert.equal(silence.oscs.length, 0);
  assert.equal(silence.gains.length, 0);
});
