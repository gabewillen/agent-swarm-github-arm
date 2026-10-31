// Sound cues: which synthesized sound each game event makes (DESIGN.md §13).
// All sound is WebAudio oscillator synthesis: no samples, no files. These
// are the recipes the synth plays.

// Event name -> cue name, one cue per event, in event order.
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

// Cue name -> { notes, wave, duration, gain }.
// `notes` are Hz (20..5000), `wave` one of 'sine' | 'square' | 'triangle' |
// 'sawtooth', `duration` in seconds (0 < d <= 2), `gain` 0 < g <= 1.
export const CUES = {
  // pickup: a short, bright square blip.
  blip: { notes: [880], wave: 'square', duration: 0.12, gain: 0.22 },

  // merge: a warm major triad (C5 E5 G5).
  chord: { notes: [523.25, 659.25, 783.99], wave: 'triangle', duration: 0.35, gain: 0.28 },

  // quorum / won: a rising fanfare four notes up.
  fanfare: { notes: [523.25, 659.25, 783.99, 1046.5], wave: 'square', duration: 0.45, gain: 0.24 },

  // level: a smooth rising arpeggio, sine for the sweep feel.
  sweep: { notes: [392, 523.25, 659.25, 880], wave: 'sine', duration: 0.5, gain: 0.3 },

  // conflict: a low, dissonant sawtooth buzz.
  buzz: { notes: [110, 104], wave: 'sawtooth', duration: 0.25, gain: 0.3 },

  // drop: a quick descending scatter.
  scatter: { notes: [740, 620, 500], wave: 'triangle', duration: 0.2, gain: 0.24 },

  // hit: a deep soft double-thud.
  thud: { notes: [82, 66], wave: 'sine', duration: 0.18, gain: 0.5 },

  // lost: a slow descending minor descent.
  dirge: { notes: [392, 311.13, 261.63, 196], wave: 'sine', duration: 0.9, gain: 0.32 },

  // spawn: a tiny high tick.
  tick: { notes: [1318.5], wave: 'triangle', duration: 0.06, gain: 0.18 },
};

// Map the events of the last step (in order) to cue names, skipping
// events that have no cue.
export function cuesFor(events) {
  const out = [];
  for (const event of events || []) {
    const cue = EVENT_CUES[event];
    if (cue) out.push(cue);
  }
  return out;
}
