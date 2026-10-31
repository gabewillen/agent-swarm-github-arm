// Quorum Run — audio synthesis (DESIGN.md §13).
// createAudio(AudioContextCtor) returns { play(name), setMuted(muted),
// isMuted() }. The context is constructed only on the first play that makes
// a sound: browsers allow audio only after a user gesture.

import { CUES } from './cues.js';

export function createAudio(AudioContextCtor) {
  let ctx = null;
  let muted = false;

  function play(name) {
    const cue = CUES[name];
    if (!cue || muted) return;
    if (!ctx) ctx = new AudioContextCtor();
    // If the browser started the context suspended (no gesture yet), ask
    // it to resume; the fake contexts other code tests with have none.
    if (typeof ctx.resume === 'function') ctx.resume();
    const start = ctx.currentTime;
    for (const note of cue.notes) {
      const oscillator = ctx.createOscillator();
      oscillator.type = cue.wave;
      oscillator.frequency.value = note;
      const gain = ctx.createGain();
      gain.gain.value = cue.gain;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + cue.duration);
    }
  }

  function setMuted(m) {
    muted = Boolean(m);
  }

  function isMuted() {
    return muted;
  }

  return { play, setMuted, isMuted };
}
