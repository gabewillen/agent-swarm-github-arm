// Audio cues (DESIGN.md §13): which sound each event makes, and the
// shape of every synthesized sound.

export const CUES = {
  blip: { notes: [660], wave: 'square', duration: 0.08, gain: 0.3 },
  chord: { notes: [262, 330, 392], wave: 'triangle', duration: 0.30, gain: 0.35 },
  fanfare: { notes: [392, 523, 659, 784], wave: 'triangle', duration: 0.45, gain: 0.40 },
  sweep: { notes: [523, 659, 784], wave: 'sine', duration: 0.35, gain: 0.35 },
  buzz: { notes: [110, 116], wave: 'sawtooth', duration: 0.40, gain: 0.30 },
  scatter: { notes: [880, 660, 440, 330], wave: 'square', duration: 0.20, gain: 0.25 },
  thud: { notes: [82], wave: 'sine', duration: 0.22, gain: 0.50 },
  dirge: { notes: [220, 185, 147, 110], wave: 'triangle', duration: 0.80, gain: 0.35 },
  tick: { notes: [1200], wave: 'sine', duration: 0.05, gain: 0.20 },
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

// cuesFor(events) -> the cue names, in order, skiping events with no cue.
export function cuesFor(events) {
  const out = [];
  for (const e of events) {
    const cue = MAP[e];
    if (cue) out.push(cue);
  }
  return out;
}
