// agent-29's self-check of the audio area (DESIGN.md §13). Mirrors and
// extends tests/20-audio.test.mjs: it also pins the exact cue table, the
// shape of every cue, the per-note wiring and gain, and the lazy-context /
// mute rules. Never run as part of the acceptance suite (it lives outside
// tests/):  node --test selfcheck/audio.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CUES, cuesFor } from '../src/audio/cues.js';
import { createAudio } from '../src/audio/synth.js';

// DESIGN.md §13's event -> cue table, in full.
const MAP = {
  pickup: 'blip',
  merge: 'chord',
  quorum: 'fanfare',
  level: 'sweep',
  won: 'fanfare',
  conflict: 'buzz',
  drop: 'scatter',
  hit: 'thud',
  lost: 'dirge',
  spawn: 'tick',
};
const CUE_NAMES = [...new Set(Object.values(MAP))];

test('cuesFor maps every event exactly as §13 says, keeping order', () => {
  assert.deepEqual(cuesFor(Object.keys(MAP)), Object.values(MAP));
});
test('cuesFor repeats and skips no-cue and unknown events', () => {
  assert.deepEqual(cuesFor(['pickup', 'pickup']), ['blip', 'blip']);
  assert.deepEqual(cuesFor(['pause', 'resume', 'nonsense']), []);
  assert.deepEqual(cuesFor([]), []);
});
test('CUES holds exactly the nine cue names of §13', () => {
  assert.deepEqual(
    Object.keys(CUES).sort(),
    [...CUE_NAMES].sort()
  );
});
test('every cue is shaped inside §13’s ranges', () => {
  for (const [name, cue] of Object.entries(CUES)) {
    assert.ok(Array.isArray(cue.notes) && cue.notes.length > 0, `${name} notes`);
    for (const n of cue.notes) {
      assert.ok(Number.isFinite(n) && n >= 20 && n <= 5000, `${name} note ${n}`);
    }
    assert.ok(['sine', 'square', 'triangle', 'sawtooth'].includes(cue.wave), `${name} wave`);
    assert.ok(cue.duration > 0 && cue.duration <= 2, `${name} duration`);
    assert.ok(cue.gain > 0 && cue.gain <= 1, `${name} gain`);
  }
});

// A fake AudioContext that records exactly what §13 asks the synth to do.
function fakeAudioContext() {
  const log = { constructed: 0, oscillators: [], gains: [] };
  class Ctx {
    constructor() {
      log.constructed++;
      this.destination = { name: 'destination' };
      this.currentTime = 0.25;
    }
    createOscillator() {
      const o = {
        type: null, frequency: { value: 0 }, connected: [],
        started: false, stopped: false,
        connect(n) { this.connected.push(n); return n; },
        start() { this.started = true; },
        stop() { this.stopped = true; },
      };
      log.oscillators.push(o);
      return o;
    }
    createGain() {
      const g = {
        gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connected: [],
        connect(n) { this.connected.push(n); return n; },
      };
      log.gains.push(g);
      return g;
    }
  }
  return { Ctx, log };
}

test('importing the audio modules builds no context and creates no oscillator', () => {
  // The imports above ran before this test: no fake context could have been
  // constructed by them. The check below constructs nothing either.
  const { Ctx, log } = fakeAudioContext();
  const audio = createAudio(Ctx);
  assert.equal(log.constructed, 0);
  assert.equal(typeof audio.play, 'function');
  assert.equal(typeof audio.setMuted, 'function');
  assert.equal(typeof audio.isMuted, 'function');
});
test('a known cue, once, wires one oscillator per note through a gain to the destination', () => {
  const { Ctx, log } = fakeAudioContext();
  createAudio(Ctx).play('chord');
  const cue = CUES.chord;
  assert.equal(log.constructed, 1);
  assert.equal(log.oscillators.length, cue.notes.length);
  assert.equal(log.gains.length, cue.notes.length);
  log.oscillators.forEach((o, i) => {
    assert.equal(o.type, cue.wave, 'wave');
    assert.equal(o.frequency.value, cue.notes[i], 'note order');
    assert.ok(o.started && o.stopped, 'started and stopped');
    assert.ok(log.gains.includes(o.connected[0]), 'oscillator first into its gain');
  });
  for (const g of log.gains) {
    assert.ok(g.connected.some((n) => n && n.name === 'destination'), 'gain into destination');
  }
});
test('every cue plays without throwing, through the one context', () => {
  const { Ctx, log } = fakeAudioContext();
  const audio = createAudio(Ctx);
  for (const name of CUE_NAMES) {
    const before = log.oscillators.length;
    audio.play(name);
    assert.equal(log.oscillators.length, before + CUES[name].notes.length, name);
    assert.equal(log.constructed, 1);
  }
});
test('an unknown cue makes nothing — not even a context — and muting silences play', () => {
  const { Ctx, log } = fakeAudioContext();
  const audio = createAudio(Ctx);
  audio.play('nope');
  assert.equal(log.constructed, 0);
  audio.setMuted(true);
  assert.equal(audio.isMuted(), true);
  audio.play('blip');
  assert.equal(log.constructed, 0);
  audio.setMuted(false);
  audio.play('blip');
  assert.equal(log.constructed, 1);
  assert.equal(log.oscillators.length, CUES.blip.notes.length);
});
