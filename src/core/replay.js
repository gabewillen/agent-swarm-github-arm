// Quorum Run replays (DESIGN.md §18).
//
// A replay is `{ seed, level, moves }`: the `init` seed (as `seed >>> 0`), the
// starting level index, and one character per step — `u`, `r`, `d`, `l` for a
// move, `.` for no move, `p` for a pause input. `encodeReplay` writes it as
// `QR1:<seed>:<level>:<moves>` with run-length coded moves: a run of 2 or
// more equal characters becomes its count then the character, a single one
// stays itself. `decodeReplay` reverses it, and returns `null` for anything
// that is not a well-formed encoding. `playReplay` steps the recorded inputs
// through `init` and `step` and returns the final state.

import { init, step } from './game.js';

// A move's character.
const CHARS = {
  up: 'u',
  right: 'r',
  down: 'd',
  left: 'l',
};

// A character's move.
const MOVES = {
  u: 'up',
  r: 'right',
  d: 'down',
  l: 'left',
};

// Largest run a decoding expands. Encode never produces one this long (a
// real game takes a few hundred steps), so a longer count is a malformed or
// hostile encoding; expanding it could exhaust memory.
const MAX_TOTAL_MOVES = 10000000;

// An input's character: a pause wins over a move; a missing input is `.`.
export function charOf(input) {
  if (input && input.pause) return 'p';
  if (input && CHARS[input.move] !== undefined) return CHARS[input.move];
  return '.';
}

// A recorded character back to input `{ move, pause }`.
export function inputOf(ch) {
  if (ch === 'p') return { move: null, pause: true };
  return { move: MOVES[ch] ?? null, pause: false };
}

// The replay of playing `inputs` from `init(seed, options)`: the seed (as
// `seed >>> 0`), the starting level index (default 0), and one character per
// input, in order.
export function recordReplay(seed, inputs, options = {}) {
  const level = options && options.level != null ? options.level : 0;
  return {
    seed: (seed ?? 0) >>> 0,
    level: level >>> 0,
    moves: (inputs ?? []).map(charOf).join(''),
  };
}

// `QR1:<seed>:<level>:<moves>` with the moves run-length coded.
export function encodeReplay(replay) {
  const seed = replay && replay.seed != null ? replay.seed >>> 0 : 0;
  const level = replay && replay.level != null ? replay.level >>> 0 : 0;
  const moves = replay && typeof replay.moves === 'string' ? replay.moves : '';
  let text = '';
  let i = 0;
  while (i < moves.length) {
    const ch = moves[i];
    let n = 1;
    while (i + n < moves.length && moves[i + n] === ch) n += 1;
    text += n > 1 ? String(n) + ch : ch;
    i += n;
  }
  return 'QR1:' + seed + ':' + level + ':' + text;
}

// The replay of a well-formed encoding, or `null` for a wrong prefix, a seed
// or level that is not a non-negative integer, a seed above 4294967295, an
// unknown character, a count with no character after it, or a count below 2.
export function decodeReplay(text) {
  if (typeof text !== 'string') return null;
  const match = /^QR1:([^:]*):([^:]*):(.*)$/.exec(text);
  if (!match) return null;
  if (!/^\d+$/.test(match[1]) || !/^\d+$/.test(match[2])) return null;
  const seed = Number(match[1]);
  if (seed > 4294967295) return null;
  const level = Number(match[2]);
  let moves = '';
  let count = '';
  for (const ch of match[3]) {
    if (ch >= '0' && ch <= '9') {
      count += ch;
      continue;
    }
    if (!'urdl.p'.includes(ch)) return null;
    if (count !== '') {
      const n = Number(count);
      if (n < 2 || moves.length + n > MAX_TOTAL_MOVES) return null;
      moves += ch.repeat(n);
      count = '';
    } else {
      moves += ch;
    }
  }
  if (count !== '') return null;
  return { seed, level, moves };
}

// The final state of stepping every recorded move from
// `init(replay.seed, { level: replay.level, levels })` (`levels` optional,
// as for `init`).
export function playReplay(replay, levels) {
  const options = { level: replay.level };
  if (levels !== undefined) options.levels = levels;
  let s = init(replay.seed, options);
  for (const ch of replay.moves) s = step(s, inputOf(ch));
  return s;
}
