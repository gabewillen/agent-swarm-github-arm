// Quorum Run — input (DESIGN.md §12).
//
// Pure helpers that turn keyboard events and touch swipes into game
// inputs, plus a small input queue and a keyboard adapter that attaches
// to whatever event target the page hands it. Nothing here touches the
// DOM or `window` directly: `attachKeyboard` only uses the target it is
// given, so the module stays loadable outside a browser.

// The input an empty queue takes: a no-move, non-pause step.
const NO_INPUT = Object.freeze({ move: null, pause: false });

export const INPUT_QUEUE_MAX = 4;

// Lookup tables built on `Object.create(null)` so no inherited property
// (say, 'constructor', 'toString', 'name') can ever look mapped: a key
// `keyToInput` does not list must map to null.
const MOVES = Object.create(null);
MOVES.ArrowUp = 'up';
MOVES.ArrowDown = 'down';
MOVES.ArrowLeft = 'left';
MOVES.ArrowRight = 'right';
MOVES.w = 'up';
MOVES.W = 'up';
MOVES.a = 'left';
MOVES.A = 'left';
MOVES.s = 'down';
MOVES.S = 'down';
MOVES.d = 'right';
MOVES.D = 'right';

const PAUSES = Object.create(null);
PAUSES.p = true;
PAUSES.P = true;
PAUSES.Escape = true;

// A swipe must travel at least this many pixels to count as a move.
const SWIPE_MIN_PX = 24;

// Map a `KeyboardEvent.key` to a game input ({ move, pause }) and return
// null for anything it does not own.
export function keyToInput(key) {
  if (typeof key !== 'string') return null;
  if (MOVES[key]) return { move: MOVES[key], pause: false };
  if (PAUSES[key]) return { move: null, pause: true };
  return null;
}

// Map a touch swipe in pixels to a game input, or null when both axes
// are below the swipe threshold. The move runs along the axis with the
// larger travelled distance; an exact tie goes horizontal. Screen
// coordinates grow rightwards and downwards: a positive dx moves right
// and a positive dy moves down.
export function swipeToInput(dx, dy) {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx < SWIPE_MIN_PX && ady < SWIPE_MIN_PX) return null;
  if (adx >= ady) return { move: dx > 0 ? 'right' : 'left', pause: false };
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

// Return a new queue with `input` appended, without changing `queue`.
// Appending happens only while the queue holds fewer than
// INPUT_QUEUE_MAX entries; null inputs (and a full queue) return the
// queue unchanged, so no caller shares state with a pending input.
export function queuePush(queue, input) {
  if (input === null || input === undefined) return queue;
  if (queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

// Take the first input off a queue: `{ input, queue }` with the oldest
// input and the rest of the queue. An empty queue yields no input and an
// empty queue. Neither argument changes.
export function queueTake(queue) {
  if (queue.length === 0) return { input: NO_INPUT, queue: [] };
  return { input: queue[0], queue: queue.slice(1) };
}

// Listen for `keydown` on `target` and hand every mapped key to `onInput`
// as a game input, calling `event.preventDefault()` so the browser's own
// behaviour (scrolling on arrows, quick-find on '/'-like keys) stays out
// of the way. Unmapped keys are ignored completely. Returns a function
// that removes the same listener.
export function attachKeyboard(target, onInput) {
  const handler = (event) => {
    const input = keyToInput(event.key);
    if (input === null) return;
    event.preventDefault();
    onInput(input);
  };
  target.addEventListener('keydown', handler);
  return function detach() {
    target.removeEventListener('keydown', handler);
  };
}
