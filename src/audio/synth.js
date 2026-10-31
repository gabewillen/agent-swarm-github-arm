// WebAudio synthesis (DESIGN.md §13): no samples, no files. The context
// comes up on the first play that makes a sound, since browsers allow
// audio only after a user gesture.

import { CUES } from './cues.js';

export function createAudio(AudioContextCtor) {
  let ctx = null;
  let muted = false;
  return {
    play(name) {
      if (muted) return;
      const cue = CUES[name];
      if (cue === undefined) return;
      if (ctx === null) ctx = new AudioContextCtor();
      const at = ctx.currentTime;
      for (const note of cue.notes) {
        const osc = ctx.createOscillator();
        osc.type = cue.wave;
        osc.frequency.value = note;
        const gain = ctx.createGain();
        gain.gain.value = cue.gain;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + cue.duration);
      }
    },
    setMuted(value) {
      muted = !!value;
    },
    isMuted() {
      return muted;
    },
  };
}
