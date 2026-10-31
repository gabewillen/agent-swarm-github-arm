// Quorum Run: which sound each event makes (DESIGN.md §13).
//
// `cuesFor(events)` maps an events list (§7) to cue names, in order,
// skipping events with no cue. `CUES` gives every cue its recipe: an array
// of oscillator frequencies in Hz, a wave shape, a duration in seconds,
// and a gain. All sound is synthesized: no samples, no files.

// Events with a cue, from §7's list. `pause` and `resume` are silent:
// the game already stops moving, and a click on every pause gets old.
const EVENT_CUES = {
  pickup: 'blip',
  merge: 'chord',
  quorum: 'fanfare',
  level: 'sweep',
  won: 'fanfare',
  conflict: 'buzz',
  drop: 'scatter',
  hit: 'thud',
  lost: 'dirge',
  spawn: 'tick',
};

// Every cue's notes sit between 20 and 5000 Hz. Around A220, the music
// module's root (§24), so the effects and the soundtrack agree on key.
export const CUES = {
  // A patch jumps into your hands: a quick two-note rise.
  blip: { notes: [659.25, 987.77], wave: 'square', duration: 0.07, gain: 0.22 },
  // Patches land on the pad: a rolled A-major triad, warm triangle.
  chord: {
    notes: [220, 277.18, 329.63, 440],
    wave: 'triangle',
    duration: 0.28,
    gain: 0.3,
  },
  // The quorum lands, or the game is won: a rising flourish.
  fanfare: {
    notes: [261.63, 329.63, 392, 523.25],
    wave: 'square',
    duration: 0.45,
    gain: 0.3,
  },
  // A level is shipped: a longer upward sweep.
  sweep: {
    notes: [196, 261.63, 329.63, 392, 523.25],
    wave: 'sawtooth',
    duration: 0.5,
    gain: 0.22,
  },
  // Drifts collide: a low dissonant grind, two semitones beating.
  buzz: { notes: [110, 116.54], wave: 'sawtooth', duration: 0.4, gain: 0.3 },
  // A hit while carrying: everything scatters out of your hands, falling.
  scatter: {
    notes: [783.99, 587.33, 440, 293.66],
    wave: 'square',
    duration: 0.3,
    gain: 0.25,
  },
  // A bare hit: a soft low thump, sine all the way down.
  thud: { notes: [98, 65.41], wave: 'sine', duration: 0.3, gain: 0.5 },
  // The run is lost: a slow descending minor line.
  dirge: {
    notes: [220, 196, 164.81, 146.83, 110],
    wave: 'triangle',
    duration: 1.6,
    gain: 0.32,
  },
  // A new patch spawns: the smallest possible tick.
  tick: { notes: [1318.51], wave: 'sine', duration: 0.04, gain: 0.12 },
};

// Cues for one step's events, in order, without the silent ones.
export function cuesFor(events) {
  const out = [];
  if (!Array.isArray(events)) return out;
  for (const event of events) {
    const cue = EVENT_CUES[event];
    if (cue) out.push(cue);
  }
  return out;
}
