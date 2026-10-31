// Replays (§18): a game is `{ seed, level, moves }` — the `init` seed as
// `seed >>> 0`, the starting level index, and one character per step:
// `u` `r` `d` `l` for a move, `.` for no move, `p` for a pause input.
// Recorded moves run-length encode into `QR1:<seed>:<level>:<moves>` text
// and replay deterministically through the game core.

// The game core (src/core/game.js) is the rules engine; loading it is
// tolerant so this module stands alone while the core lands. Everything
// here works without it except `playReplay`, which throws until the core
// loads. The import is relative and names its file (§1).
let game = null;
try {
  game = await import('./game.js');
} catch {
  game = null;
}

// A move name and its replay character, and back.
const MOVE_CHARS = { up: 'u', right: 'r', down: 'd', left: 'l' };
const CHARS_MOVE = { u: 'up', r: 'right', d: 'down', l: 'left' };

const MOVE_CHAR_RE = /^[urdl.p]$/;
const DIGITS_RE = /^\d+$/;
const MAX_SEED = 4294967295;

// An input's character: a pause wins over a move; a missing input is `.`.
export function charOf(input) {
  if (input && input.pause) return 'p';
  if (input && MOVE_CHARS[input.move]) return MOVE_CHARS[input.move];
  return '.';
}

// The character's input, or `null` for a character a replay can't hold.
export function inputOf(ch) {
  if (ch === 'p') return { move: null, pause: true };
  if (ch === '.') return { move: null, pause: false };
  if (CHARS_MOVE[ch]) return { move: CHARS_MOVE[ch], pause: false };
  return null;
}

// The replay of playing `inputs` from `init(seed, options)`.
export function recordReplay(seed, inputs, options) {
  return {
    seed: seed >>> 0,
    level: (options && options.level) ?? 0,
    moves: inputs.map(charOf).join(''),
  };
}

// Run-length code the moves: a run of 2 or more equal characters is its
// count then the character; a single one is itself.
function runLength(moves) {
  let text = '';
  let i = 0;
  while (i < moves.length) {
    const ch = moves[i];
    let j = i + 1;
    while (j < moves.length && moves[j] === ch) j++;
    text += (j - i > 1 ? String(j - i) : '') + ch;
    i = j;
  }
  return text;
}

// Expand run-length coded moves, or `null` for malformed text: an unknown
// character, a count with no character after it, or a count below 2.
function runLengthExpand(text) {
  let moves = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch >= '0' && ch <= '9') {
      let j = i + 1;
      while (j < text.length && text[j] >= '0' && text[j] <= '9') j++;
      if (j >= text.length) return null; // a count with no character after it
      const count = Number(text.slice(i, j));
      if (count < 2) return null; // a count below 2
      if (!MOVE_CHAR_RE.test(text[j])) return null;
      moves += text[j].repeat(count);
      i = j + 1;
    } else {
      if (!MOVE_CHAR_RE.test(ch)) return null;
      moves += ch;
      i++;
    }
  }
  return moves;
}

// A non-negative integer written in decimal digits, or `null`.
function parseUint(text, max) {
  if (!DIGITS_RE.test(text)) return null;
  const value = Number(text);
  if (!Number.isInteger(value)) return null;
  if (value > max) return null;
  return value;
}

export function encodeReplay(replay) {
  return `QR1:${replay.seed >>> 0}:${replay.level}:${runLength(replay.moves)}`;
}

// Reverse `encodeReplay`, or `null` for anything that isn't a well-formed
// encoding: a wrong prefix, a seed or level that isn't a non-negative
// integer, a seed above 4294967295, or bad moves.
export function decodeReplay(text) {
  if (typeof text !== 'string' || !text.startsWith('QR1:')) return null;
  const parts = text.split(':');
  if (parts.length !== 4) return null;
  const seed = parseUint(parts[1], MAX_SEED);
  if (seed === null) return null;
  const level = parseUint(parts[2], Infinity);
  if (level === null) return null;
  const moves = runLengthExpand(parts[3]);
  if (moves === null) return null;
  return { seed, level, moves };
}

// The final state of playing a replay: every move, stepped through the
// game core from `init(replay.seed, { level: replay.level, levels })`.
export function playReplay(replay, levels) {
  if (!game || !game.init || !game.step) {
    throw new Error('replay: the game core (src/core/game.js) has not loaded yet');
  }
  const { init, step } = game;
  const options = levels === undefined
    ? { level: replay.level }
    : { level: replay.level, levels };
  let state = init(replay.seed, options);
  for (const ch of replay.moves) {
    const input = inputOf(ch);
    if (input) state = step(state, input);
  }
  return state;
}
