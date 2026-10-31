// Which sound each event makes (DESIGN.md §13) and every cue's recipe.
// All tones are synthesized later from these: a list of frequencies, one
// wave, a duration in seconds, and a gain in [0, 1].

export const CUES = {
  blip: { notes: [880], wave: 'square', duration: 0.08, gain: 0.25 },
  chord: { notes: [440, 550, 660], wave: 'sine', duration: 0.32, gain: 0.3 },
  fanfare: { notes: [523, 659, 784], wave: 'triangle', duration: 0.5, gain: 0.4 },
  sweep: { notes: [220, 330, 495, 742], wave: 'sawtooth', duration: 0.4, gain: 0.2 },
  buzz: { notes: [110, 116], wave: 'square', duration: 0.26, gain: 0.35 },
  scatter: { notes: [1600, 1380, 1180, 990], wave: 'triangle', duration: 0.14, gain: 0.25 },
  thud: { notes: [80], wave: 'sine', duration: 0.22, gain: 0.6 },
  dirge: { notes: [196, 174, 147], wave: 'sine', duration: 0.9, gain: 0.45 },
  tick: { notes: [1900], wave: 'sine', duration: 0.05, gain: 0.15 },
};

const CUE_OF_EVENT = {
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
  const names = [];
  for (const e of events) {
    const cue = CUE_OF_EVENT[e];
    if (cue !== undefined) names.push(cue);
  }
  return names;
}
