// §24 — background music, generated, never sampled. Pure module: importing
// it touches nothing (no DOM, no AudioContext); to make a sound you hand
// `scheduleBar` an AudioContext (or a test double).

export const SCALE = [0, 2, 3, 5, 7, 8, 10]; // the natural minor
export const ROOT_HZ = 220;

// Frequency in Hz of scale degree `degree` (a degree of 7 or more, or below
// 0, wraps while shifting octaves; `degree mod 7` is never negative) in
// octave `octave`, which defaults to 0.
export function noteHz(degree, octave = 0) {
  const mod = ((degree % 7) + 7) % 7;
  const semitones = SCALE[mod] + 12 * (octave + Math.floor(degree / 7));
  return ROOT_HZ * 2 ** (semitones / 12);
}

// Beats per minute for level `levelIndex`: 96 plus 8 per level, at most 160.
export function tempo(levelIndex) {
  return Math.min(96 + 8 * levelIndex, 160);
}

// --- deterministic per-(level, bar) randomness ----------------------------
// `bar` must be a pure function of its arguments and reproducible run to
// run, so it draws on a small stateless hash instead of Math.random.

function hash32(n) {
  let h = n | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// A stream of pseudo-random numbers in [0, 1), deterministic in (seed, i, k).
function chance(seed, i, k) {
  return hash32(seed ^ Math.imul(i + 1, 0x9e3779b9) ^ Math.imul(k + 1, 0x85ebca6b)) / 4294967296;
}

// Chord progression of the 4-bar loop, in scale degrees: i - VI - iv - v.
const PROGRESSION = [0, 5, 3, 4];

// Rhythms: which of the 8 steps sound. Every one has at least 4 notes, so
// the flips a bar may apply can never drop it below the contract's 3.
const RHYTHMS = [
  [1, 0, 1, 0, 1, 0, 1, 0],
  [1, 0, 1, 0, 0, 1, 0, 1],
  [1, 0, 0, 1, 0, 1, 1, 0],
  [1, 1, 0, 0, 1, 0, 0, 1],
  [1, 0, 1, 1, 0, 1, 0, 0],
  [1, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 0, 1, 1, 0, 1, 0],
  [1, 0, 1, 0, 1, 1, 0, 1],
];

// Melodic contour per bar, as offsets from the bar's root degree; 1, 3 and
// 5 are passing tones between chord tones.
const MOTIFS = [
  [0, 2, 4, 2, 6, 4, 2, 0],
  [0, 4, 2, 0, 2, 4, 6, 4],
  [4, 2, 0, 2, 0, 2, 4, 6],
  [0, 2, 1, 0, 4, 3, 2, 0],
  [6, 5, 4, 5, 2, 1, 2, 4],
  [0, 1, 2, 4, 2, 0, 1, 0],
  [0, 4, 1, 4, 0, 4, 2, 4],
  [2, 4, 6, 4, 2, 0, 2, 1],
];

// The 8-step melody of one bar of level `levelIndex`: a pure function of
// (levelIndex, barIndex), looping every 4 bars, with at least 3 notes per
// bar and each level tuned differently.
export function bar(levelIndex, barIndex) {
  const p = ((barIndex % 4) + 4) % 4; // position in the 4-bar loop
  const seed =
    (Math.imul(p + 1, 0x9e3779b9) ^ Math.imul((levelIndex + 1) | 0, 0x85ebca6b)) | 0;

  // Which chord this bar rides, and its root degree: the progression walks
  // through different positions each level, and the whole tune is
  // transposed by the level index, so levels do not sound alike.
  const shift = ((levelIndex % 4) + 4) % 4;
  const root = ((PROGRESSION[(p + shift) % 4] + levelIndex) % 7 + 7) % 7;

  // Pick the bar's rhythm and contour, then flip one step for extra variety.
  const on = RHYTHMS[Math.floor(chance(seed, p, 1) * RHYTHMS.length)].slice();
  const motif = MOTIFS[Math.floor(chance(seed, p, 2) * MOTIFS.length)];
  const flip = Math.floor(chance(seed, p, 3) * 8);
  on[flip] = on[flip] ? 0 : 1;
  const notes = on.reduce((n, v) => n + v, 0);
  if (notes < 3) on[flip] = on[flip] ? 0 : 1; // never below the contract's 3

  const steps = [];
  for (let i = 0; i < 8; i++) {
    if (!on[i]) {
      steps.push(null); // a rest
      continue;
    }
    const degree = ((root + motif[i]) % 7 + 7) % 7;
    const r = chance(seed, i, 4); // mostly mid-register, bright accents at the top
    const octave = r < 0.1 && motif[i] <= 1 ? 1 : r > 0.9 && motif[i] >= 4 ? -1 : 0;
    steps.push({ degree, octave });
  }
  return steps;
}

// Schedule one bar on an AudioContext: for each note at step `i`, one
// triangle oscillator through one gain node to `ctx.destination`, started
// at `startTime + i * 30 / bpm` and stopped at most one step later. Rests
// make nothing.
export function scheduleBar(ctx, steps, startTime, bpm, gain) {
  const stepDur = 30 / bpm; // half a beat, in seconds
  for (let i = 0; i < steps.length; i++) {
    const note = steps[i];
    if (note === null) continue;
    const t = startTime + i * stepDur;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = noteHz(note.degree, note.octave);
    const env = ctx.createGain();
    env.gain.value = gain == null ? 0.25 : gain;
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + stepDur);
  }
}
