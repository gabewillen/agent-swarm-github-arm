// §24 Music. Background music is generated, never sampled: a small
// deterministic composer per level, played on whatever AudioContext the
// caller hands to scheduleBar. This module never creates an AudioContext,
// touches the DOM, or uses Math.random — same (levelIndex, barIndex), same
// bar, forever.

export const SCALE = [0, 2, 3, 5, 7, 8, 10];

export const ROOT_HZ = 220;

// degree mod 7 is never negative (a true modulo), and negative degrees
// drop an octave: noteHz(-1) is the minor seventh an octave down.
export function noteHz(degree, octave = 0) {
  const m = ((degree % 7) + 7) % 7;
  const floorOct = Math.floor(degree / 7);
  return ROOT_HZ * 2 ** ((SCALE[m] + 12 * (octave + floorOct)) / 12);
}

// 96 BPM at level 0, +8 per level, capped at 160.
export function tempo(levelIndex) {
  return Math.min(96 + 8 * levelIndex, 160);
}

// Chord roots per bar (barIndex mod 4), one row per variant level.
const CHORDS = [
  [0, 5, 3, 4],
  [0, 3, 5, 4],
  [5, 2, 0, 3],
  [3, 0, 4, 5],
  [2, 5, 0, 4],
  [0, 6, 3, 5],
  [4, 1, 5, 0],
];

// Which of a bar's 8 steps carry notes (bit i = step i): the level's
// groove. Every mask has at least four notes.
const RHYTHMS = [
  0b10110101,
  0b11010110,
  0b10110010,
  0b10101101,
  0b11001010,
  0b10110110,
  0b10011011,
];

// A pure mulberry32, seeded per bar, so the melodic walk is deterministic
// and identical every call.
function tuneRng(seed) {
  let t = seed >>> 0;
  return function next() {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

// Keep a pitch position carrying its octave in [-1, 1]: position p means
// note mod(p, 7) with octave floor(p / 7); sliding it by 7 is an octave.
function clampPitch(p) {
  while (p > 13) p -= 7;
  while (p < -7) p += 7;
  return p;
}

// bar(levelIndex, barIndex): 8 steps, each null (a rest) or
// { degree, octave }. Pure, a loop of 4 bars, at least 3 notes every bar,
// and each level mod 7 gets its own chords, groove, and singing register.
export function bar(levelIndex, barIndex) {
  const v = mod(levelIndex, CHORDS.length);
  const b = mod(barIndex, 4);
  const root = CHORDS[v][b];
  const rhythm = RHYTHMS[mod(v * 12 + b * 3, RHYTHMS.length)];
  const high = mod(v, 2) === 1; // odd variants sing an octave up
  const rnd = tuneRng(Math.imul(v + 1, 0x9E3779B9) ^ Math.imul(b + 1, 0x85EBCA6B) ^ 0x0BADC0DE);

  // A melodic walk: the first note of the bar sits on the chord root,
  // later notes step around the scale. Positions slide by whole octaves
  // so degree stays in 0..6 and octave in -1..1.
  const steps = [];
  let notes = 0;
  let p = root + (high ? 7 : 0);
  for (let i = 0; i < 8; i++) {
    if (!((rhythm >> i) & 1)) {
      steps.push(null);
      continue;
    }
    if (notes > 0) {
      const move = [-2, -1, -1, 0, 1, 1, 2, 3][Math.floor(rnd() * 8)];
      p = clampPitch(p + move);
    }
    steps.push({ degree: mod(p, 7), octave: Math.floor(p / 7) });
    notes++;
  }
  // If a groove came up short, fill the backbeat; never fewer than 3.
  for (let i = 1; i < 8 && notes < 3; i += 2) {
    if (steps[i] === null) {
      steps[i] = { degree: mod(p, 7), octave: Math.floor(p / 7) };
      notes++;
    }
  }
  return steps;
}

// scheduleBar(ctx, steps, startTime, bpm, gain) plays one bar: each note
// at step i is a triangle oscillator at its noteHz, through a gain node
// at the given gain, to ctx.destination — started at
// startTime + i * 30 / bpm and stopped a eighth-note later at most. Rests
// schedule nothing at all.
export function scheduleBar(ctx, steps, startTime, bpm, gain) {
  const stepLen = 30 / bpm;
  for (let i = 0; i < steps.length; i++) {
    const note = steps[i];
    if (!note) continue;
    const t = startTime + i * stepLen;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = noteHz(note.degree, note.octave);
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + stepLen);
  }
}
