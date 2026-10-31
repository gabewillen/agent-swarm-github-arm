// Quorum Run — src/audio/music.js (DESIGN.md §24).
// Generative background music: the natural minor scale at 220 Hz, a tempo
// that climbs with the level, and pure four-bar loops. Notes are laid out
// as scale degrees and scheduled one oscillator at a time on the
// AudioContext the caller hands over; no module state, no samples.

// The natural minor scale, in semitones above the root.
export const SCALE = [0, 2, 3, 5, 7, 8, 10];

// The music's root frequency, in Hz (A3).
export const ROOT_HZ = 220;

// Frequency in Hz of scale `degree` (any integer; it wraps up the scale,
// and `degree mod 7` is never negative) in `octave`, which defaults to 0.
export function noteHz(degree, octave = 0) {
  const within = ((degree % 7) + 7) % 7;
  const lifted = Math.floor(degree / 7);
  return ROOT_HZ * 2 ** ((SCALE[within] + 12 * (octave + lifted)) / 12);
}

// Beats per minute for a level: 96 plus 8 a level, capped at 160.
export function tempo(levelIndex) {
  return Math.min(160, 96 + 8 * levelIndex);
}

// One bar of the loop states its chord's root degree. The tune walks
// i–VI–III–iv and comes home: a moment of colour on the minor sixth, a
// lift on the major third, and the subdominant pulls the phrase back to
// the tonic.
const PROGRESSION = [0, 5, 2, 3];

// How a note moves to the next one: small steps mostly, an occasional
// third-of-the-scale leap either way.
const WALK = [-3, -2, -1, -1, 1, 1, 2, 3];

// The seed a bar's determinism starts from. It depends only on the
// normalised bar-in-loop position, so `bar(l, b)` equals `bar(l, b + 4)`.
function barSeed(levelIndex, loop) {
  return (Math.imul(levelIndex + 1, 0x9E3779B1) ^
    Math.imul(loop + 1, 0x85EBCA77) ^ 0x27D4EB2F) >>> 0;
}

// One draw of the stream: the state advances, a uniform in [0, 1) comes
// back.
function next(seed) {
  const t = (seed + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

// Where the voice may sit: six scale steps below the octave below the
// root up to five above the octave above it, so degrees stay 0 to 6 and
// octaves stay -1 to 1.
function clampPitch(pitch) {
  return Math.min(12, Math.max(-6, pitch));
}

// `bar(levelIndex, barIndex)` lays out 8 steps: either null, a rest, or a
// note `{ degree, octave }` on the scale. Downbeats always sound, the
// weaker steps sometimes breathe, the mid-bar downbeat settles onto an
// octave of the chord's root, and a bar never holds fewer than three
// notes. Pure: same level and bar, same tune, whatever else has happened.
export function bar(levelIndex, barIndex) {
  const loop = ((barIndex % 4) + 4) % 4;
  let seed = barSeed(levelIndex, loop);
  const draw = () => {
    const r = next(seed);
    seed = r.seed;
    return r.value;
  };
  const root = PROGRESSION[loop];
  // Each bar may lift its root an octave: the level's stream chooses.
  let pitch = root + (draw() < 0.4 ? 7 : 0);
  const candidates = [];
  for (let i = 0; i < 8; i++) {
    if (i === 4) {
      // The mid-bar downbeat grounds the phrase on the chord root,
      // snapped to the octave the melody is nearest.
      pitch = clampPitch(root + 7 * Math.round((pitch - root) / 7));
    } else if (i > 0) {
      pitch = clampPitch(pitch + WALK[Math.floor(draw() * WALK.length)]);
    }
    candidates.push({
      degree: ((pitch % 7) + 7) % 7,
      octave: Math.floor(pitch / 7),
    });
  }
  // Strong beats always sound; the others rest by the stream's mood, with
  // the last step most likely to breathe before the next bar.
  const restChance = (i) => (i % 2 === 0 ? 0.15 : i === 7 ? 0.55 : 0.4);
  const steps = [];
  for (let i = 0; i < 8; i++) {
    if (i === 0 || i === 4 || draw() >= restChance(i)) {
      steps.push(candidates[i]);
    } else {
      steps.push(null);
    }
  }
  // Never fewer than three sounds in a bar: the earliest rests sound.
  let notes = 0;
  for (const step of steps) if (step !== null) notes++;
  for (let i = 0; i < 8 && notes < 3; i++) {
    if (steps[i] === null) {
      steps[i] = candidates[i];
      notes++;
    }
  }
  // The steps belong to the caller, but not for editing: freeze them so
  // the purity of `bar` shows up the moment someone tries.
  for (let i = 0; i < 8; i++) {
    if (steps[i] !== null) Object.freeze(steps[i]);
  }
  return Object.freeze(steps);
}

// `scheduleBar(ctx, steps, startTime, bpm, gain)` plays a bar of steps
// (as `bar` lays them out) on the given AudioContext: each note gets one
// triangle oscillator, pitched by `noteHz`, through one gain node at the
// given level, out to `ctx.destination`. Step `i` of the bar starts at
// `startTime + i * 30 / bpm` and stops within one step (30 / bpm
// seconds, one eighth note); a rest schedules nothing.
export function scheduleBar(ctx, steps, startTime, bpm, gain) {
  const step = 30 / bpm;
  for (let i = 0; i < steps.length; i++) {
    const note = steps[i];
    if (note === null || note === undefined) continue;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = noteHz(note.degree, note.octave);
    const level = ctx.createGain();
    level.gain.value = gain;
    osc.connect(level);
    level.connect(ctx.destination);
    osc.start(startTime + i * step);
    osc.stop(startTime + i * step + step);
  }
}
