// §13: which sound each event makes. Pure data and a pure function; the
// router is the event table, the library is the cue table. Synthesis (how a
// cue sounds) lives in audio/synth.js.

// Every cue that CUES defines, with its notes in Hz, one oscillator wave,
// a duration in seconds, and a gain in [0, 1]. Short cues for small
// happenings (pickup, spawn), a chord for a merge, longer lines for a
// quorum, a shipped level, a loss.
export const CUES = {
  // pickup: one bright blip, square for the arcade edge
  blip: {
    notes: [880, 1100],
    wave: 'square',
    duration: 0.09,
    gain: 0.18,
  },

  // merge: a major chord, rolled slightly by the synth's per-note offset
  chord: {
    notes: [261.63, 329.63, 392.0],
    wave: 'triangle',
    duration: 0.35,
    gain: 0.28,
  },

  // quorum / won: a rising fanfare, four notes ending on the octave
  fanfare: {
    notes: [523.25, 659.25, 783.99, 1046.5],
    wave: 'square',
    duration: 0.5,
    gain: 0.2,
  },

  // level: an upward sweep, sine so it glides rather than hooks
  sweep: {
    notes: [261.63, 349.23, 440.0, 523.25, 698.46],
    wave: 'sine',
    duration: 0.7,
    gain: 0.25,
  },

  // conflict: two drifts colliding, a grinding low buzz
  buzz: {
    notes: [110, 104, 98],
    wave: 'sawtooth',
    duration: 0.5,
    gain: 0.16,
  },

  // drop: everything in hand scatters, a falling run
  scatter: {
    notes: [739.99, 659.26, 587.33, 523.25, 440.0],
    wave: 'square',
    duration: 0.3,
    gain: 0.14,
  },

  // hit: a low, blunt thud below the melody's range
  thud: {
    notes: [70, 55],
    wave: 'sine',
    duration: 0.3,
    gain: 0.6,
  },

  // lost: a slow descending line, the game over's dirge
  dirge: {
    notes: [220.0, 207.65, 164.81, 146.83, 110.0],
    wave: 'sine',
    duration: 1.5,
    gain: 0.25,
  },

  // spawn: a patch appears, a very short tick
  tick: {
    notes: [1250, 1550],
    wave: 'triangle',
    duration: 0.05,
    gain: 0.1,
  },
};

// The event-to-cue router of §7 and §13. Events with no cue (pause,
// resume) contribute nothing; the cue list keeps the events' own order.
const CUE_OF = {
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
    const cue = CUE_OF[event];
    if (cue !== undefined) out.push(cue);
  }
  return out;
}
