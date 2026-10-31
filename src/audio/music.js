// src/audio/music.js — generative background music (DESIGN.md §24).
//
// The music is never sampled: every note is synthesised, note by note, on
// an AudioContext the caller provides. The tune itself is a pure function
// of its arguments — a deterministic integer stream stands in for
// randomness, so `bar(l, b)` is reproducible and loops every 4 bars.

export const SCALE = [0, 2, 3, 5, 7, 8, 10]; // the natural minor
export const ROOT_HZ = 220; // A3

// Frequency in Hz of a scale degree in an octave. Degrees beyond one scale
// wrap with whole octaves; `degree mod 7` is never negative, so negative
// degrees also land inside the scale.
export function noteHz(degree, octave = 0) {
  const d = ((degree % 7) + 7) % 7;
  const octaves = Math.floor(degree / 7) + (octave ?? 0);
  return ROOT_HZ * Math.pow(2, (SCALE[d] + 12 * octaves) / 12);
}

// Beats per minute: the music quickens with the level, capped at 160.
export function tempo(levelIndex) {
  return Math.min(160, 96 + 8 * levelIndex);
}

// A deterministic integer stream: xorshift32 seeded from the level and bar
// indices, so a bar's content depends only on its arguments, never on the
// clock or on Math.random.
function stream(levelIndex, barIndex) {
  let s = (Math.imul(levelIndex + 1, 0x9e3779b1) ^
    Math.imul(barIndex + 1, 0x85ebca77) ^ 0xc2b2ae3d) >>> 0;
  return (n) => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    if (s === 0) s = 0x2545f491; // the stream never sticks at zero
    return s % n;
  };
}

// The four bars ride a minor-key progression over the scale degrees
// (i, iv, v, III), each an octave step lower than the last feel.
const ROOTS = [0, 3, 4, 2];
const BASE_OCT = [0, -1, 0, -1];

// 8 steps of one bar: `null` for a rest, else `{ degree, octave }`.
export function bar(levelIndex, barIndex) {
  const b = ((barIndex % 4) + 4) % 4; // the loop of 4 bars
  const next = stream(levelIndex, b);
  const steps = [null, null, null, null, null, null, null, null];

  // A per-level key: every level's line sits elsewhere in the scale, so
  // different levels sound different.
  const key = next(7);

  // Rhythm: the downbeat and the half bar always sound, with one pick in
  // each half and the occasional extra — four or five notes per bar.
  const hits = [0, 1 + next(3), 4, 5 + next(3)];
  if (next(2) === 0) hits.push(next(2) === 0 ? 2 : 7);
  hits.sort((a, z) => a - z);

  // Melody: start the bar on its chord root, then walk the scale,
  // stepping mostly by a degree with occasional octave colour.
  let degree = (key + ROOTS[b]) % 7;
  let octave = BASE_OCT[b] + next(2); // stays within -1..1
  for (const i of hits) {
    steps[i] = { degree, octave };
    const jump = next(6);
    if (jump < 3) degree = (degree + 1) % 7;
    else if (jump < 5) degree = (degree + 6) % 7;
    else octave = octave === 0 ? 1 - next(2) * 2 : 0;
  }
  return steps;
}

// Schedule one bar on `ctx`: for each note at step i, one triangle
// oscillator through one gain node to `ctx.destination`, started at
// `startTime + i * 30 / bpm` and stopped one step later. Rests make
// nothing.
export function scheduleBar(ctx, steps, startTime, bpm, gain) {
  if (!ctx || !steps) return;
  const stepDur = 30 / bpm; // one step, in seconds
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s === null || s === undefined) continue;
    const start = startTime + i * stepDur;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = noteHz(s.degree, s.octave);
    const env = ctx.createGain();
    env.gain.value = gain;
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + stepDur);
  }
}
