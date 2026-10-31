// §13 — which sound each event makes. `cuesFor` maps a step's events list to
// cue names, in the order they happened, skipping events that make no sound.
// `CUES` describes every cue: the notes to play (Hz), the oscillator wave,
// the seconds each note rings, and how loud it is.

// Event -> cue. Events without an entry (pause, resume, ...) are silent.
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

export const CUES = {
  // A patch snaps off its spawn point: a quick rise.
  blip: { notes: [880, 1318.51], wave: 'square', duration: 0.12, gain: 0.35 },
  // Patches click into the merge pad: a rolled major chord.
  chord: { notes: [523.25, 659.26, 783.99], wave: 'triangle', duration: 0.35, gain: 0.4 },
  // The quorum lands, or the level ships: a bright four-note call.
  fanfare: { notes: [523.25, 659.26, 783.99, 1046.5], wave: 'square', duration: 0.5, gain: 0.45 },
  // A new level unfurls: a rising arpeggio.
  sweep: { notes: [440, 554.37, 659.26, 880, 1108.73], wave: 'sine', duration: 0.5, gain: 0.4 },
  // Two drifts collide: a detuned, beating grind.
  buzz: { notes: [110, 103.83], wave: 'sawtooth', duration: 0.35, gain: 0.3 },
  // Carried patches slip away: a falling clatter.
  scatter: { notes: [987.77, 783.99, 622.25, 493.88], wave: 'triangle', duration: 0.4, gain: 0.35 },
  // A drift catches the courier bare-handed: a low knock.
  thud: { notes: [98, 73.42], wave: 'sine', duration: 0.4, gain: 0.55 },
  // Out of lives: a slow descending lament.
  dirge: { notes: [261.63, 246.94, 220, 164.81, 110], wave: 'triangle', duration: 1.5, gain: 0.45 },
  // A patch materialises: a tiny double tick.
  tick: { notes: [1318.51, 1760], wave: 'sine', duration: 0.08, gain: 0.25 },
};

export function cuesFor(events) {
  const out = [];
  for (const event of events) {
    const cue = EVENT_CUES[event];
    if (cue) out.push(cue);
  }
  return out;
}
