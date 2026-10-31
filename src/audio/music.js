// Generative background music (DESIGN.md §24): a triangle-wave arpeggio in
// A natural minor. The tunes are pure data derived from the level and bar
// indices, so the same level always sounds the same and nothing here needs
// a DOM, a clock, or randomness. Scheduling happens only on the
// AudioContext handed to `scheduleBar`.

export const SCALE = [0, 2, 3, 5, 7, 8, 10]; // semitones of the natural minor
export const ROOT_HZ = 220; // A3

// The octave a degree lands in, folded into the range by the caller.
const OCTAVES = [0, 1, -1];

// Returns a non-negative mod, so `degree mod 7` is never negative (§24).
function positiveMod(n, m) {
  return ((n % m) + m) % m;
}

// `degree` may run past the scale (or below it): the excess becomes octave
// shifts, so `noteHz(7)` is `noteHz(0)` an octave up.
export function noteHz(degree, octave = 0) {
  const d = positiveMod(degree, 7);
  const oct = Math.floor(degree / 7);
  return ROOT_HZ * 2 ** ((SCALE[d] + 12 * (octave + oct)) / 12);
}

// Beats per minute: faster with every level, capped at 160.
export function tempo(levelIndex) {
  return Math.min(160, 96 + 8 * levelIndex);
}

// Two four-bar phrases in A minor, one per level parity. Each row is one
// bar of eight eighth notes: a scale degree, or null for a rest. Every bar
// keeps at least three notes.
const TUNE_A = [
  [0, null, 2, null, 4, 2, null, null], // i:      A . C . E C . .
  [null, 5, 3, null, 1, null, 3, null], // VI/iv:  . F D . B . D .
  [4, null, 5, 6, null, 5, null, 4], // climb:   E . F G . F . E
  [2, null, 1, null, 0, null, null, null], // resolve: C . B . A . . .
];
const TUNE_B = [
  [0, 2, null, 4, null, 2, 0, null], // i:      A C . E . C A .
  [5, null, 3, null, 1, null, null, 3], // VI/iv:  F . D . B . . D
  [null, 4, null, 5, 6, null, 5, null], // climb:  . E . F G . F .
  [1, null, 0, null, 4, null, 2, 0], // resolve: B . A . E . C A
];

// One bar of music: 8 steps, each null or `{ degree, octave }`. It repeats
// every 4 bars (a phrase) and every level sounds its own key and register.
export function bar(levelIndex, barIndex) {
  const l = typeof levelIndex === 'number' && Number.isFinite(levelIndex)
    ? Math.max(0, Math.floor(levelIndex))
    : 0;
  const b = positiveMod(Math.floor(barIndex) || 0, 4);
  const tune = (l & 1) === 0 ? TUNE_A : TUNE_B;
  const root = l % 7; // the level's key, a scale-degree shift
  const octave = OCTAVES[l % 3]; // the level's register, one octave of lead
  const steps = [];
  for (let i = 0; i < 8; i++) {
    const degree = tune[b][i];
    steps.push(degree === null ? null : { degree: positiveMod(root + degree, 7), octave });
  }
  return steps;
}

// Plays one bar on an AudioContext: a triangle oscillator and a gain node
// per note, from `startTime` in seconds, one step (an eighth note) apart.
// A rest schedules nothing.
export function scheduleBar(ctx, steps, startTime, bpm, gain) {
  const beat = 30 / bpm; // one step; a quarter note is 60 / bpm
  const hold = beat * 0.85; // stop inside the step so notes articulate
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step === null || step === undefined) continue;
    const start = startTime + i * beat;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = noteHz(step.degree, step.octave);
    const node = ctx.createGain();
    node.gain.value = gain;
    osc.connect(node);
    node.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + hold);
  }
}
