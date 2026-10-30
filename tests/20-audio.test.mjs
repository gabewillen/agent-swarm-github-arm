import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';

const MAP = { pickup: 'blip', merge: 'chord', quorum: 'fanfare', level: 'sweep', won: 'fanfare', conflict: 'buzz', drop: 'scatter', hit: 'thud', lost: 'dirge', spawn: 'tick' };

test('cuesFor maps each event to its cue', async () => {
  const { cuesFor } = await load('audio/cues.js');
  for (const [e, c] of Object.entries(MAP)) assert.deepEqual(cuesFor([e]), [c], e);
});

test('cuesFor keeps order and skips events with no cue', async () => {
  const { cuesFor } = await load('audio/cues.js');
  assert.deepEqual(cuesFor(['pause', 'merge', 'nonsense', 'quorum', 'resume']), ['chord', 'fanfare']);
  assert.deepEqual(cuesFor([]), []);
});

test('every cue is defined in CUES', async () => {
  const { CUES } = await load('audio/cues.js');
  for (const c of new Set(Object.values(MAP))) assert.ok(CUES[c], c);
});

test('every cue has notes, a wave, a duration, and a gain in range', async () => {
  const { CUES } = await load('audio/cues.js');
  for (const [name, c] of Object.entries(CUES)) {
    assert.ok(Array.isArray(c.notes) && c.notes.length > 0, name);
    for (const n of c.notes) assert.ok(n >= 20 && n <= 5000, `${name} ${n}`);
    assert.ok(['sine', 'square', 'triangle', 'sawtooth'].includes(c.wave), name);
    assert.ok(c.duration > 0 && c.duration <= 2, name);
    assert.ok(c.gain > 0 && c.gain <= 1, name);
  }
});

function fakeAudioContext() {
  const log = { constructed: 0, oscillators: [], gains: [] };
  class Ctx {
    constructor() { log.constructed++; this.destination = { name: 'destination' }; this.currentTime = 0; }
    createOscillator() {
      const o = { type: 'sine', frequency: { value: 0 }, connected: [], started: false, stopped: false,
        connect(n) { this.connected.push(n); return n; }, start() { this.started = true; }, stop() { this.stopped = true; } };
      log.oscillators.push(o);
      return o;
    }
    createGain() {
      const g = { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connected: [], connect(n) { this.connected.push(n); return n; } };
      log.gains.push(g);
      return g;
    }
  }
  return { Ctx, log };
}

test('createAudio builds no context until a sound plays', async () => {
  const { createAudio } = await load('audio/synth.js');
  const { Ctx, log } = fakeAudioContext();
  createAudio(Ctx);
  assert.equal(log.constructed, 0);
});

test('play makes one oscillator and gain per note, wired to the destination', async () => {
  const { createAudio } = await load('audio/synth.js');
  const { CUES } = await load('audio/cues.js');
  const { Ctx, log } = fakeAudioContext();
  const a = createAudio(Ctx);
  a.play('chord');
  assert.equal(log.constructed, 1);
  assert.equal(log.oscillators.length, CUES.chord.notes.length);
  assert.equal(log.gains.length, CUES.chord.notes.length);
  log.oscillators.forEach((o, i) => {
    assert.equal(o.type, CUES.chord.wave);
    assert.equal(o.frequency.value, CUES.chord.notes[i]);
    assert.ok(o.started && o.stopped);
    assert.ok(log.gains.includes(o.connected[0]));
  });
  for (const g of log.gains) assert.ok(g.connected.some((n) => n && n.name === 'destination'));
});

test('one context serves every sound', async () => {
  const { createAudio } = await load('audio/synth.js');
  const { Ctx, log } = fakeAudioContext();
  const a = createAudio(Ctx);
  a.play('blip');
  a.play('thud');
  assert.equal(log.constructed, 1);
});

test('muted, play makes no sound', async () => {
  const { createAudio } = await load('audio/synth.js');
  const { Ctx, log } = fakeAudioContext();
  const a = createAudio(Ctx);
  assert.equal(a.isMuted(), false);
  a.setMuted(true);
  assert.equal(a.isMuted(), true);
  a.play('blip');
  assert.equal(log.oscillators.length, 0);
  a.setMuted(false);
  a.play('blip');
  assert.equal(log.oscillators.length, CUES_LEN_BLIP(await load('audio/cues.js')));
});

function CUES_LEN_BLIP(m) { return m.CUES.blip.notes.length; }

test('an unknown cue does nothing', async () => {
  const { createAudio } = await load('audio/synth.js');
  const { Ctx, log } = fakeAudioContext();
  createAudio(Ctx).play('nope');
  assert.equal(log.constructed, 0);
  assert.equal(log.oscillators.length, 0);
});
