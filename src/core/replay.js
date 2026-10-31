// Quorum Run replays (DESIGN.md §18).
//
// A replay is { seed, level, moves }: the init seed (as seed >>> 0), the
// starting level index, and one character per step -- 'u', 'r', 'd', 'l'
// for a move, '.' for no move, 'p' for a pause input.
//
// Encodings are QR1:<seed>:<level>:<moves>, the moves run-length coded: a
// run of 2 or more equal characters is written as its count then the
// character, a single one as itself. Digits never appear as move
// characters, so the counts stand out.

const MOVE_CHARS = { up: 'u', right: 'r', down: 'd', left: 'l' };
const PREFIX = 'QR1:';

function isMoveChar(ch) {
  return ch === 'u' || ch === 'r' || ch === 'd' || ch === 'l'
    || ch === '.' || ch === 'p';
}

// An input's character: a pause wins over a move; a missing input is '.'.
export function charOf(input) {
  if (input == null) return '.';
  if (input.pause) return 'p';
  if (input.move == null) return '.';
  return MOVE_CHARS[input.move] || '.';
}

// The input back. Unknown characters decode to null.
export function inputOf(ch) {
  if (ch === 'u') return { move: 'up', pause: false };
  if (ch === 'r') return { move: 'right', pause: false };
  if (ch === 'd') return { move: 'down', pause: false };
  if (ch === 'l') return { move: 'left', pause: false };
  if (ch === 'p') return { move: null, pause: true };
  if (ch === '.') return { move: null, pause: false };
  return null;
}

// The replay of playing inputs from init(seed, options): options.level
// (default 0) is the replay's starting level. It reads the inputs only --
// playing them is playReplay's job, and both sides agree because step is
// pure.
export function recordReplay(seed, inputs, options) {
  const list = inputs == null ? [] : inputs;
  const level = options == null || options.level == null ? 0 : options.level;
  let moves = '';
  for (let i = 0; i < list.length; i++) moves += charOf(list[i]);
  return { seed: seed >>> 0, level, moves };
}

// QR1:<seed>:<level>:<moves>, the moves run-length coded.
export function encodeReplay(replay) {
  const moves = replay == null || replay.moves == null ? '' : replay.moves;
  let code = '';
  for (let i = 0; i < moves.length; ) {
    const ch = moves[i];
    let n = 1;
    while (i + n < moves.length && moves[i + n] === ch) n++;
    if (n > 1) code += String(n);
    code += ch;
    i += n;
  }
  return `${PREFIX}${replay.seed}:${replay.level}:${code}`;
}

// Reverses encodeReplay, or null for anything that isn't a well-formed
// encoding: a wrong prefix, a seed or level that is not a non-negative
// integer, a seed above 4294967295, an unknown character, a count with no
// character after it, or a count below 2.
export function decodeReplay(text) {
  if (typeof text !== 'string' || !text.startsWith(PREFIX)) return null;
  const body = text.slice(PREFIX.length);
  const first = body.indexOf(':');
  if (first < 0) return null;
  const second = body.indexOf(':', first + 1);
  if (second < 0) return null;
  const seedText = body.slice(0, first);
  const levelText = body.slice(first + 1, second);
  if (!/^[0-9]+$/.test(seedText) || !/^[0-9]+$/.test(levelText)) return null;
  const seed = Number(seedText);
  if (seed > 4294967295) return null;
  const coded = body.slice(second + 1);
  let moves = '';
  for (let i = 0; i < coded.length; ) {
    const ch = coded[i];
    if (isMoveChar(ch)) { moves += ch; i++; continue; }
    // Anything else is a count: one or more digits, then a move character.
    if (ch < '0' || ch > '9') return null;
    let j = i;
    while (j < coded.length && coded[j] >= '0' && coded[j] <= '9') j++;
    if (j >= coded.length) return null; // a count with no character after it
    const count = Number(coded.slice(i, j));
    if (count < 2) return null; // a count below 2
    const run = coded[j];
    if (!isMoveChar(run)) return null;
    for (let k = 0; k < count; k++) moves += run;
    i = j + 1;
  }
  return { seed, level: Number(levelText), moves };
}

// The final state of stepping every move of the replay from
// init(replay.seed, { level: replay.level, levels }).
export function playReplay(replay, levels) {
  const options = { level: replay == null || replay.level == null ? 0 : replay.level };
  if (levels !== undefined) options.levels = levels;
  let state = init(replay == null || replay.seed == null ? 0 : replay.seed, options);
  const moves = replay == null || replay.moves == null ? '' : replay.moves;
  for (let i = 0; i < moves.length; i++) state = step(state, inputOf(moves[i]));
  return state;
}
