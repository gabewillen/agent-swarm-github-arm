// Quorum Run's generative music (DESIGN.md §24). Everything is derived
// from the natural minor scale at 220 Hz: `bar` composes a level's tune
// from pure index arithmetic (no clocks, no Math.random), and
// `scheduleBar` renders one bar as WebAudio oscillator notes.
//
// The module touches no DOM and no AudioContext at import time.

// The natural minor scale, in semitones from the root.
export const SCALE = [0, 2, 3, 5, 7, 8, 10];
// The root: A3.
export const ROOT_HZ = 220;

// The frequency of scale degree `degree` in octave `octave` (default 0),
// in Hz. Degrees wrap through the scale, so degree 7 is the octave above
// degree 0, and a negative degree wraps backwards (degree -1 is the note
// a whole step below the root).
export function noteHz(degree, octave = 0) {
  const step = ((degree % 7) + 7) % 7;
  return ROOT_HZ * 2 ** ((SCALE[step] + 12 * (octave + Math.floor(degree / 7))) / 12);
}

// Beats per minute: the music speeds up as the game goes on, capped.
export function tempo(levelIndex) {
  return Math.min(160, 96 + 8 * levelIndex);
}

// ---- composition -----------------------------------------------------

// A deterministic draw chain (the PRNG of §3, self-contained so the music
// keeps working whatever the core loads): `draws(seed, n)` is n values in
// [0, 1) from that seed, always the same for the same seed.
function draws(seed, n) {
  const values = [];
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    const t = (s + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    values.push(((r ^ (r >>> 14)) >>> 0) / 4294967296);
    s = t;
  }
  return values;
}

// Which of a bar's 8 steps sound. Every pattern carries at least 3 notes
// and starts on the downbeat so each bar keeps a pulse.
const RHYTHMS = [
  [1, 0, 1, 0, 1, 0, 1, 0],
  [1, 0, 0, 1, 0, 0, 1, 0],
  [1, 1, 0, 1, 0, 1, 0, 0],
  [1, 0, 1, 1, 0, 0, 1, 0],
  [1, 0, 0, 1, 1, 0, 0, 1],
  [1, 0, 1, 0, 0, 1, 0, 1],
];

// The whole 4-bar tune of a level in degree-index space: `p` counts scale
// degrees without wrapping, so degree(p) is p mod 7 and the octave is
// `floor(p / 7)` above the tune's base octave.
function tuneFor(levelIndex) {
  const l = levelIndex | 0;
  const v = draws(Math.imul(l + 0x51, 0x9E3779B1) ^ (l + 1), 24);
  const rhythm = [0, 1, 2, 3].map((b) => RHYTHMS[Math.floor(v[b] * RHYTHMS.length)]);
  const base = v[4] < 0.25 ? -1 : 0; // the tune sits one octave low, or not
  let p = 0; // start on the tonic
  let dir = 1;
  let note = 0; // melody steps drawn so far
  let sounded = 0; // notes placed so far
  const bars = [];
  for (let b = 0; b < 4; b++) {
    const steps = [];
    for (let i = 0; i < 8; i++) {
      if (!rhythm[b][i]) {
        steps.push(null);
        continue;
      }
      if (sounded > 0) {
        // a step of 1 or 2 up or down the scale, occasionally turning
        // around, bouncing off the range's ends
        dir = v[note] < 0.25 ? -dir : dir;
        const size = Math.floor(v[note + 7] * 2) + 1;
        let next = p + dir * size;
        if (next < 0 || next > 13) {
          next = p - dir * size;
          dir = -dir;
        }
        p = Math.min(13, Math.max(0, next));
        note += 1;
      }
      sounded += 1;
      steps.push({
        degree: p % 7,
        octave: Math.min(1, Math.max(-1, base + Math.floor(p / 7))),
      });
    }
    bars.push(steps);
  }
  // resolve home: the loop's last sounded note lands on the tonic
  const last = [...bars[3]].reverse().find(Boolean);
  if (last) {
    last.degree = 0;
    last.octave = 0;
  }
  return bars;
}

// One bar of a level's tune: 8 steps, each `null` (a rest) or a note
// `{ degree, octave }`. A pure function of its arguments; the tune loops
// every 4 bars.
export function bar(levelIndex, barIndex) {
  const which = (((barIndex | 0) % 4) + 4) % 4;
  return tuneFor(levelIndex)[which];
}

// ---- performance -----------------------------------------------------

// Schedules one bar on an AudioContext. Each note gets one triangle
// oscillator (its frequency the note's Hz) through one gain node (the
// given gain) to the destination; a note starts on its step and stops
// before the next begins. Rests schedule nothing.
export function scheduleBar(ctx, steps, startTime, bpm, gain) {
  const stepSecs = 30 / bpm; // one step of a bar in seconds
  const hold = stepSecs * 0.9; // leave a small gap after each note
  for (let i = 0; i < steps.length; i++) {
    const note = steps[i];
    if (note === null || note === undefined) continue;
    const at = startTime + i * stepSecs;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = noteHz(note.degree, note.octave);
    const env = ctx.createGain();
    env.gain.value = gain;
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + hold);
  }
}
