// §13 — WebAudio synthesis, no samples and no files. `createAudio` takes an
// AudioContext constructor and returns a player: the context is built only
// on the first note (browsers allow audio after a gesture), every known cue
// makes one oscillator and one gain per note, and a muted or unknown cue is
// silent. It never touches `window` or `document` on import.

import { CUES } from './cues.js';

export function createAudio(AudioContextCtor) {
  let ctx = null;
  let muted = false;

  return {
    play(name) {
      const cue = CUES[name];
      if (!cue || muted) return;
      if (!ctx) ctx = new AudioContextCtor();
      const step = cue.duration / cue.notes.length;
      cue.notes.forEach((hz, i) => {
        const startAt = ctx.currentTime + i * step;
        const oscillator = ctx.createOscillator();
        oscillator.type = cue.wave;
        oscillator.frequency.value = hz;
        const gain = ctx.createGain();
        if (typeof gain.gain.setValueAtTime === 'function') {
          // A soft attack, then a decay to silence: no clicks.
          gain.gain.setValueAtTime(0.0001, startAt);
          gain.gain.linearRampToValueAtTime(cue.gain, startAt + Math.min(0.02, step));
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + cue.duration);
        } else {
          gain.gain.value = cue.gain;
        }
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + cue.duration);
      });
    },

    setMuted(value) {
      muted = value === true;
    },

    isMuted() {
      return muted;
    },
  };
}
