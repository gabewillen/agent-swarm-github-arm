// Replays (DESIGN.md §18): a replay records the seed, the starting level
// index, and one character per step of input, so a game can be replayed
// exactly from `init`.

import { init, step } from './game.js';

const MOVE_CHARS = { u: 'up', r: 'right', d: 'down', l: 'left' };
const MOVE_TO_CHAR = { up: 'u', right: 'r', down: 'd', left: 'l' };

// charOf(input) gives an input's character: u, r, d, l for a move, p for a
// pause (a pause wins over a move), and . for a no-op or a missing input.
export function charOf(input) {
  if (input === null || input === undefined || typeof input !== 'object') return '.';
  if (input.pause === true) return 'p';
  const ch = MOVE_TO_CHAR[input.move];
  return ch === undefined ? '.' : ch;
}

// inputOf(ch) gives the input back: `{ move, pause }`.
export function inputOf(ch) {
  if (ch === 'p') return { move: null, pause: true };
  if (ch === '.') return { move: null, pause: false };
  const move = MOVE_CHARS[ch];
  if (move === undefined) return { move: null, pause: false };
  return { move, pause: false };
}

// recordReplay(seed, inputs, options) returns the replay of playing `inputs`
// from `init(seed, options)`: `{ seed, level, moves }`.
export function recordReplay(seed, inputs, options) {
  const level = options && options.level !== undefined ? options.level : 0;
  const list = inputs === null || inputs === undefined ? [] : inputs;
  return { seed: seed >>> 0, level, moves: list.map(charOf).join('') };
}

// encodeReplay(replay) returns `QR1:<seed>:<level>:<moves>` where a run of 2
// or more equal characters is written as its count then the character, and a
// single one as itself.
export function encodeReplay(replay) {
  const moves = replay.moves;
  let out = '';
  let i = 0;
  while (i < moves.length) {
    let j = i;
    while (j < moves.length && moves[j] === moves[i]) j++;
    const n = j - i;
    out += (n > 1 ? String(n) : '') + moves[i];
    i = j;
  }
  return `QR1:${replay.seed}:${replay.level}:${out}`;
}

const DIGITS = '0123456789';
const CHARS = 'urdl.p';

function isDigits(text) {
  for (let i = 0; i < text.length; i++) {
    if (!DIGITS.includes(text[i])) return false;
  }
  return true;
}

// decodeReplay(text) reverses encodeReplay; it returns null for anything
// that is not a well-formed encoding.
export function decodeReplay(text) {
  if (typeof text !== 'string') return null;
  let rest = text;
  if (rest.startsWith('QR1:')) rest = rest.slice(4);
  else return null;
  const first = rest.indexOf(':');
  if (first < 0) return null;
  const seedText = rest.slice(0, first);
  let tail = rest.slice(first + 1);
  const second = tail.indexOf(':');
  if (second < 0) return null;
  const levelText = tail.slice(0, second);
  const moves = tail.slice(second + 1);
  if (seedText.length === 0 || levelText.length === 0 || !isDigits(seedText) || !isDigits(levelText)) return null;
  const seed = Number(seedText);
  if (seed > 4294967295) return null;
  // Decode the run-length coded moves.
  let out = '';
  let i = 0;
  while (i < moves.length) {
    if (DIGITS.includes(moves[i])) {
      let j = i;
      while (j < moves.length && DIGITS.includes(moves[j])) j++;
      if (j >= moves.length) return null; // a count with no character after it
      const count = Number(moves.slice(i, j));
      if (count < 2) return null; // a count below 2
      const ch = moves[j];
      if (!CHARS.includes(ch)) return null;
      out += ch.repeat(count);
      i = j + 1;
    } else if (CHARS.includes(moves[i])) {
      out += moves[i];
      i++;
    } else {
      return null; // an unknown character
    }
  }
  return { seed, level: Number(levelText), moves: out };
}

// playReplay(replay, levels) returns the final state of stepping every move
// from `init(replay.seed, { level: replay.level, levels })`.
export function playReplay(replay, levels) {
  const options = { level: replay.level };
  if (levels !== undefined) options.levels = levels;
  let state = init(replay.seed, options);
  for (const ch of replay.moves) state = step(state, inputOf(ch));
  return state;
}
