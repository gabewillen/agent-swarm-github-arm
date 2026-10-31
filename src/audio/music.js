// §24: generative background music. Everything is derived from the natural
// minor scale with pure arithmetic — no samples, no files, no randomness
// that isn't a pure function of its arguments.

// The natural minor scale in semitones from the root.
export const SCALE = [0, 2, 3, 5, 7, 8, 10];

// A3, the scale's root.
export const ROOT_HZ = 220;

// `mod` for any integer: the result is never negative, so degree -1 wraps
// to the scale's last step an octave up (or down, via `Math.floor`).
function mod(n, m) {
  return ((n % m) + m) % m;
}

// The pitch of a scale degree, possibly past the scale's end (each +7 is
// one octave up) and of a given octave.
export function noteHz(degree, octave = 0) {
  return ROOT_HZ * 2 ** ((SCALE[mod(degree, 7)] + 12 * (octave + Math.floor(degree / 7))) / 12);
}

// The beat slows nothing; it rises with the level and caps at 160 BPM.
export function tempo(levelIndex) {
  return Math.min(96 + 8 * levelIndex, 160);
}

// A 32-bit scramble of an integer: same input, same output, no pattern
// neighbours can see. Used to pick each level's riff.
function bits(n) {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

// The four bars of the loop walk i - VI - iv - v, in scale steps from the
// tonic, so the loop resolves back where it started.
const CHORD_ROOTS = [0, 5, 3, 4];
const STEP_AT = [1, -1, 2, -2];

// One bar: 8 steps, each a rest (`null`) or a `{ degree, octave }` note on
// the scale. A bass line on the downbeats is fixed; the melody odd steps is
// each level's own riff, which is what makes the levels sound different.
export function bar(levelIndex, barIndex) {
  const b = mod(barIndex, 4);
  const root = CHORD_ROOTS[b];
  const h = bits(Math.imul(mod(levelIndex, 4096) + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca77));
  const steps = [null, null, null, null, null, null, null, null];
  // Bass rides the downbeats no matter the riff.
  steps[0] = { degree: root, octave: -1 };
  steps[4] = { degree: root, octave: -1 };
  steps[6] = { degree: (root + 4) % 7, octave: -1 };
  // Melody: a walk over chord tones, one bit for a note's presence, its
  // step of the walk, and its octave.
  let d = (root + (h & 3)) % 7;
  for (let i = 1; i < 8; i += 2) {
    if ((h >>> (i - 1)) & 1) {
      d = (d + STEP_AT[(h >>> (i + 11)) & 3] + 7) % 7;
      steps[i] = { degree: d, octave: ((h >>> (i + 21)) & 1) === 0 ? 0 : 1 };
    }
  }
  return steps;
}

// Plays one bar on an audio context: one triangle oscillator per note,
// through its own gain node to the destination, starting the step it was
// written for and stopping one step later. Rests make nothing.
export function scheduleBar(ctx, steps, startTime, bpm, gain) {
  const stepSeconds = 30 / bpm;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s === null) continue;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = noteHz(s.degree, s.octave);
    const env = ctx.createGain();
    env.gain.value = gain;
    osc.connect(env);
    env.connect(ctx.destination);
    const t0 = startTime + i * 30 / bpm;
    osc.start(t0);
    osc.stop(t0 + stepSeconds);
  }
}
