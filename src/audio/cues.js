// §13 — which sound each event makes. CUES defines every cue; cuesFor maps
// a step's events list (§7) to cue names, in order, skipping events with no
// cue. All sound is synthesized from these definitions; no samples, no files.

const EVENT_CUE = {
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

export const CUES = {
  blip: {
    notes: [987.77],
    wave: 'square',
    duration: 0.06,
    gain: 0.2,
  },
  chord: {
    notes: [523.25, 659.25, 783.99],
    wave: 'triangle',
    duration: 0.22,
    gain: 0.28,
  },
  fanfare: {
    notes: [523.25, 783.99, 659.25, 1046.5, 1318.51],
    wave: 'square',
    duration: 0.12,
    gain: 0.2,
  },
  sweep: {
    notes: [329.63, 440, 587.33, 880],
    wave: 'sine',
    duration: 0.1,
    gain: 0.3,
  },
  buzz: {
    notes: [98, 103.83, 196],
    wave: 'sawtooth',
    duration: 0.3,
    gain: 0.25,
  },
  scatter: {
    notes: [880, 659.25, 493.88, 329.63, 246.94],
    wave: 'square',
    duration: 0.05,
    gain: 0.18,
  },
  thud: {
    notes: [116.54, 82.41],
    wave: 'sine',
    duration: 0.18,
    gain: 0.55,
  },
  dirge: {
    notes: [220, 207.65, 185, 164.81, 146.83, 110],
    wave: 'triangle',
    duration: 0.3,
    gain: 0.3,
  },
  tick: {
    notes: [1318.51],
    wave: 'sine',
    duration: 0.04,
    gain: 0.15,
  },
};

export function cuesFor(events) {
  const cues = [];
  for (const event of events || []) {
    const cue = EVENT_CUE[event];
    if (cue) cues.push(cue);
  }
  return cues;
}
