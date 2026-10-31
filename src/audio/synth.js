// Quorum Run — WebAudio synthesis (DESIGN.md §13): every sound is a few
// oscillators, no samples, no files.

import { CUES } from './cues.js';

// Schedule one cue on a context starting at time t0: one oscillator and one
// gain per note, oscillator into gain, gain into ctx.destination, staggered
// starts with a decay envelope, each note stopped before the cue ends.
export function playCue(ctx, cue, t0) {
  const n = cue.notes.length;
  const step = cue.duration / (n + 1);
  for (let i = 0; i < n; i++) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = cue.wave;
    osc.frequency.value = cue.notes[i];
    const start = t0 + i * step;
    const end = t0 + cue.duration;
    g.gain.setValueAtTime(cue.gain, start);
    g.gain.linearRampToValueAtTime(0.0001, end);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(start);
    osc.stop(end);
  }
}

// createAudio(AudioContextCtor) → { play(name), setMuted(muted), isMuted() }.
// The context is constructed lazily, on the first play that actually makes
// a sound (browsers allow audio only after a user gesture).
export function createAudio(AudioContextCtor) {
  let ctx = null;
  let muted = false;

  return {
    play(name) {
      const cue = CUES[name];
      if (!cue || muted) return;
      if (!ctx) ctx = new AudioContextCtor();
      playCue(ctx, cue, ctx.currentTime);
    },
    setMuted(m) {
      muted = !!m;
    },
    isMuted() {
      return muted;
    },
  };
}
