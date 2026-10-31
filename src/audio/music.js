// Generative background music (DESIGN.md §24). Nothing here is sampled: the
// tune is a pure function of the level and the bar, and `scheduleBar` plays
// it with plain WebAudio oscillators.

export const SCALE = [0, 2, 3, 5, 7, 8, 10];
export const ROOT_HZ = 220;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mod = (n, m) => ((n % m) + m) % m;

/** Frequency of a scale degree, `octave` defaulting to 0. */
export function noteHz(degree, octave = 0) {
  const semi = SCALE[mod(degree, 7)] + 12 * (octave + Math.floor(degree / 7));
  return ROOT_HZ * 2 ** (semi / 12);
}

/** Beats per minute: the music speeds up as the levels go on. */
export function tempo(levelIndex) {
  return Math.min(160, 96 + 8 * levelIndex);
}

// One-note-per-step rhythms, always at least three notes to a bar.
const PATTERNS = [
  [1, 0, 1, 0, 1, 0, 1, 0],
  [1, 1, 0, 0, 1, 0, 1, 1],
  [1, 0, 0, 1, 0, 1, 1, 0],
  [1, 1, 1, 0, 1, 0, 0, 1],
  [1, 0, 1, 1, 0, 0, 1, 0],
  [1, 0, 1, 0, 0, 1, 0, 1],
];

// Melodic contours: how the bar's notes move through the scale.
const SHAPES = [
  [0, 1, 2, 1, 3, 2, 4, 3],
  [0, 2, 4, 2, 3, 2, 1, 2],
  [0, 3, 2, 4, 3, 1, 2, 0],
  [0, 2, 3, 5, 4, 3, 1, 0],
  [0, 1, 3, 2, 0, 4, 3, 1],
  [0, 4, 3, 2, 3, 1, 2, 3],
];

function hash2(a, b) {
  let h = (Math.imul(a | 0, 0x27d4eb2f) ^ Math.imul(b | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b313d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

function pick(h, i, n) {
  const t = Math.imul(h ^ Math.imul(i + 1, 0x9e3779b1), 0x7feb352d) >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) % n;
}

/**
 * One bar: 8 steps, each `null` (a rest) or `{ degree, octave }`. A 4-bar
 * loop per level, so the music loops while you play and every level sounds
 * its own: a rotated key, its own contour and rhythm, its own register.
 */
export function bar(levelIndex, barIndex) {
  const l = levelIndex | 0;
  const b = mod(barIndex | 0, 4);
  const h = hash2(l * 7 + 1, b * 13 + 5);
  const pattern = PATTERNS[pick(h, 0, PATTERNS.length)];
  const shape = SHAPES[pick(h, 1, SHAPES.length)];
  const key = mod(l * 3 + b, 7);
  const register = mod(l, 3) - 1;
  const steps = [];
  for (let i = 0; i < 8; i++) {
    if (!pattern[i]) {
      steps.push(null);
      continue;
    }
    const degree = mod(key + shape[i], 7);
    const bass = i === 0 && b % 2 === 1 ? -1 : 0;
    const lift = i === 6 && (l + b) % 2 === 0 ? 1 : 0;
    steps.push({ degree, octave: clamp(register + bass + lift, -1, 1) });
  }
  return steps;
}

/** Play a bar on an AudioContext: one triangle oscillator per note. */
export function scheduleBar(ctx, steps, startTime, bpm, gain = 0.2) {
  const step = 30 / (bpm > 0 ? bpm : tempo(0));
  for (let i = 0; i < steps.length; i++) {
    const note = steps[i];
    if (!note) continue;
    const osc = ctx.createOscillator();
    const node = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = noteHz(note.degree, note.octave);
    node.gain.value = gain;
    osc.connect(node);
    node.connect(ctx.destination);
    const at = startTime + i * step;
    osc.start(at);
    osc.stop(at + step);
  }
}
