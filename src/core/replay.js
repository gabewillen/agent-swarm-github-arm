// Replays (DESIGN.md §18). A replay is { seed, level, moves }: the init
// seed (as seed >>> 0), the starting level index, and one character per
// step — 'u', 'r', 'd', 'l' for a move, '.' for no move, 'p' for a pause
// input. encodeReplay run-length codes the moves into a 'QR1:' text and
// decodeReplay reads it back, refusing anything malformed. playReplay
// replays the moves from a fresh init and returns the final state.

import { init, step } from './game.js';

const CHAR_FOR_MOVE = { up: 'u', right: 'r', down: 'd', left: 'l' };
const MOVE_FOR_CHAR = { u: 'up', r: 'right', d: 'down', l: 'left' };
const IS_MOVE_CHAR = { u: true, r: true, d: true, l: true, '.': true, p: true };

export function charOf(input) {
  if (input && input.pause) return 'p';
  if (!input) return '.';
  return CHAR_FOR_MOVE[input.move] ?? '.';
}

export function inputOf(ch) {
  if (ch === 'p') return { move: null, pause: true };
  if (Object.hasOwn(MOVE_FOR_CHAR, ch)) return { move: MOVE_FOR_CHAR[ch], pause: false };
  return { move: null, pause: false };
}

export function recordReplay(seed, inputs, options) {
  const list = inputs ?? [];
  const chars = new Array(list.length);
  for (let i = 0; i < list.length; i++) chars[i] = charOf(list[i]);
  const level = options && options.level != null ? options.level : 0;
  return { seed: seed >>> 0, level, moves: chars.join('') };
}

function runsEncode(moves) {
  let out = '';
  let i = 0;
  while (i < moves.length) {
    let j = i;
    while (j < moves.length && moves[j] === moves[i]) j++;
    const run = j - i;
    out += run >= 2 ? String(run) + moves[i] : moves[i];
    i = j;
  }
  return out;
}

function runsDecode(moves) {
  let out = '';
  let i = 0;
  while (i < moves.length) {
    const ch = moves[i];
    if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < moves.length && moves[j] >= '0' && moves[j] <= '9') j++;
      const count = Number(moves.slice(i, j));
      if (count < 2) return null; // a count below 2
      if (j >= moves.length) return null; // a count with no character after it
      const run = moves[j];
      if (!IS_MOVE_CHAR[run]) return null; // an unknown character
      out += run.repeat(count);
      i = j + 1;
    } else {
      if (!IS_MOVE_CHAR[ch]) return null; // an unknown character
      out += ch;
      i++;
    }
  }
  return out;
}

export function encodeReplay(replay) {
  return 'QR1:' + replay.seed + ':' + replay.level + ':' + runsEncode(replay.moves);
}

export function decodeReplay(text) {
  if (typeof text !== 'string' || !text.startsWith('QR1:')) return null;
  const parts = text.slice(4).split(':');
  if (parts.length !== 3) return null;
  const [seedText, levelText, moves] = parts;
  if (!/^\d+$/.test(seedText) || !/^\d+$/.test(levelText)) return null;
  const seed = Number(seedText);
  if (seed > 4294967295) return null;
  const chars = runsDecode(moves);
  if (chars === null) return null;
  return { seed, level: Number(levelText), moves: chars };
}

export function playReplay(replay, levels) {
  const options = { level: replay.level };
  if (levels != null) options.levels = levels;
  let state = init(replay.seed, options);
  const moves = replay.moves ?? '';
  for (let i = 0; i < moves.length; i++) state = step(state, inputOf(moves[i]));
  return state;
}
