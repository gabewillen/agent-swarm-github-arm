// The audio synth (DESIGN.md §13): WebAudio oscillators, no samples.
// The context is built lazily on the first sound, since browsers allow
// audio only after a user gesture; muted or unknown sounds do nothing.

import { CUES } from './cues.js';

export function createAudio(AudioContextCtor) {
  let ctx = null;
  let muted = false;

  function play(name) {
    const cue = CUES[name];
    if (!cue || muted) return;
    if (ctx === null) ctx = new AudioContextCtor();
    const t = ctx.currentTime;
    for (const note of cue.notes) {
      const osc = ctx.createOscillator();
      osc.type = cue.wave;
      osc.frequency.value = note;
      const gain = ctx.createGain();
      gain.gain.value = cue.gain;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(t + cue.duration);
    }
  }

  return {
    play(name) {
      play(name);
    },
    setMuted(value) {
      muted = !!value;
    },
    isMuted() {
      return muted;
    },
  };
}
