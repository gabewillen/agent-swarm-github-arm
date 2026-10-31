// Replays (DESIGN.md 18): record a game as a seed, a starting level, and
// one character per step, run-length code it, and play it back.

import { init, step } from './game.js';

// Moves one way and the other.
const MOVE_CHARS = { up: 'u', right: 'r', down: 'd', left: 'l' };
const CHARS_TO_MOVES = { u: 'up', r: 'right', d: 'down', l: 'left' };

// The characters a move can be run-length coded with.
const MOVE_ALPHABET = 'urdl.p';

// Gives an input's character: u, r, d, or l for a move, p when it pauses
// (a pause wins over a move), '.' for a missing input.
export function charOf(input) {
  if (!input) return '.';
  if (input.pause) return 'p';
  return MOVE_CHARS[input.move] || '.';
}

// The input of a character, `{ move, pause }`. Unknown characters give null.
export function inputOf(ch) {
  if (ch === 'p') return { move: null, pause: true };
  if (ch === '.') return { move: null, pause: false };
  const move = CHARS_TO_MOVES[ch];
  return move ? { move, pause: false } : null;
}

// The replay of playing `inputs` from `init(seed, options)`:
// `{ seed, level, moves }` with one character per step.
export function recordReplay(seed, inputs, options) {
  const level = options && options.level > 0 ? options.level : 0;
  const moves = (inputs || []).map(charOf).join('');
  return { seed: seed >>> 0, level, moves };
}

// `QR1:<seed>:<level>:<moves>` with run-length coded moves: a run of 2 or
// more equal characters is written as its count then the character
// ('uuu.r' is '3u.r'), a single one as itself.
export function encodeReplay(replay) {
  const seed = replay && typeof replay.seed === 'number' ? replay.seed >>> 0 : 0;
  const level = replay && typeof replay.level === 'number' ? Math.max(0, Math.floor(replay.level)) : 0;
  const moves = replay && typeof replay.moves === 'string' ? replay.moves : '';
  let coded = '';
  let i = 0;
  while (i < moves.length) {
    const ch = moves[i];
    let run = 1;
    while (i + run < moves.length && moves[i + run] === ch) run++;
    coded += run > 1 ? `${run}${ch}` : ch;
    i += run;
  }
  return `QR1:${seed}:${level}:${coded}`;
}

// The digits of a non-negative integer string, else null.
const NON_NEGATIVE = /^\d+$/;

// Decodes an encodeReplay text; anything that isn't well formed gives null.
export function decodeReplay(text) {
  if (typeof text !== 'string' || !text.startsWith('QR1:')) return null;
  const parts = text.split(':');
  if (parts.length !== 4) return null;
  const [tag, seedText, levelText, coded] = parts;
  if (tag !== 'QR1') return null;
  if (!NON_NEGATIVE.test(seedText)) return null;
  const seed = Number(seedText);
  if (seed > 4294967295) return null;
  if (!NON_NEGATIVE.test(levelText)) return null;
  const level = Number(levelText);
  let moves = '';
  let i = 0;
  while (i < coded.length) {
    const ch = coded[i];
    if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < coded.length && coded[j] >= '0' && coded[j] <= '9') j++;
      if (j === coded.length) return null; // a count with no character after it
      const count = Number(coded.slice(i, j));
      if (count < 2) return null; // a single character is written as itself
      const run = coded[j];
      if (!MOVE_ALPHABET.includes(run)) return null;
      moves += run.repeat(count);
      i = j + 1;
    } else {
      if (!MOVE_ALPHABET.includes(ch)) return null;
      moves += ch;
      i += 1;
    }
  }
  return { seed, level, moves };
}

// The final state of stepping every move of a replay, from
// `init(replay.seed, { level: replay.level, levels })`.
export function playReplay(replay, levels) {
  const options = { level: replay && replay.level ? replay.level : 0 };
  if (levels) options.levels = levels;
  let s = init(replay ? replay.seed >>> 0 : 0, options);
  const moves = replay && typeof replay.moves === 'string' ? replay.moves : '';
  for (const ch of moves) {
    const input = inputOf(ch);
    if (input) s = step(s, input);
  }
  return s;
}
