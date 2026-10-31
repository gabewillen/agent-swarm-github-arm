// Quorum Run — sound cues (DESIGN.md §13).
// Which sound each event makes, and every cue's synthesis shape. All sound
// is synthesized with WebAudio oscillators: no samples, no files.

// Event -> cue name. Events with no entry (pause, resume) make no sound.
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

// Cue name -> { notes, wave, duration, gain }: notes are frequencies in Hz
// (20 to 5000), wave is an oscillator type, duration is seconds (0 < d <= 2),
// gain is 0 < g <= 1.
export const CUES = {
  blip: { notes: [660], wave: 'square', duration: 0.08, gain: 0.25 },
  chord: { notes: [261.63, 329.63, 392], wave: 'triangle', duration: 0.35, gain: 0.3 },
  fanfare: { notes: [392, 523.25, 659.25], wave: 'square', duration: 0.5, gain: 0.28 },
  sweep: { notes: [330, 440, 660, 880], wave: 'sine', duration: 0.6, gain: 0.2 },
  buzz: { notes: [110, 104], wave: 'sawtooth', duration: 0.3, gain: 0.3 },
  scatter: { notes: [880, 660, 440, 330], wave: 'triangle', duration: 0.25, gain: 0.25 },
  thud: { notes: [80], wave: 'sine', duration: 0.2, gain: 0.5 },
  dirge: { notes: [220, 207.65, 196], wave: 'sine', duration: 1.2, gain: 0.3 },
  tick: { notes: [1200], wave: 'sine', duration: 0.05, gain: 0.12 },
};

// cuesFor(events) maps an events list to cue names, in order, skipping
// events with no cue.
export function cuesFor(events) {
  const out = [];
  for (const event of events) {
    const cue = EVENT_CUES[event];
    if (cue) out.push(cue);
  }
  return out;
}
