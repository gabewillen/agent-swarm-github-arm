// §18 Replays. A replay is { seed, level, moves }: the init seed (as
// seed >>> 0), the starting level index, and one character per step:
// 'u', 'r', 'd', 'l' for a move, '.' for no move, 'p' for a pause input.
import { init, step } from './game.js';

const MOVE_TO_CHAR = { up: 'u', right: 'r', down: 'd', left: 'l' };
const CHAR_TO_MOVE = { u: 'up', r: 'right', d: 'down', l: 'left' };
const MOVE_CHARS = 'urdl.p';

// A pause wins over a move; a missing input is '.'.
export function charOf(input) {
  if (input && input.pause) return 'p';
  const move = input && input.move;
  return MOVE_TO_CHAR[move] || '.';
}

// The inverse of charOf. An unknown character makes no input.
export function inputOf(ch) {
  if (ch === 'p') return { move: null, pause: true };
  if (ch === '.') return { move: null, pause: false };
  const move = CHAR_TO_MOVE[ch];
  return move ? { move, pause: false } : null;
}

// The replay of playing `inputs` from init(seed, options).
export function recordReplay(seed, inputs, options) {
  const level =
    options && options.level !== undefined && options.level !== null
      ? options.level
      : 0;
  return { seed: seed >>> 0, level, moves: inputs.map(charOf).join('') };
}

// Run-length code the moves: a run of 2 or more equal characters is
// written as its count then the character, a single one as itself.
function runLength(moves) {
  let out = '';
  let i = 0;
  while (i < moves.length) {
    let j = i;
    while (j < moves.length && moves[j] === moves[i]) j++;
    const run = j - i;
    if (run > 1) out += String(run) + moves[i];
    else out += moves[i];
    i = j;
  }
  return out;
}

export function encodeReplay(replay) {
  return `QR1:${replay.seed}:${replay.level}:${runLength(replay.moves)}`;
}

// The inverse of runLength. Returns null for anything that is not a
// well-formed run-length coding: an unknown character, a count with no
// character after it, a count below 2. Count after digit-run is the run
// count; abnormally large counts make no real replay, so past a limit
// they are rejected too rather than blowing up the whole decode.
const RUN_LIMIT = 1000000;

function decodeMoves(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < text.length && text[j] >= '0' && text[j] <= '9') j++;
      const count = Number(text.slice(i, j));
      if (j >= text.length) return null; // a count with no character after it
      const run = text[j];
      i = j + 1;
      if (MOVE_CHARS.indexOf(run) < 0) return null; // an unknown character
      if (count < 2) return null; // a count below 2
      if (count > RUN_LIMIT) return null; // no real replay runs this long
      out += run.repeat(count);
    } else {
      if (MOVE_CHARS.indexOf(ch) < 0) return null; // an unknown character
      out += ch;
      i += 1;
    }
  }
  return out;
}

export function decodeReplay(text) {
  if (typeof text !== 'string') return null;
  const fields = text.split(':');
  if (fields.length !== 4 || fields[0] !== 'QR1') return null;
  if (!/^[0-9]+$/.test(fields[1]) || !/^[0-9]+$/.test(fields[2])) return null;
  const seed = Number(fields[1]);
  if (seed > 4294967295) return null; // the seed is a 32-bit unsigned state
  const level = Number(fields[2]);
  const moves = decodeMoves(fields[3]);
  if (moves === null) return null;
  return { seed, level, moves };
}

// The final state of stepping every move of a replay.
export function playReplay(replay, levels) {
  let state = init(replay.seed, { level: replay.level, levels });
  for (const ch of replay.moves) {
    const input = inputOf(ch);
    if (!input) return null;
    state = step(state, input);
  }
  return state;
}
