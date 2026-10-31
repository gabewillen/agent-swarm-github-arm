// Generative background music (DESIGN.md §24).
//
// Everything is a pure function of its arguments over the natural minor
// scale: no samples, no randomness but a fixed integer hash, and no
// AudioContext is created here — `scheduleBar` plays on a context it is
// given, so this module never touches `window` or the DOM.

export const SCALE = [0, 2, 3, 5, 7, 8, 10];
export const ROOT_HZ = 220;

// `degree mod 7` is never negative: SCALE[0] at degree 7 sounds ROOT_HZ * 2,
// and degree -1 folds to the scale's seventh a floor below.
export function noteHz(degree, octave = 0) {
  const below = Math.floor(degree / 7);
  const step = SCALE[degree - 7 * below];
  return ROOT_HZ * 2 ** ((step + 12 * (octave + below)) / 12);
}

export function tempo(levelIndex) {
  return Math.min(96 + 8 * levelIndex, 160);
}

// A tiny FNV-1a-style integer mixer over 32-bit words: the music's fixed
// source of variation, the same tune for the same arguments forever.
function hash(...parts) {
  let h = 0x811c9dc5;
  for (const p of parts) h = Math.imul(h ^ (p >>> 0), 0x01000193) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

// One bar: 8 steps, each `null` (a rest) or `{ degree, octave }`, at least 3
// notes, a loop of 4 bars, and every level with a voice of its own.
export function bar(levelIndex, barIndex) {
  const l = levelIndex | 0;
  const b = (((barIndex | 0) % 4) + 4) % 4; // bar(l, b) === bar(l, b + 4)
  const root = hash(l + 1, b, 0x7ea) % 7; // the bar's home degree
  const steps = [];
  let notes = 0;
  for (let i = 0; i < 8; i++) {
    const h = hash(l + 1, b, i, 0x51ec);
    const r = h / 4294967296; // [0, 1)
    // On beats the melody carries; off beats rest more often.
    if (r < (i % 2 === 0 ? 0.15 : 0.4)) {
      steps.push(null);
      continue;
    }
    // A short walk around the bar's root through the scale.
    const degree = (root + (hash(h, 0x77) % 5) - 2 + 7) % 7;
    const roll = hash(h, 0xc7) % 100;
    const octave = roll < 14 ? -1 : roll > 85 ? 1 : 0;
    steps.push({ degree, octave });
    notes++;
  }
  if (notes < 3) {
    for (let i = 0; i < 8 && notes < 3; i++) {
      if (steps[i] !== null) continue;
      const h = hash(l + 1, b, i, 0xfa11);
      steps[i] = { degree: (root + h % 7) % 7, octave: (h >>> 9) % 3 - 1 };
      notes++;
    }
  }
  return steps;
}

// Plays one bar on an AudioContext: per note one triangle oscillator through
// one gain node to `ctx.destination`, from `startTime + i * 30 / bpm` and
// stopped at most `30 / bpm` seconds later. Rests make nothing.
export function scheduleBar(ctx, steps, startTime, bpm, gain) {
  const stepSec = 30 / bpm;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s === null || s === undefined) continue;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = noteHz(s.degree, s.octave);
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(startTime + i * stepSec);
    osc.stop(startTime + (i + 1) * stepSec);
  }
}
