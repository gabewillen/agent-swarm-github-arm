// §13 — WebAudio synthesis, no samples, no files.
//
// `createAudio(AudioContextCtor)` wraps an AudioContext constructor. The
// context itself is constructed lazily, on the first `play` that actually
// makes a sound: browsers allow audio only after a user gesture, and the
// page constructs nothing until then.
import { CUES } from './cues.js';

export function createAudio(AudioContextCtor) {
  let ctx = null;
  let muted = false;

  function play(name) {
    const cue = CUES[name];
    if (!cue || muted) return;
    if (!ctx) ctx = new AudioContextCtor();
    const now = ctx.currentTime;
    for (const note of cue.notes) {
      const osc = ctx.createOscillator();
      osc.type = cue.wave;
      osc.frequency.value = note;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(cue.gain, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + cue.duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + cue.duration);
    }
  }

  function setMuted(value) {
    muted = value === true;
  }

  function isMuted() {
    return muted;
  }

  return { play, setMuted, isMuted };
}
