// Quorum Run: WebAudio synthesis, no samples (DESIGN.md §13).
//
// `createAudio(AudioContextCtor)` returns a small player. The context is
// built only on the first `play` that makes a sound, because browsers
// allow audio only after a user gesture. `play` of a known cue, when not
// muted, makes one oscillator and one gain per note, wires each
// oscillator through its gain to the destination, and starts and stops
// them in time. `play` of an unknown cue, or while muted, does nothing.

import { CUES } from './cues.js';

// Stagger between the notes of one cue, in seconds: enough to roll a
// chord or spread a run into a short arpeggio, small enough to stay a
// single gesture of sound.
const NOTE_STAGGER = 0.06;

export function createAudio(AudioContextCtor) {
  let ctx = null;
  let muted = false;

  function connector(cue) {
    return (note, index) => {
      const start = ctx.currentTime + index * NOTE_STAGGER;
      const oscillator = ctx.createOscillator();
      oscillator.type = cue.wave;
      oscillator.frequency.value = note;
      const gain = ctx.createGain();
      gain.gain.value = cue.gain;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      // Ramp down first when the gain node allows it: an abrupt stop
      // clicks, a short decay does not.
      if (typeof gain.gain.setValueAtTime === 'function') {
        gain.gain.setValueAtTime(cue.gain, start);
        gain.gain.linearRampToValueAtTime(0.0001, start + cue.duration);
      }
      oscillator.stop(start + cue.duration);
    };
  }

  return {
    // One context serves every sound: it is made on the first play that
    // is unmuted and names a known cue, and kept after that.
    play(name) {
      if (muted) return;
      const cue = CUES[name];
      if (!cue) return;
      if (!ctx) ctx = new AudioContextCtor();
      cue.notes.forEach(connector(cue));
    },

    setMuted(value) {
      muted = value === true;
    },

    isMuted() {
      return muted;
    },
  };
}
