import { bar, noteHz, tempo, scheduleBar } from '../src/audio/music.js';
const tunes = new Map();
for (let l = 0; l < 16; l++) {
  const t = JSON.stringify([0, 1, 2, 3].map((b) => bar(l, b)));
  if (tunes.has(l)) {}
  tunes.set(t, (tunes.get(t) || 0) + 1);
  for (const s of bar(l, 0)) if (s) { if (s.degree < 0 || s.degree > 6) throw new Error('degree'); if (s.octave < -1 || s.octave > 1) throw new Error('octave'); const f = noteHz(s.degree, s.octave); if (!Number.isFinite(f) || f < 20 || f > 5000) throw new Error('freq ' + f); }
  for (let b = 0; b < 8; b++) { const x = bar(l, b), y = bar(l, b + 4); if (JSON.stringify(x) !== JSON.stringify(y)) throw new Error('loop ' + l + ' ' + b); }
}
console.log('distinct 4-bar loops over 16 levels:', tunes.size, '/16');
const notesPerBar = [];
for (let l = 0; l < 10; l++) for (let b = 0; b < 4; b++) notesPerBar.push(bar(l, b).filter(Boolean).length);
console.log('notes per bar min/max:', Math.min(...notesPerBar), Math.max(...notesPerBar));
console.log('tempo', [0, 1, 8, 20].map(tempo).join(' '));
const starts = [];
const ctx = { destination: { name: 'd' }, createOscillator: () => ({ frequency: { value: 0 }, start: (t) => starts.push(t), stop: () => {}, connect: () => {} }), createGain: () => ({ gain: { value: 1 }, connect: () => {} }) };
scheduleBar(ctx, bar(1, 0), 0, tempo(1), 0.2);
console.log('bar 1 starts:', starts.map((t) => +t.toFixed(3)).join(' '));
