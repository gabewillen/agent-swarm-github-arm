// §13: WebAudio synthesis, no samples, no files.
// `createAudio(AudioContextCtor)` returns `{ play, setMuted, isMuted }`.
// The context is constructed lazily, only on the first `play` that makes a
// sound: browsers allow audio only after a user gesture.

import { CUES as CUE_TABLE } from './cues.js';

export function createAudio(AudioContextCtor) {
  let ctx = null;
  let muted = false;

  function play(name) {
    const cue = CUE_TABLE[name];
    if (!cue || muted) return;
    if (!ctx) ctx = new AudioContextCtor();
    const now = ctx.currentTime;
    const end = now + cue.duration;
    for (const note of cue.notes) {
      const osc = ctx.createOscillator();
      osc.type = cue.wave;
      osc.frequency.value = note;
      const gain = ctx.createGain();
      gain.gain.value = cue.gain;
      try {
        gain.gain.setValueAtTime(cue.gain, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
      } catch {
        // a plain fixed gain when the context has no ramping
      }
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(end);
    }
  }

  function setMuted(value) {
    muted = !!value;
  }

  function isMuted() {
    return muted;
  }

  return { play, setMuted, isMuted };
}
