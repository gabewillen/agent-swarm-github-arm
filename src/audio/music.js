// Quorum Run — generative background music (DESIGN.md §24).
//
// All sound is synthesized, never sampled. The scale is the natural minor on
// ROOT_HZ; `bar` composes an 8-step melody for a level's bar from nothing but
// its arguments (a pure function), looping every 4 bars, at least 3 notes per
// bar, and different levels sounding different. Melodic choices come from a
// small counter-based integer hash, never from Math.random.

export const SCALE = [0, 2, 3, 5, 7, 8, 10]; // natural minor, semitones
export const ROOT_HZ = 220; // A3

// `degree mod 7` is never negative; `degree / 7` may go below or above the
// written octave (an octave per 7 degrees).
export function noteHz(degree, octave = 0) {
  const d = ((degree % 7) + 7) % 7;
  return ROOT_HZ * 2 ** ((SCALE[d] + 12 * (octave + Math.floor(degree / 7))) / 12);
}

export function tempo(levelIndex) {
  return Math.min(96 + 8 * levelIndex, 160);
}

// --- deterministic choosing -------------------------------------------------

// A 32-bit hash of any number of integers (splitmix-flavoured avalanche).
function h32(...xs) {
  let h = 0x9e3779b9 >>> 0;
  for (const x of xs) {
    h = Math.imul(h ^ (x >>> 0), 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x27d4eb2f) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

// Four-bar minor progressions in scale degrees (0 = tonic).
const PROGRESSIONS = [
  [0, 5, 3, 4], // i  VI  iv  v
  [0, 5, 2, 6], // i  VI  III VII
  [0, 3, 5, 4], // i  iv  VI  v
  [0, 6, 5, 4], // i  VII VI  v
];

// Step rhythms: 1 play, 0 rest; every one has at least 4 notes.
const RHYTHMS = [
  [1, 0, 1, 1, 0, 1, 0, 1],
  [1, 1, 0, 1, 1, 0, 0, 1],
  [1, 0, 1, 0, 1, 1, 0, 1],
  [1, 1, 0, 0, 1, 0, 1, 1],
  [1, 0, 0, 1, 0, 1, 1, 0],
  [1, 1, 1, 0, 1, 0, 1, 0],
  [1, 0, 1, 1, 0, 0, 1, 1],
  [1, 1, 0, 1, 0, 1, 1, 0],
];

export function bar(levelIndex, barIndex) {
  const bm = ((barIndex % 4) + 4) % 4; // the 4-bar loop
  const prog = PROGRESSIONS[h32(levelIndex, 0x70) % PROGRESSIONS.length];
  const shift = h32(levelIndex, 0x71) % 4;
  const root = prog[(shift + bm) % 4]; // the bar's chord root, a scale degree
  const rhythm = RHYTHMS[h32(levelIndex, 0x72) % RHYTHMS.length];
  const base = (h32(levelIndex, 0x73) % 3) - 1; // written octave, -1 to 1
  const steps = [];
  for (let i = 0; i < 8; i++) {
    let step = null;
    if (rhythm[i]) {
      // Chord tones (triad degrees), with occasional passing tones; the
      // downbeat carries the chord root.
      let k = 0;
      if (i > 0) {
        const tones = [0, 2, 4];
        const passing = [1, 3, 5];
        k = h32(levelIndex, bm, i, 0x10) % 4 === 0
          ? passing[h32(levelIndex, bm, i, 0x11) % passing.length]
          : tones[h32(levelIndex, bm, i, 0x12) % tones.length];
      }
      const total = root + k; // 0 to 11
      step = {
        degree: ((total % 7) + 7) % 7,
        octave: Math.max(-1, Math.min(1, base + Math.floor(total / 7))),
      };
    }
    steps.push(step);
  }
  return steps;
}

// --- playback ---------------------------------------------------------------

// Plays one bar on a WebAudio context: one triangle oscillator per note
// through its own gain (the given gain) to the destination, in step time.
// A step is 30/bpm seconds (4 beats of 8th-note steps); rests make nothing.
export function scheduleBar(ctx, steps, startTime, bpm, gain) {
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s) continue;
    const t = startTime + i * 30 / bpm;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = noteHz(s.degree, s.octave);
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 30 / bpm);
  }
}
