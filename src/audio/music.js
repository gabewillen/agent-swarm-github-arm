// Quorum Run's generative music (DESIGN.md §24).
//
// Background music is synthesized, never sampled. Every function here is
// a pure function of its arguments, so a bar is always the same bar, and
// scheduling touches only the AudioContext it is handed — importing this
// module constructs no context and touches no DOM.

export const SCALE = [0, 2, 3, 5, 7, 8, 10]; // the natural minor, in semitones
export const ROOT_HZ = 220; // the tonic, A3

// The pitch of a scale degree, in Hz. Degrees past 6 wrap into whole
// octave jumps (degree 7 is the octave above degree 0), and negative
// degrees reach down the same way, so the pattern code can walk freely
// in either direction.
export function noteHz(degree, octave = 0) {
  const step = ((degree % 7) + 7) % 7; // degree mod 7, never negative
  const jump = Math.floor(degree / 7); // whole octaves past the scale's end
  return ROOT_HZ * 2 ** ((SCALE[step] + 12 * (octave + jump)) / 12);
}

// The music speeds up as the run goes deeper, but only so much.
export function tempo(levelIndex) {
  return Math.min(160, 96 + 8 * levelIndex);
}

// A 32-bit mix (the mulberry32 turn of §3) turns level and bar numbers
// into pattern bits: unpredictable to the ear, exactly repeatable here.
function mix(n) {
  const t = (n + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return (r ^ (r >>> 14)) >>> 0;
}

// A degree folded back into the scale's span, 0 to 6.
const wrap = (degree) => ((degree % 7) + 7) % 7;

// One bar of music: 8 steps, each a rest (null) or a note { degree,
// octave } with the degree held to 0..6 and the octave to -1..1. Pure,
// and looping every 4 bars: bar(l, b) is bar(l, b + 4).
//
// Each level sits in its own key of the i–VI–III–VII four-bar loop. A
// bar anchors itself with a bass root on its first step and a fifth
// halfway through, and fills the rest from chord tones at the level's
// density, so no two bars bang out quite the same shape.
export function bar(levelIndex, barIndex) {
  const b = ((barIndex % 4) + 4) % 4;
  const h = mix((Math.imul(levelIndex + 1, 0x9E3779B1) ^ Math.imul(b + 1, 0x85EBCA6B)) >>> 0);
  const chords = [0, 5, 2, 6]; // i, VI, III, VII: the minor keys' usual walk
  const root = wrap(chords[b] + (h % 7));
  const density = 45 + (h % 41); // 45 to 85 percent of the free steps play
  const steps = [null, null, null, null, null, null, null, null];

  // The anchors: a bass root to open, a fifth on the offbeat halfway.
  steps[0] = { degree: root, octave: (h >>> 3) % 2 === 0 ? 0 : -1 };
  steps[4] = { degree: wrap(root + 4), octave: 0 };

  // Melodic steps off the anchors: chord tones usually, a passing tone
  // now and then, and a hop up or down an octave only sparingly.
  const tones = [0, 2, 4, 1, 3, 6];
  for (let i = 1; i < 8; i++) {
    if (i === 4) continue;
    const r = mix((h + i * 0x27D4EB2F) >>> 0);
    if (r % 100 >= density) continue;
    const degree = wrap(root + tones[(r >>> 2) % tones.length]);
    const hop = r % 12;
    steps[i] = { degree, octave: hop === 0 ? 1 : hop === 1 ? -1 : 0 };
  }

  // The loop's last bar reaches back to its root, so handing off to the
  // loop's first bar sounds like a resolution rather than a cut.
  if (b === 3) steps[7] = { degree: root, octave: 0 };

  // Every bar speaks at least three times: if the pattern drew out too
  // sparse, shore it up with quiet chord tones.
  if (steps.filter(Boolean).length < 3) {
    for (const [i, degree] of [[2, wrap(root + 4)], [6, wrap(root + 2)], [1, root], [3, root], [5, root], [7, root]]) {
      if (steps[i] !== null) continue;
      steps[i] = { degree, octave: 0 };
      break;
    }
  }
  return steps;
}

// Plays one bar of steps on an AudioContext: one triangle-wave
// oscillator per note, through one gain node, to the destination,
// starting on its step (a step is half a beat, 30 / bpm seconds) and
// stopping at most a step later. Rests schedule nothing.
export function scheduleBar(ctx, steps, startTime, bpm, gain) {
  const stepDur = 30 / bpm;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s === null) continue;
    const at = startTime + i * stepDur;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = noteHz(s.degree, s.octave);
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + stepDur);
  }
}
