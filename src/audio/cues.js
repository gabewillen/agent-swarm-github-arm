// §13 — which sound each event makes.
//
// The rules (§7) put the events of the last step in `state.events`; the
// renderer, audio, and UI read them. Every event with a cue maps to it
// here, and the events with no cue (pause, resume) stay silent.

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

// Every synthesized cue. `notes` are frequencies in Hz, `wave` is an
// oscillator type, `duration` is seconds, `gain` a multiplier of full
// volume — all inside the ranges §13 allows (notes 20 to 5000 Hz,
// duration above 0 and at most 2, gain above 0 and at most 1).
export const CUES = {
  blip: { notes: [880], wave: 'square', duration: 0.09, gain: 0.12 },
  tick: { notes: [1318.51], wave: 'sine', duration: 0.05, gain: 0.08 },
  chord: { notes: [440, 554.37, 659.25], wave: 'triangle', duration: 0.28, gain: 0.18 },
  sweep: { notes: [330, 440, 554.37, 660], wave: 'sine', duration: 0.5, gain: 0.18 },
  fanfare: { notes: [440, 554.37, 659.25, 880], wave: 'square', duration: 0.6, gain: 0.2 },
  buzz: { notes: [110, 110, 116.54], wave: 'sawtooth', duration: 0.3, gain: 0.15 },
  scatter: { notes: [783.99, 622.25, 493.88, 392], wave: 'square', duration: 0.22, gain: 0.12 },
  thud: { notes: [82.41, 65.41], wave: 'sine', duration: 0.3, gain: 0.35 },
  dirge: { notes: [220, 207.65, 185, 164.81], wave: 'triangle', duration: 1.4, gain: 0.25 },
};

// `cuesFor(events)` maps an events list to cue names, in order, skipping
// events with no cue (unknown events included).
export function cuesFor(events) {
  const cues = [];
  if (!Array.isArray(events)) return cues;
  for (const event of events) {
    const cue = EVENT_CUES[event];
    if (cue) cues.push(cue);
  }
  return cues;
}
