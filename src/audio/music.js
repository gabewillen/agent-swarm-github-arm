// Generative background music (DESIGN.md §24).
// A natural minor scale on a fixed root; every bar is derived from a pure
// mixing of (levelIndex, barIndex), so tunes are deterministic, loop every
// 4 bars, differ between levels, and never touch the DOM or randomness.

export const SCALE = [0, 2, 3, 5, 7, 8, 10];
export const ROOT_HZ = 220;

// Scale degree to frequency: `degree mod 7` is never negative, and degrees
// beyond the octave fold up through whole octaves.
export function noteHz(degree, octave = 0) {
  const d = ((degree % 7) + 7) % 7;
  const shift = SCALE[d] + 12 * (octave + Math.floor(degree / 7));
  return ROOT_HZ * 2 ** (shift / 12);
}

// 96 bpm plus 8 per level, capped at 160.
export function tempo(levelIndex) {
  return Math.min(160, 96 + 8 * levelIndex);
}

// A 32-bit avalanche step (mulberry-style), kept private so a bar counts
// as a pure function: same level and bar in, same notes out, no draws.
function mix(n) {
  let x = n >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}

// Rhythm masks: one bit per step, each with at least 4 note slots.
const RHYTHMS = [
  [1, 0, 1, 0, 1, 0, 1, 0],
  [1, 0, 0, 1, 0, 0, 1, 0],
  [1, 1, 0, 0, 1, 1, 0, 0],
  [0, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 1, 1, 0, 0, 0, 0],
  [0, 0, 1, 0, 1, 0, 1, 1],
  [1, 0, 0, 0, 1, 1, 0, 1],
  [0, 1, 1, 0, 1, 0, 0, 1],
];

// Melodic walk steps around the scale, wrapping through the octave.
const JUMPS = [0, 1, 2, -1, -2, 3];

// Octave picks, biased toward the root register.
const OCTAVES = [0, 0, 1, -1];

// Eight steps, each null (a rest) or { degree, octave }, as a pure
// function of the level and a bar index that recurs every 4.
export function bar(levelIndex, barIndex) {
  const level = Math.trunc(levelIndex) >>> 0;
  const index = (Math.trunc(barIndex) >>> 0) % 4;
  let h = mix(mix(level) ^ mix(index));
  const mask = RHYTHMS[h % RHYTHMS.length];
  let degree = mix(h + 0x5f) % 7;
  let octave = OCTAVES[mix(h + 0x9e) % OCTAVES.length];
  const steps = [null, null, null, null, null, null, null, null];
  for (let i = 0; i < 8; i++) {
    if (!mask[i]) continue;
    h = mix(h + 0x71);
    degree = (degree + JUMPS[h % JUMPS.length] + 7) % 7;
    octave = OCTAVES[mix(h + 0xa3) % OCTAVES.length];
    steps[i] = { degree, octave };
  }
  return steps;
}

// Play one bar on an AudioContext: one oscillator per note, triangled,
// through its own gain, started at its step and held for one step.
export function scheduleBar(ctx, steps, startTime, bpm, gain) {
  const stepDur = 30 / bpm;
  for (let i = 0; i < steps.length; i++) {
    const note = steps[i];
    if (note === null || note === undefined) continue;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = noteHz(note.degree, note.octave);
    const amp = ctx.createGain();
    amp.gain.value = gain;
    osc.connect(amp);
    amp.connect(ctx.destination);
    const when = startTime + i * stepDur;
    osc.start(when);
    osc.stop(when + stepDur);
  }
}
