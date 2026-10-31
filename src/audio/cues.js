// §13: which sound each event makes.
// `cuesFor(events)` maps an events list (§7) to cue names, in order,
// skipping events with no cue. `CUES` holds every cue's synthesis recipe.

export const CUES = {
  blip: { notes: [880], wave: 'square', duration: 0.08, gain: 0.25 },
  chord: { notes: [261.63, 329.63, 392.0], wave: 'triangle', duration: 0.35, gain: 0.3 },
  fanfare: { notes: [523.25, 659.25, 783.99, 1046.5], wave: 'square', duration: 0.5, gain: 0.3 },
  sweep: { notes: [196.0, 392.0, 783.99], wave: 'sawtooth', duration: 0.45, gain: 0.25 },
  buzz: { notes: [110, 108], wave: 'sawtooth', duration: 0.3, gain: 0.3 },
  scatter: { notes: [740, 620, 500, 380], wave: 'triangle', duration: 0.3, gain: 0.3 },
  thud: { notes: [90], wave: 'sine', duration: 0.15, gain: 0.5 },
  dirge: { notes: [220, 207.65, 196.0, 164.81], wave: 'triangle', duration: 0.9, gain: 0.3 },
  tick: { notes: [1200], wave: 'sine', duration: 0.05, gain: 0.15 },
};

const MAP = {
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
  const cues = [];
  for (const event of events) {
    const cue = MAP[event];
    if (cue) cues.push(cue);
  }
  return cues;
}
