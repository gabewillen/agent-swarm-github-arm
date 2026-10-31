// DESIGN.md §13: which sound each game event makes.
// Pure data and a pure mapping: no audio API, nothing that imports a browser.

// The event -> cue table of §7/§13. Events not listed here make no sound.
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

// Every cue is a short synthesized figure: notes in Hz (20 to 5000), the
// oscillator's wave, its length in seconds, and its gain. `spread` is the
// delay between note starts, so a figure can be a chord (spread 0) or a
// little melody.
export const CUES = {
  blip: {
    notes: [880, 1318.51],
    wave: 'sine',
    duration: 0.07,
    gain: 0.25,
    spread: 0.03,
  },
  chord: {
    notes: [523.25, 659.25, 783.99],
    wave: 'triangle',
    duration: 0.3,
    gain: 0.3,
    spread: 0,
  },
  fanfare: {
    notes: [440, 523.25, 659.25, 880],
    wave: 'square',
    duration: 0.45,
    gain: 0.28,
    spread: 0.1,
  },
  sweep: {
    notes: [220, 349.23, 440, 659.25],
    wave: 'sine',
    duration: 0.4,
    gain: 0.25,
    spread: 0.09,
  },
  buzz: {
    notes: [116.54, 123.47],
    wave: 'sawtooth',
    duration: 0.22,
    gain: 0.2,
    spread: 0,
  },
  scatter: {
    notes: [1046.5, 783.99, 587.33, 415.3],
    wave: 'square',
    duration: 0.28,
    gain: 0.22,
    spread: 0.05,
  },
  thud: {
    notes: [130.81, 98],
    wave: 'sine',
    duration: 0.22,
    gain: 0.4,
    spread: 0.06,
  },
  dirge: {
    notes: [220, 174.61, 130.81, 87.31],
    wave: 'triangle',
    duration: 1.1,
    gain: 0.3,
    spread: 0.18,
  },
  tick: {
    notes: [1567.98],
    wave: 'triangle',
    duration: 0.045,
    gain: 0.14,
    spread: 0,
  },
};

// cuesFor(events) -> the cue names to play, in order, skipping events with
// no cue (§13's table).
export function cuesFor(events) {
  if (!Array.isArray(events)) return [];
  const cues = [];
  for (const event of events) {
    const cue = EVENT_CUES[event];
    if (cue) cues.push(cue);
  }
  return cues;
}
