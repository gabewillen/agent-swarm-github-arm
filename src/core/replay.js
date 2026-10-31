// Replays (§18): record an `init` run as { seed, level, moves }, encode it
// as a run-length-coded text, decode it back, and play it through `step`.
// The rules module is loaded lazily so this module stays importable while
// `src/core/game.js` is still landing; only `playReplay` needs it.

const DIR_CHAR = new Map([
  ['up', 'u'],
  ['right', 'r'],
  ['down', 'd'],
  ['left', 'l'],
]);

const CHAR_DIR = new Map([
  ['u', 'up'],
  ['r', 'right'],
  ['d', 'down'],
  ['l', 'left'],
]);

// The characters a move run may hold: a count is a digit run in [2, ∞)
// followed by one of these; a bare literal stands for itself. (A count of
// the literal `.` is legal, so `3.` rewrites `...`.)
const LITERAL = new Set(['u', 'r', 'd', 'l', '.', 'p']);

const SEED_MAX = 4294967295;

let game = null;
try {
  game = await import('./game.js');
} catch {
  // The rules module is missing or does not load; playReplay will say so.
}

// charOf(input) gives an input's character: `u`, `r`, `d`, `l` for a move,
// `.` for no move, `p` for a pause. A pause wins over a move (step 2 of
// §6 ignores the move when pausing, so the two step the same). A missing
// or null input is `.`.
export function charOf(input) {
  if (input && typeof input === 'object') {
    if (input.pause) return 'p';
    return DIR_CHAR.get(input.move) || '.';
  }
  return '.';
}

// inputOf(ch) is the input back from a character.
export function inputOf(ch) {
  if (ch === 'p') return { move: null, pause: true };
  const move = CHAR_DIR.get(ch);
  if (move) return { move, pause: false };
  return { move: null, pause: false };
}

// recordReplay(seed, inputs, options) is the replay of playing `inputs`
// from `init(seed, options)`: the seed as `seed >>> 0`, the starting level
// index (`options.level`, default 0), and one character per input.
export function recordReplay(seed, inputs, options) {
  let moves = '';
  if (inputs) for (const input of inputs) moves += charOf(input);
  let level = 0;
  if (options && options.level !== undefined && options.level !== null) {
    level = options.level;
  }
  return { seed: seed >>> 0, level, moves };
}

// Run-length coding of the moves: a run of 2 or more equal characters is
// its count then the character (`uuu.r` is `3u.r`), a single one itself.
// Runs of 2 cost the same 2 characters, so the encoding never grows.
function compressMoves(moves) {
  let out = '';
  let i = 0;
  while (i < moves.length) {
    const ch = moves[i];
    let j = i + 1;
    while (j < moves.length && moves[j] === ch) j++;
    const n = j - i;
    out += n >= 2 ? n + ch : ch;
    i = j;
  }
  return out;
}

// encodeReplay(replay) is `QR1:<seed>:<level>:<moves>` with the moves
// run-length coded.
export function encodeReplay(replay) {
  const moves = replay && typeof replay.moves === 'string' ? replay.moves : '';
  return `QR1:${replay.seed}:${replay.level}:${compressMoves(moves)}`;
}

// A digit slice is a non-negative integer if it is all digits.
function isDigits(text) {
  return /^\d+$/.test(text);
}

// The inverse of compressMoves, or `null` for anything not well formed:
// an unknown character, a count with no character after it, a count
// below 2.
function expandMoves(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < text.length && text[j] >= '0' && text[j] <= '9') j++;
      if (j >= text.length || !LITERAL.has(text[j])) return null;
      const n = Number(text.slice(i, j));
      if (n < 2) return null;
      out += text[j].repeat(n);
      i = j + 1;
    } else if (LITERAL.has(ch)) {
      out += ch;
      i++;
    } else {
      return null;
    }
  }
  return out;
}

// decodeReplay(text) reverses encodeReplay, or `null` for anything that
// isn't a well-formed encoding: a wrong prefix, a seed or level that is
// not a non-negative integer, a seed above 4294967295, a bad moves run.
export function decodeReplay(text) {
  if (typeof text !== 'string') return null;
  const parts = text.split(':');
  if (parts.length !== 4 || parts[0] !== 'QR1') return null;
  if (!isDigits(parts[1]) || !isDigits(parts[2])) return null;
  const seed = Number(parts[1]);
  if (seed > SEED_MAX) return null;
  const level = Number(parts[2]);
  const moves = expandMoves(parts[3]);
  if (moves === null) return null;
  return { seed, level, moves };
}

// playReplay(replay, levels) steps every move from
// `init(replay.seed, { level: replay.level, levels })` and gives the final
// state (levels optional, as for init).
export function playReplay(replay, levels) {
  if (!game || typeof game.init !== 'function' || typeof game.step !== 'function') {
    throw new Error('replay: the rules module (src/core/game.js) is not loadable');
  }
  const { init, step } = game;
  const options = { level: replay.level };
  if (levels != null) options.levels = levels;
  let s = init(replay.seed, options);
  for (const ch of replay.moves) s = step(s, inputOf(ch));
  return s;
}
