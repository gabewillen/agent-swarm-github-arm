// §13 — WebAudio synthesis, no samples. createAudio takes the
// AudioContext constructor (never the global one) and builds the context
// only on the first play that makes a sound: browsers allow audio only
// after a user gesture, and importing this module must touch nothing.
import { CUES } from './cues.js';

// Seconds between a cue's notes; a cue not listed plays as one chord.
const SPREAD = { blip: 0.05, fanfare: 0.09, sweep: 0.1, scatter: 0.07, dirge: 0.17 };

export function createAudio(AudioContextCtor) {
  let ctx = null;
  let muted = false;

  function play(name) {
    if (muted || !AudioContextCtor) return;
    const cue = CUES[name];
    if (!cue) return;
    if (!ctx) {
      ctx = new AudioContextCtor();
      // A context made during a gesture still often starts suspended;
      // politely ask it to run. Nothing happens when the host has no
      // resume at all (the tests' fake contexts, older WebAudio shims).
      if (typeof ctx.resume === 'function') ctx.resume();
    }
    const t0 = ctx.currentTime;
    const spread = SPREAD[name] || 0;
    cue.notes.forEach((note, i) => {
      const at = t0 + i * spread;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = cue.wave;
      osc.frequency.value = note;
      // A few milliseconds of attack and a linear release keep every
      // note from clicking at its edges.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(cue.gain, at + 0.005);
      gain.gain.linearRampToValueAtTime(0.0001, at + cue.duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + cue.duration);
    });
  }

  function setMuted(next) {
    muted = !!next;
  }

  function isMuted() {
    return muted;
  }

  return { play, setMuted, isMuted };
}
