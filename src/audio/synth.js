// DESIGN.md §13: WebAudio synthesis, no samples and no files.
// Nothing happens when this module is imported: the AudioContext constructor
// is the caller's, and the context is built on the first play that makes a
// sound, which browsers allow only after a user gesture.
import { CUES } from './cues.js';

const MIN_NOTE = 20;
const MAX_NOTE = 5000;
const MAX_DURATION = 2;
const SILENT = 0.0001;

function usable(cue) {
  return (
    cue &&
    Array.isArray(cue.notes) &&
    cue.notes.length > 0 &&
    cue.notes.every((n) => typeof n === 'number' && n >= MIN_NOTE && n <= MAX_NOTE)
  );
}

// createAudio(AudioContextCtor) -> { play(name), setMuted(muted), isMuted() }.
// `name` is one of CUES's keys (§13); anything else does nothing.
export function createAudio(AudioContextCtor) {
  let ctx = null;
  let muted = false;

  // Built lazily: a context made before a gesture never starts anyway, and
  // merely creating audio nodes would be a cost on a page nobody touched.
  function context() {
    if (ctx === null && typeof AudioContextCtor === 'function') {
      try {
        ctx = new AudioContextCtor();
      } catch {
        ctx = null;
      }
    }
    return ctx;
  }

  function envelope(gain, cue, start, end) {
    const g = gain.gain;
    const peak = Math.min(1, Math.max(SILENT, cue.gain));
    if (g && typeof g.setValueAtTime === 'function' && typeof g.linearRampToValueAtTime === 'function') {
      const attack = Math.min(0.01, (end - start) / 8);
      g.setValueAtTime(SILENT, start);
      g.linearRampToValueAtTime(peak, start + attack);
      g.linearRampToValueAtTime(SILENT, end);
      return;
    }
    if (g) g.value = peak;
  }

  function play(name) {
    if (muted) return;
    const cue = CUES[name];
    if (!usable(cue)) return;
    const audio = context();
    if (!audio) return;

    const duration = Math.min(MAX_DURATION, Math.max(0.01, Number(cue.duration) || 0.1));
    const spread = Number.isFinite(cue.spread) ? Math.max(0, cue.spread) : 0;
    const now = typeof audio.currentTime === 'number' ? audio.currentTime : 0;
    const wave = ['sine', 'square', 'triangle', 'sawtooth'].includes(cue.wave) ? cue.wave : 'sine';

    cue.notes.forEach((note, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = wave;
      osc.frequency.value = note;
      envelope(gain, cue, now + i * spread, now + i * spread + duration);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(now + i * spread);
      osc.stop(now + i * spread + duration);
    });
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
