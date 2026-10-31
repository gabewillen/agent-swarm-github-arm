// §13 — WebAudio synthesis: every sound is made from oscillators, gain nodes,
// and nothing else. The AudioContext is constructed lazily, on the first play
// that makes a sound, because browsers allow audio only after a user gesture.

import { CUES } from './cues.js';

// A small stagger between a cue's notes so chords read as arpeggios.
const STAGGER = 0.03;

export function createAudio(AudioContextCtor) {
  let ctx = null;
  let muted = false;

  function play(name) {
    if (muted) return;
    const cue = CUES[name];
    if (!cue) return;
    if (!ctx) ctx = new AudioContextCtor();
    let when = ctx.currentTime || 0;
    for (const note of cue.notes) {
      const oscillator = ctx.createOscillator();
      oscillator.type = cue.wave;
      oscillator.frequency.value = note;
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(when);
      oscillator.stop(when + cue.duration);
      when += STAGGER;
    }
  }

  return {
    play,
    setMuted(value) {
      muted = !!value;
    },
    isMuted() {
      return muted;
    },
  };
}
