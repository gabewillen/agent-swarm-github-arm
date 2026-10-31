// §13 — which sound each event makes. Pure data: an event name maps to a
// cue name; events with no cue (pause, resume, anything unknown) are
// simply skipped. All cues are synthesized, never sampled.

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

export function cuesFor(events) {
  const out = [];
  if (!Array.isArray(events)) return out;
  for (const event of events) {
    const cue = EVENT_CUES[event];
    if (cue !== undefined) out.push(cue);
  }
  return out;
}

// Every cue: `notes` a non-empty array of frequencies in Hz (20..5000),
// `wave` one of the four oscillator shapes, `duration` in seconds
// (0 < d <= 2), `gain` (0 < g <= 1).
export const CUES = {
  blip: { notes: [880, 1174.66], wave: 'sine', duration: 0.09, gain: 0.3 },
  chord: { notes: [523.25, 659.25, 783.99], wave: 'triangle', duration: 0.22, gain: 0.25 },
  fanfare: { notes: [392, 523.25, 659.25, 1046.5], wave: 'square', duration: 0.6, gain: 0.2 },
  sweep: { notes: [261.63, 329.63, 392, 523.25], wave: 'triangle', duration: 0.5, gain: 0.25 },
  buzz: { notes: [110, 103.8], wave: 'sawtooth', duration: 0.4, gain: 0.25 },
  scatter: { notes: [587.33, 440, 293.66], wave: 'triangle', duration: 0.35, gain: 0.25 },
  thud: { notes: [150, 70], wave: 'sine', duration: 0.25, gain: 0.5 },
  dirge: { notes: [220, 196, 164.81, 130.81], wave: 'sine', duration: 0.9, gain: 0.3 },
  tick: { notes: [1975.55], wave: 'sine', duration: 0.05, gain: 0.2 },
};
