// Replays (DESIGN.md §18). A replay is { seed, level, moves }: the init
// seed (as seed >>> 0), the starting level index, and one character per
// step — u, r, d, l for a move, '.' for no move, 'p' for a pause input.
//
// encodeReplay writes 'QR1:<seed>:<level>:<moves>' with the moves
// run-length coded: a run of 2 or more equal characters is written as its
// count then the character, a single one as itself ('uuu.r' -> '3u.r').

// The step characters, in one string for membership checks.
const MOVE_CHARS = 'urdl.p';

// Playing a replay needs the rules of src/core/game.js, but everything
// else here stands alone. The import is taken defensively at module
// evaluation (top-level await in a try), so this module stays loadable —
// and record, encode, and decode keep working — while game.js is still
// being built. With it in hand, playReplay can stay synchronous.
let game = null;
try {
  game = await import('./game.js');
} catch {
  game = null;
}

// charOf(input): one input's step character (a pause wins over a move; a
// missing input is '.').
export function charOf(input) {
  if (input && input.pause) return 'p';
  switch (input ? input.move : null) {
    case 'up': return 'u';
    case 'right': return 'r';
    case 'down': return 'd';
    case 'left': return 'l';
    default: return '.';
  }
}

// inputOf(ch): the input back ({ move, pause }); anything unknown is a
// step with no move and no pause.
export function inputOf(ch) {
  switch (ch) {
    case 'u': return { move: 'up', pause: false };
    case 'r': return { move: 'right', pause: false };
    case 'd': return { move: 'down', pause: false };
    case 'l': return { move: 'left', pause: false };
    case 'p': return { move: null, pause: true };
    default: return { move: null, pause: false };
  }
}

// recordReplay(seed, inputs, options): the replay of playing inputs from
// init(seed, options) — options.level, default 0.
export function recordReplay(seed, inputs, options) {
  let moves = '';
  for (const input of inputs ?? []) moves += charOf(input);
  return {
    seed: seed >>> 0,
    level: options && options.level !== undefined ? options.level : 0,
    moves,
  };
}

// encodeReplay(replay): 'QR1:<seed>:<level>:<moves>', moves run-length
// coded.
export function encodeReplay(replay) {
  const moves = replay && typeof replay.moves === 'string' ? replay.moves : '';
  let coded = '';
  let i = 0;
  while (i < moves.length) {
    const ch = moves[i];
    let run = 1;
    while (i + run < moves.length && moves[i + run] === ch) run += 1;
    coded += run === 1 ? ch : String(run) + ch;
    i += run;
  }
  return `QR1:${replay.seed}:${replay.level}:${coded}`;
}

// decodeReplay(text): reverses encodeReplay, or null for anything that
// is not a well-formed encoding.
export function decodeReplay(text) {
  const m = typeof text === 'string'
    ? /^QR1:(\d+):(\d+):([\s\S]*)$/.exec(text)
    : null;
  if (!m) return null;
  const seed = Number(m[1]);
  if (seed > 0xffffffff) return null;
  const coded = m[3];
  let moves = '';
  let i = 0;
  while (i < coded.length) {
    if (coded[i] >= '0' && coded[i] <= '9') {
      let j = i;
      while (j < coded.length && coded[j] >= '0' && coded[j] <= '9') j += 1;
      const count = Number(coded.slice(i, j));
      const ch = coded[j];
      if (ch === undefined || count < 2 || !MOVE_CHARS.includes(ch)) return null;
      moves += ch.repeat(count);
      i = j + 1;
    } else {
      if (!MOVE_CHARS.includes(coded[i])) return null;
      moves += coded[i];
      i += 1;
    }
  }
  return { seed, level: Number(m[2]), moves };
}

// playReplay(replay, levels): the final state of stepping every move
// from init(replay.seed, { level: replay.level, levels }) — levels
// optional, as for init.
export function playReplay(replay, levels) {
  if (!game || typeof game.init !== 'function' || typeof game.step !== 'function') {
    throw new Error('replay: src/core/game.js is not loadable yet');
  }
  const options = { level: replay.level };
  if (levels !== undefined) options.levels = levels;
  let state = game.init(replay.seed, options);
  const moves = typeof replay.moves === 'string' ? replay.moves : '';
  for (const ch of moves) state = game.step(state, inputOf(ch));
  return state;
}
