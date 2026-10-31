// §18 Replays: a seeded, level-tagged move list and its RLE text form.
// Moves are one character per step: u, r, d, l, or . for no move, and a
// pause input wins over a move. Encodings are `QR1:<seed>:<level>:<moves>`
// with runs of 2 or more equal characters counted.

import { init, step } from './game.js';

const CHARS_OF = { up: 'u', right: 'r', down: 'd', left: 'l' };
const MOVES_OF = { u: 'up', r: 'right', d: 'down', l: 'left' };
const MOVE_CHARS = new Set(['u', 'r', 'd', 'l', '.', 'p']);

export function charOf(input) {
  if (!input || typeof input !== 'object') return '.';
  if (input.pause === true) return 'p';
  return CHARS_OF[input.move] ?? '.';
}

export function inputOf(ch) {
  const move = MOVE_CHARS.has(ch) && ch !== '.' && ch !== 'p' ? MOVES_OF[ch] : null;
  return { move, pause: ch === 'p' };
}

export function recordReplay(seed, inputs, options) {
  const inputs_ = Array.isArray(inputs) ? inputs : [];
  return {
    seed: seed >>> 0,
    level: options && typeof options === 'object' ? options.level : 0,
    moves: inputs_.map(charOf).join(''),
  };
}

export function encodeReplay(replay) {
  const moves = replay && typeof replay.moves === 'string' ? replay.moves : '';
  const seed = replay ? replay.seed >>> 0 : 0;
  const level = replay?.level ?? 0;
  let coded = '';
  let i = 0;
  while (i < moves.length) {
    const ch = moves[i];
    let run = 1;
    while (i + run < moves.length && moves[i + run] === ch) run++;
    coded += (run >= 2 ? String(run) : '') + ch;
    i += run;
  }
  return `QR1:${seed}:${level}:${coded}`;
}

export function decodeReplay(text) {
  if (typeof text !== 'string' || !text.startsWith('QR1:')) return null;
  const parts = text.slice(4).split(':');
  if (parts.length !== 3) return null;
  const [seedText, levelText, movesText] = parts;
  if (!/^\d+$/.test(seedText) || !/^\d+$/.test(levelText)) return null;
  const seed = Number(seedText);
  if (seed > 4294967295) return null;
  const level = Number(levelText);
  let moves = '';
  let i = 0;
  while (i < movesText.length) {
    let j = i;
    while (j < movesText.length && movesText[j] >= '0' && movesText[j] <= '9') j++;
    if (j > i) {
      if (j === movesText.length) return null;
      const count = Number(movesText.slice(i, j));
      const ch = movesText[j];
      if (count < 2 || !MOVE_CHARS.has(ch)) return null;
      moves += ch.repeat(count);
      i = j + 1;
    } else {
      if (!MOVE_CHARS.has(movesText[i])) return null;
      moves += movesText[i];
      i += 1;
    }
  }
  return { seed, level, moves };
}

export function playReplay(replay, levels) {
  const seed = replay.seed >>> 0;
  const level = replay.level;
  const options = { level };
  if (levels !== undefined) options.levels = levels;
  let state = init(seed, options);
  for (const ch of replay.moves) state = step(state, inputOf(ch));
  return state;
}
