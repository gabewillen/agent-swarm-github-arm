// §24: generative background music. Everything here is synthesized from
// numbers: a natural minor scale, a per-level tempo, a four-bar looping
// pattern, and a scheduler that drives WebAudio oscillators. Pure
// functions at import time; an AudioContext is only touched through the
// one this module's caller hands to scheduleBar.

export const SCALE = [0, 2, 3, 5, 7, 8, 10];
export const ROOT_HZ = 220;

// noteHz(degree, octave) is ROOT_HZ * 2 ** ((SCALE[degree mod 7] + 12 *
// (octave + Math.floor(degree / 7))) / 12), with degree mod 7 never
// negative, so degrees wrap upward into the next octave.
export function noteHz(degree, octave = 0) {
  const step = ((degree % 7) + 7) % 7;
  const oct = octave + Math.floor(degree / 7);
  return ROOT_HZ * 2 ** ((SCALE[step] + 12 * oct) / 12);
}

// 96 bpm at the first level, +8 per level after, capped at 160.
export function tempo(levelIndex) {
  return Math.min(96 + 8 * levelIndex, 160);
}

// FNV-1a over a few integers: pure, deterministic spread for pattern
// choices: no clock reads, no raw random — bar() must be a pure function.
function hashN(...nums) {
  let h = 0x811c9dc5;
  for (const n of nums) h = Math.imul(h ^ (n | 0), 0x01000193) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

// Rhythm masks, one bit per step, every mask at least 3 notes (bit 0 is
// step 0). Anchored on the downbeat so the bar keeps a pulse.
const RHYTHMS = [
  0b10110101, // steps 0,2,4,5,6 -> 5 notes
  0b10001001, // steps 0,3,7 -> 3 notes
  0b10010110, // steps 1,2,4,6 -> 4 notes
  0b11010010, // steps 1,4,6,7 -> 4 notes
  0b10100101, // steps 0,2,5,7 -> 4 notes
  0b10101101, // steps 0,2,3,5,7 -> 5 notes
];

// Melody pool: chord tones first so notes mostly land on the harmony.
const MEL_POOL = [0, 2, 4, 6, 1, 3, 5];

// bar(levelIndex, barIndex) -> 8 steps, each null or { degree, octave },
// looping every 4 bars: a different level gets a different tune.
export function bar(levelIndex, barIndex) {
  const l = levelIndex | 0;
  const b = ((barIndex % 4) + 4) % 4;
  const h = hashN(l, b);
  const mask = RHYTHMS[h % RHYTHMS.length];
  // bass root varies per bar: octave -1, 0, or 0 (root octave positions)
  const bassOct = [-1, 0, 0][(h >>> 3) % 3];
  const steps = [];
  for (let i = 0; i < 8; i++) {
    if (!((mask >> i) & 1)) {
      steps.push(null);
      continue;
    }
    const hh = hashN(l, b, i);
    if (i === 0 || (i === 4 && !(mask & 1))) {
      // the anchor step holds the tonic
      steps.push({ degree: 0, octave: bassOct });
    } else {
      const degree = MEL_POOL[hh % MEL_POOL.length];
      const o = (hh >>> 5) % 8;
      const octave = o === 0 ? -1 : o <= 5 ? 0 : 1;
      steps.push({ degree, octave });
    }
  }
  // every mask has >= 3 notes already; pad defensively all the same.
  let notes = steps.filter(Boolean).length;
  for (let i = 0; i < 8 && notes < 3; i++) {
    if (steps[i] === null) {
      const hh = hashN(l, b, i, 9);
      steps[i] = { degree: MEL_POOL[hh % MEL_POOL.length], octave: 0 };
      notes++;
    }
  }
  return steps;
}

// scheduleBar plays one bar on an AudioContext: for each note at step i,
// one triangle oscillator (frequency its noteHz) through one gain node to
// ctx.destination, started at startTime + i * 30 / bpm and stopped at most
// 30 / bpm seconds later. Rests make nothing. Returns nothing.
export function scheduleBar(ctx, steps, startTime, bpm, gain) {
  const stepLen = 30 / bpm;
  for (let i = 0; i < steps.length; i++) {
    const note = steps[i];
    if (note === null || note === undefined) continue;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = noteHz(note.degree, note.octave);
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    const t0 = startTime + i * stepLen;
    osc.start(t0);
    osc.stop(t0 + stepLen);
  }
}
