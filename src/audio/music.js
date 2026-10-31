// Generative background music (DESIGN.md §24).
//
// The tune is built from the natural minor scale. Each level gets its own
// transposition and its own pick of rhythm, contour, and octave patterns
// for every bar of the 4-bar loop, all chosen by a small integer hash, so
// `bar` stays a pure function of its arguments and different levels sound
// different.

export const SCALE = [0, 2, 3, 5, 7, 8, 10];
export const ROOT_HZ = 220;

const mod = (n, m) => ((n % m) + m) % m;

// A 32-bit mix of two integers, so pattern choices depend on both the
// level and the bar without any clock or Math.random.
function hash2(a, b) {
  let h = Math.imul(a ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(b ^ 0xC2B2AE35, 0x27D4EB2F);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545F4914136EA07 % 0x100000000);
  h ^= h >>> 13;
  return h >>> 0;
}

const PROG = [0, 5, 2, 6]; // i - VI - III - VII over the scale degrees

// Rhythm masks: 1 plays the step, 0 is a rest. Every bar keeps at least
// three notes.
const RHYTHMS = [
  [1, 1, 0, 1, 1, 0, 1, 0],
  [1, 0, 1, 1, 0, 1, 1, 0],
  [1, 0, 1, 0, 1, 1, 0, 1],
  [1, 1, 1, 0, 0, 1, 1, 0],
  [1, 0, 0, 1, 1, 0, 1, 1],
  [1, 1, 0, 0, 1, 0, 1, 1],
  [1, 0, 1, 1, 1, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 1],
];

// Melodic contours: scale-degree offsets away from the bar's chord root.
const CONTOURS = [
  [0, 0, 2, 0, 4, 2, 0, 0],
  [0, 2, 4, 2, 0, 4, 2, 0],
  [0, 4, 3, 2, 0, 2, 3, 4],
  [0, 0, 4, 0, 6, 0, 4, 0],
  [0, 2, 0, 4, 0, 2, 0, 6],
  [0, 6, 4, 5, 3, 2, 0, 0],
  [0, 0, 3, 0, 0, 4, 3, 2],
  [0, 2, 2, 4, 4, 3, 0, 0],
];

// Octave shifts per step, kept small and mostly 0.
const OCTS = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 1, 0, 0, 0, 1, 0],
  [0, 0, 0, 0, -1, -1, 0, 0],
  [0, -1, 0, 0, 0, 0, -1, 0],
  [1, 0, 0, 0, 0, 0, 0, -1],
  [0, 0, -1, 0, 0, 0, 0, 1],
];

export function noteHz(degree, octave = 0) {
  const d = mod(degree, 7);
  const semis = SCALE[d] + 12 * (octave + Math.floor(degree / 7));
  return ROOT_HZ * 2 ** (semis / 12);
}

export function tempo(levelIndex) {
  return Math.min(160, 96 + 8 * levelIndex);
}

export function bar(levelIndex, barIndex) {
  const b = mod(barIndex, 4);
  const l = levelIndex >>> 0;
  const rhythm = RHYTHMS[hash2(l, b) % RHYTHMS.length];
  const contour = CONTOURS[hash2(l + 7919, b) % CONTOURS.length];
  const octs = OCTS[hash2(l + 15731, b) % OCTS.length];
  // Different levels sit in different places on the scale: the chord for
  // each bar is PROG rotated by the level and shifted by 3 steps per
  // level, and both moves are invertible modulo 7 and 4, so two levels
  // only share a tune when they are equal modulo 28.
  const root = (PROG[mod(b + mod(levelIndex, 4), 4)] + mod(levelIndex * 3, 7)) % 7;
  const steps = [];
  for (let i = 0; i < 8; i++) {
    if (!rhythm[i]) {
      steps.push(null);
      continue;
    }
    steps.push({ degree: mod(root + contour[i], 7), octave: octs[i] });
  }
  return steps;
}

export function scheduleBar(ctx, steps, startTime, bpm, gain) {
  const stepDur = 30 / bpm;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s) continue;
    const t = startTime + i * stepDur;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = noteHz(s.degree, s.octave);
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + stepDur);
  }
}
