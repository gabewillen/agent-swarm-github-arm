// Replays (DESIGN.md §18). A replay is { seed, level, moves }: the init
// seed as seed >>> 0, the starting level index, and one character per step
// — 'u', 'r', 'd', 'l' for a move, '.' for no move, 'p' for a pause input.
import { init, step } from './game.js';

const CHARS = 'urdl.p';
const MOVE_OF = { u: 'up', r: 'right', d: 'down', l: 'left' };
const CHAR_OF = { up: 'u', right: 'r', down: 'd', left: 'l' };

// `charOf(input)` gives an input's character. A pause wins over a move; a
// missing input is '.'.
export function charOf(input) {
  if (input && input.pause) return 'p';
  const move = input ? input.move : null;
  return (move && CHAR_OF[move]) || '.';
}

// `inputOf(ch)` gives the input back.
export function inputOf(ch) {
  if (ch === 'p') return { move: null, pause: true };
  if (MOVE_OF[ch]) return { move: MOVE_OF[ch], pause: false };
  return { move: null, pause: false };
}

// `recordReplay(seed, inputs, options)` returns the replay of playing
// `inputs` from `init(seed, options)`; `options.level` defaults to 0.
export function recordReplay(seed, inputs, options) {
  const moves = [];
  for (let i = 0; i < (inputs ? inputs.length : 0); i++) moves.push(charOf(inputs[i]));
  return { seed: seed >>> 0, level: options && options.level !== undefined ? options.level : 0, moves: moves.join('') };
}

// `encodeReplay(replay)` returns `QR1:<seed>:<level>:<moves>`, the moves
// run-length coded: a run of 2 or more equal characters as its count then
// the character, a single one as itself.
export function encodeReplay(replay) {
  const moves = replay && replay.moves ? replay.moves : '';
  let coded = '';
  let run = 0;
  for (let i = 0; i < moves.length; i++) {
    if (i > 0 && moves[i] === moves[i - 1]) {
      run++;
      continue;
    }
    if (run >= 2) coded += String(run);
    if (run > 0) coded += moves[i - 1];
    run = 1;
  }
  if (run >= 2) coded += String(run);
  if (run > 0) coded += moves[moves.length - 1];
  return 'QR1:' + (replay ? replay.seed : 0) + ':' + ((replay && replay.level) || 0) + ':' + coded;
}

// `decodeReplay(text)` reverses `encodeReplay`, and returns null for
// anything that is not a well-formed encoding.
export function decodeReplay(text) {
  if (typeof text !== 'string') return null;
  const m = /^QR1:(\d+):(\d+):(.*)$/.exec(text);
  if (!m) return null;
  const seed = Number(m[1]);
  if (seed > 4294967295) return null;
  const moves = expandRuns(m[3]);
  if (moves === null) return null;
  return { seed, level: Number(m[2]), moves };
}

// Runs the moves field: a digit run is a count (>= 2) for the character
// that follows it; anything else must be a replay character.
function expandRuns(coded) {
  let moves = '';
  let i = 0;
  while (i < coded.length) {
    if (coded[i] >= '0' && coded[i] <= '9') {
      let j = i;
      while (j < coded.length && coded[j] >= '0' && coded[j] <= '9') j++;
      if (j >= coded.length) return null; // a count with no character after it
      const ch = coded[j];
      if (!CHARS.includes(ch)) return null;
      const count = Number(coded.slice(i, j));
      if (count < 2 || count > 16777216 || !Number.isSafeInteger(count)) return null;
      moves += ch.repeat(count);
      i = j + 1;
    } else {
      if (!CHARS.includes(coded[i])) return null;
      moves += coded[i];
      i++;
    }
  }
  return moves;
}

// `playReplay(replay, levels)` steps every character from
// `init(replay.seed, { level: replay.level, levels })` and returns the
// final state.
export function playReplay(replay, levels) {
  const options = { level: replay.level };
  if (levels !== undefined && levels !== null) options.levels = levels;
  let state = init(replay.seed, options);
  const moves = replay && replay.moves ? replay.moves : '';
  for (let i = 0; i < moves.length; i++) state = step(state, inputOf(moves[i]));
  return state;
}
