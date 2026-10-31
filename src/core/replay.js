// Replays (DESIGN.md §18): record, encode, decode, and play back a game's
// inputs. The core is pure: no DOM, no clock, and no chance outside the
// state's seed.
import { init, step } from './game.js';

// A move's replay character, and back.
const MOVE_CHARS = { up: 'u', right: 'r', down: 'd', left: 'l' };
const MOVE_OF_CHAR = { u: 'up', r: 'right', d: 'down', l: 'left' };

// charOf(input) gives an input's character: a pause wins over a move; a
// missing input is '.'.
export function charOf(input) {
  if (input && input.pause) return 'p';
  if (input && input.move && input.move in MOVE_CHARS) return MOVE_CHARS[input.move];
  return '.';
}

// inputOf(ch) gives the input back: { move, pause }.
export function inputOf(ch) {
  if (ch === 'p') return { move: null, pause: true };
  const move = MOVE_OF_CHAR[ch];
  if (move) return { move, pause: false };
  return { move: null, pause: false };
}

// recordReplay(seed, inputs, options) plays inputs from init(seed, options)
// in spirit and returns the replay: the seed as `seed >>> 0`, the starting
// level index (options.level, default 0), and one character per input.
export function recordReplay(seed, inputs, options) {
  let moves = '';
  for (const input of inputs || []) moves += charOf(input);
  const level = options && options.level != null ? options.level : 0;
  return { seed: seed >>> 0, level, moves };
}

// encodeReplay(replay) returns 'QR1:<seed>:<level>:<moves>', the moves
// run-length coded: a run of two or more equal characters is its count then
// the character ('uuu.r' is '3u.r'), a single one as itself.
export function encodeReplay(replay) {
  const moves = replay && replay.moves ? replay.moves : '';
  let coded = '';
  let i = 0;
  while (i < moves.length) {
    let j = i;
    while (j < moves.length && moves[j] === moves[i]) j++;
    const run = j - i;
    coded += (run > 1 ? String(run) : '') + moves[i];
    i = j;
  }
  return 'QR1:' + replay.seed + ':' + replay.level + ':' + coded;
}

// A well-formed seed is a non-negative integer of at most 4294967295 and a
// level a non-negative integer, both written in plain digits.
function unsignedField(text) {
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

function isMoveChar(ch) {
  return ch in MOVE_OF_CHAR || ch === '.' || ch === 'p';
}

// decodeReplay(text) reverses encodeReplay and returns null for anything
// that isn't a well-formed encoding: a wrong prefix, a seed or level that
// is not a non-negative integer, a seed above 4294967295, an unknown
// character, a count with no character after it, or a count below 2.
export function decodeReplay(text) {
  if (typeof text !== 'string') return null;
  const parts = text.split(':');
  if (parts.length !== 4 || parts[0] !== 'QR1') return null;
  const seed = unsignedField(parts[1]);
  const level = unsignedField(parts[2]);
  if (seed === null || level === null || seed > 0xFFFFFFFF) return null;
  let moves = '';
  const coded = parts[3];
  let i = 0;
  while (i < coded.length) {
    const ch = coded[i];
    if (ch >= '0' && ch <= '9') {
      // A digit begins a decimal count, which needs a move character after
      // it and is at least 2.
      let j = i;
      while (j < coded.length && coded[j] >= '0' && coded[j] <= '9') j++;
      if (j >= coded.length || !isMoveChar(coded[j])) return null;
      const count = Number(coded.slice(i, j));
      if (count < 2) return null;
      moves += coded[j].repeat(count);
      i = j + 1;
    } else if (isMoveChar(ch)) {
      moves += ch;
      i += 1;
    } else {
      return null;
    }
  }
  return { seed, level, moves };
}

// playReplay(replay, levels) returns the final state of stepping every
// move from init(replay.seed, { level: replay.level, levels }), levels
// optional, as for init.
export function playReplay(replay, levels) {
  const options = { level: replay.level };
  if (levels !== undefined) options.levels = levels;
  let state = init(replay.seed, options);
  for (const ch of replay.moves) state = step(state, inputOf(ch));
  return state;
}
