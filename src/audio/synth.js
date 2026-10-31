// Quorum Run sound effects (DESIGN.md §13): WebAudio synthesis, no samples.
// `createAudio` never touches a global AudioContext: the constructor comes
// in as an argument, the context is built lazily, and only when a sound is
// actually played (browsers allow audio only after a user gesture).
import { CUES } from './cues.js';

// Builds the player: `{ play(name), setMuted(muted), isMuted() }`.
export function createAudio(AudioContextCtor) {
  let ctx = null;
  let muted = false;

  function ensureContext() {
    if (!ctx) ctx = new AudioContextCtor();
    return ctx;
  }

  return {
    // Plays one cue by name. Nothing is built or played while muted or for
    // an unknown cue: an unknown or muted `play` makes no context either,
    // so the first sounding `play` stays the first after a user gesture.
    play(name) {
      const cue = muted ? undefined : CUES[name];
      if (!cue) return;
      const context = ensureContext();
      const when = context.currentTime;
      for (const note of cue.notes) {
        const osc = context.createOscillator();
        osc.type = cue.wave;
        osc.frequency.value = note;
        const gain = context.createGain();
        gain.gain.value = cue.gain;
        const param = gain.gain;
        if (typeof param.setValueAtTime === 'function') {
          // A short attack and an exponential release keep the edges of
          // each note from clicking.
          param.setValueAtTime(0, when);
          param.linearRampToValueAtTime(cue.gain, when + 0.005);
          param.exponentialRampToValueAtTime(0.001, when + cue.duration);
        }
        osc.connect(gain);
        gain.connect(context.destination);
        osc.start(when);
        osc.stop(when + cue.duration);
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
