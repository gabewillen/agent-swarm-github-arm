// WebAudio synthesis (DESIGN.md §13): plays a named cue's notes as
// plain oscillators. No samples, no files. The AudioContext constructor
// is given in, never looked up here, and it is constructed only on the
// first play that actually makes a sound (browsers allow audio only
// after a user gesture).

import { CUES } from './cues.js';

export function createAudio(AudioContextCtor) {
  let ctx = null;
  let muted = false;

  return {
    // Play one cue by name. A known cue, when not muted, makes one
    // oscillator and one gain node per note, wired to the destination.
    // Muted, or for an unknown cue, it does nothing.
    play(name) {
      const cue = CUES[name];
      if (!cue || muted) return;
      if (!ctx) ctx = new AudioContextCtor();
      const t0 = ctx.currentTime;
      const count = cue.notes.length;
      // Notes are staggered a little so chords and fanfares read as
      // arpeggios; everything still ends within the cue's duration.
      const spacing = count > 1 ? Math.min(0.07, cue.duration / (count + 1)) : 0;
      cue.notes.forEach((hz, i) => {
        const at = t0 + i * spacing;
        const span = Math.max(0.04, cue.duration - i * spacing);
        const osc = ctx.createOscillator();
        osc.type = cue.wave;
        osc.frequency.value = hz;
        // A tiny attack and exponential release so notes don't click.
        const env = ctx.createGain();
        env.gain.value = 0.0001;
        env.gain.setValueAtTime(0.0001, at);
        env.gain.exponentialRampToValueAtTime(cue.gain, at + Math.min(0.02, span * 0.25));
        env.gain.exponentialRampToValueAtTime(0.0001, at + span);
        osc.connect(env);
        env.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + span);
      });
    },

    setMuted(value) {
      muted = !!value;
    },

    isMuted() {
      return muted;
    },
  };
}
