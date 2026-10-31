// Generative background music (DESIGN.md §24). Everything is synthesized
// from small integer patterns: a scale, one root frequency, a four-bar loop
// that transposes with the level, and a scheduler that plays one bar of
// notes on a WebAudio context. No samples, no files, nothing touched on
// import.

export const SCALE = Object.freeze([0, 2, 3, 5, 7, 8, 10]); // natural minor
export const ROOT_HZ = 220; // A3

// Frequency of a scale degree. `degree mod 7` never goes negative, so
// degree 7 is the octave above degree 0 and -1 is the seventh below.
export function noteHz(degree, octave = 0) {
  const d = ((degree % 7) + 7) % 7;
  const o = octave + Math.floor(degree / 7);
  return ROOT_HZ * 2 ** ((SCALE[d] + 12 * o) / 12);
}

// Beats per minute: 96 at level 1, +8 per level, at most 160.
export function tempo(levelIndex) {
  return Math.min(160, 96 + 8 * levelIndex);
}

// The loop's harmony in scale degrees of the natural minor: i, VI, iv, V —
// Am, F, Dm, E around the A root. One chord per bar of the four-bar loop.
const CHORDS = [0, 5, 3, 4];

// Melodic figure per bar: [step 0..7, interval above the chord's root].
const FIGURES = [
  [[0, 0], [2, 2], [4, 4], [6, 2]], // steady arpeggio
  [[0, 0], [1, 4], [3, 2], [4, 4], [6, 0]], // busier answer
  [[0, 0], [3, 2], [6, 4]], // breathing room
  [[0, 0], [2, 4], [4, 0], [5, 2], [6, 4]], // lead back to the top
];

// One bar: 8 steps, each `null` (a rest) or `{ degree, octave }` with
// degree 0..6 and octave -1..1. Pure, and loops every 4 bars. Each level
// transposes the loop up the scale, so levels sound different.
export function bar(levelIndex, barIndex) {
  const b = ((barIndex % 4) + 4) % 4;
  const shift = ((levelIndex % 7) + 7) % 7;
  const steps = [null, null, null, null, null, null, null, null];
  for (const [step, interval] of FIGURES[b]) {
    const p = CHORDS[b] + interval + shift;
    const degree = p % 7;
    const octave = Math.max(-1, Math.min(1, Math.floor(p / 7)));
    steps[step] = { degree, octave };
  }
  return steps;
}

// Play one bar on an AudioContext: a triangle oscillator per note through
// one gain node to the destination; a note of step i starts at
// startTime + i * (30 / bpm) seconds and stops just short of the next
// step. Rests (null) play nothing and make no nodes.
export function scheduleBar(ctx, steps, startTime, bpm, gain) {
  const beat = 30 / bpm;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s === null) continue;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = noteHz(s.degree, s.octave);
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    const t0 = startTime + i * beat;
    osc.start(t0);
    osc.stop(t0 + beat * 0.95);
  }
}
