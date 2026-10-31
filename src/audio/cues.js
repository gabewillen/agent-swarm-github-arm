// Quorum Run sound effects (DESIGN.md §13): which sound each event makes.
// All sound is synthesized with WebAudio oscillators; nothing here touches
// a DOM, a window, or an AudioContext at import time.

// Event name to cue name. An event with no entry here makes no sound.
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

// Every cue: `notes` frequencies in Hz (20 to 5000), `wave` an oscillator
// shape, `duration` in seconds (> 0, at most 2), `gain` (> 0, at most 1).
export const CUES = {
  blip: { notes: [880], wave: 'square', duration: 0.1, gain: 0.2 },
  chord: { notes: [523.25, 659.25, 783.99], wave: 'triangle', duration: 0.3, gain: 0.24 },
  fanfare: { notes: [523.25, 659.25, 783.99, 1046.5], wave: 'square', duration: 0.2, gain: 0.22 },
  sweep: { notes: [440, 587.33, 880], wave: 'sine', duration: 0.25, gain: 0.3 },
  buzz: { notes: [110, 116.54], wave: 'sawtooth', duration: 0.3, gain: 0.2 },
  scatter: { notes: [392, 311.13, 246.94, 174.61], wave: 'square', duration: 0.15, gain: 0.25 },
  thud: { notes: [110, 82.41], wave: 'sine', duration: 0.25, gain: 0.35 },
  dirge: { notes: [220, 207.65, 185, 155.56], wave: 'triangle', duration: 0.7, gain: 0.28 },
  tick: { notes: [1318.51], wave: 'sine', duration: 0.06, gain: 0.15 },
};

// Maps an events list to cue names, in order, skipping events with no cue.
export function cuesFor(events) {
  const out = [];
  if (!Array.isArray(events)) return out;
  for (const event of events) {
    const cue = EVENT_CUES[event];
    if (cue !== undefined) out.push(cue);
  }
  return out;
}
