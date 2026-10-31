// Replays (DESIGN.md §18): a recorded seed, level, and one character per
// step; encoded as run-length coded text.

import { init, step } from './game.js';

const MOVES = { u: 'up', r: 'right', d: 'down', l: 'left' };

// charOf(input) -> the one-character code: a pause wins over a move, a
// missing input is '.'.
export function charOf(input) {
  if (input && input.pause) return 'p';
  if (input && typeof input.move === 'string') {
    const first = input.move[0].toLowerCase();
    if (first === 'u' || first === 'r' || first === 'd' || first === 'l') return first;
  }
  return '.';
}

// inputOf(ch) -> the input back.
export function inputOf(ch) {
  if (ch === 'p') return { move: null, pause: true };
  const move = MOVES[ch];
  return { move: move ?? null, pause: false };
}

// recordReplay(seed, inputs, options) -> the replay of playing inputs.
export function recordReplay(seed, inputs, options) {
  const level = options && options.level !== undefined ? options.level : 0;
  return {
    seed: seed >>> 0,
    level,
    moves: inputs.map(charOf).join(''),
  };
}

// Run-length coding: a run of 2 or more equal characters is its count
// then the character; a single one stands alone.
function encodeMoves(moves) {
  let out = '';
  let i = 0;
  while (i < moves.length) {
    const ch = moves[i];
    let run = 1;
    while (i + run < moves.length && moves[i + run] === ch) run++;
    if (run >= 2) out += String(run) + ch;
    else out += ch;
    i += run;
  }
  return out;
}

// encodeReplay(replay) -> `QR1:<seed>:<level>:<moves>`.
export function encodeReplay(replay) {
  return `QR1:${replay.seed}:${replay.level}:${encodeMoves(replay.moves)}`;
}

function decodeMoves(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] >= '0' && text[i] <= '9') {
      let j = i;
      while (j < text.length && text[j] >= '0' && text[j] <= '9') j++;
      if (j >= text.length) return null; // a count with no character after it
      const count = Number(text.slice(i, j));
      const unit = text[j];
      if (!Object.prototype.hasOwnProperty.call(MOVES, unit) && unit !== '.' && unit !== 'p') return null;
      if (count < 2) return null;
      out += unit.repeat(count);
      i = j + 1;
    } else {
      const unit = text[i];
      if (!Object.prototype.hasOwnProperty.call(MOVES, unit) && unit !== '.' && unit !== 'p') return null;
      out += unit;
      i++;
    }
  }
  return out;
}

// decodeReplay(text) reverses encodeReplay; anything not well-formed is
// null.
export function decodeReplay(text) {
  if (typeof text !== 'string') return null;
  if (!text.startsWith('QR1:')) return null;
  const parts = text.split(':');
  if (parts.length !== 4) return null;
  const [, seedText, levelText, movesText] = parts;
  if (!/^[0-9]+$/.test(seedText)) return null;
  const seed = Number(seedText);
  if (seed > 4294967295) return null;
  if (!/^[0-9]+$/.test(levelText)) return null;
  const moves = decodeMoves(movesText);
  if (moves === null) return null;
  return { seed, level: Number(levelText), moves };
}

// playReplay(replay, levels) -> the final state of stepping every move.
export function playReplay(replay, levels) {
  const options = levels ? { level: replay.level, levels } : { level: replay.level };
  let s = init(replay.seed, options);
  for (const ch of replay.moves) s = step(s, inputOf(ch));
  return s;
}
