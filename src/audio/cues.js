// Quorum Run — sound design (DESIGN.md §13): which sound each event makes.

// Event → cue name. Events with no entry (pause, resume, anything unknown)
// make no sound.
export const EVENT_CUES = {
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

// cue name → { notes, wave, duration, gain }.
//   notes: non-empty array of frequencies in Hz (20..5000)
//   wave: 'sine' | 'square' | 'triangle' | 'sawtooth'
//   duration: seconds, 0 < duration <= 2
//   gain: 0 < gain <= 1
export const CUES = {
  blip: { notes: [660], wave: 'sine', duration: 0.09, gain: 0.35 },
  chord: { notes: [523.25, 659.25, 783.99], wave: 'triangle', duration: 0.3, gain: 0.4 },
  fanfare: { notes: [523.25, 659.25, 783.99, 1046.5], wave: 'square', duration: 0.7, gain: 0.25 },
  sweep: { notes: [330, 660, 1320], wave: 'sine', duration: 0.4, gain: 0.3 },
  buzz: { notes: [55, 58.27], wave: 'sawtooth', duration: 0.5, gain: 0.3 },
  scatter: { notes: [494, 392, 311.13, 220], wave: 'triangle', duration: 0.45, gain: 0.35 },
  thud: { notes: [82.41, 61.74], wave: 'sine', duration: 0.2, gain: 0.5 },
  dirge: { notes: [233.08, 196, 164.81, 123.47], wave: 'sawtooth', duration: 1.4, gain: 0.3 },
  tick: { notes: [1480], wave: 'square', duration: 0.05, gain: 0.12 },
};

// Map an events list to cue names, in order, skipping events with no cue.
export function cuesFor(events) {
  const out = [];
  for (const event of events) {
    const cue = EVENT_CUES[event];
    if (cue) out.push(cue);
  }
  return out;
}
