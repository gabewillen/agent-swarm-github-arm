// §13: WebAudio synthesis of the cues in audio/cues.js. No samples, no
// files: each note is an oscillator through a gain node. The context is
// built only when a sound actually plays, because browsers allow audio
// only after a user gesture. Nothing here touches the DOM or window, and
// no AudioContext is created at import time or without the given ctor.

import { CUES } from './cues.js';

export function createAudio(AudioContextCtor) {
  let ctx = null;   // built on the first play that makes a sound
  let muted = false;

  return {
    // Play a named cue from CUES. An unknown cue plays nothing; muted
    // plays nothing; both build no context. A known cue builds the
    // context on first use, then plays one oscillator and gain per note,
    // wired oscillator -> gain -> destination.
    play(name) {
      const cue = muted ? null : CUES[name];
      if (!cue) return;
      if (!ctx) ctx = new AudioContextCtor();
      const now = ctx.currentTime;
      // Roll multi-note cues slightly so chords read as chords and runs
      // as runs; single notes play at once.
      const spread = cue.notes.length > 1
        ? Math.min(0.05, cue.duration / cue.notes.length)
        : 0;
      for (let i = 0; i < cue.notes.length; i++) {
        const osc = ctx.createOscillator();
        osc.type = cue.wave;
        osc.frequency.value = cue.notes[i];
        const gain = ctx.createGain();
        gain.gain.value = cue.gain;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const at = now + i * spread;
        osc.start(at);
        osc.stop(at + cue.duration);
      }
    },

    setMuted(value) {
      muted = value === true;
    },

    isMuted() {
      return muted;
    },
  };
}
