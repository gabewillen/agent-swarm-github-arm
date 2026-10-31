// Quorum Run — input (DESIGN.md §12).
//
// Keyboard mapping, touch swipes, and the pending-input queue. Every
// function here is pure and uses only what it is given: importing this
// module touches no DOM, no window, and no AudioContext.

// The input an unmapped key produces (§6: no move, no pause).
const NONE = Object.freeze({ move: null, pause: false });

// KeyboardEvent.key -> move direction.
const MOVE_KEYS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
};

// KeyboardEvent.key -> pause.
const PAUSE_KEYS = new Set(['p', 'P', 'Escape']);

// The smallest swipe, in pixels, that reads as a move.
const SWIPE_MIN = 24;

// Maps a KeyboardEvent.key to an input: a move, a pause, or null for a
// key the game ignores.
export function keyToInput(key) {
  if (PAUSE_KEYS.has(key)) return { move: null, pause: true };
  const move = MOVE_KEYS[key];
  if (move === undefined) return null;
  return { move, pause: false };
}

// Maps a touch swipe in pixels to a move: null when both |dx| and |dy|
// are below 24, else the larger axis wins and a tie goes horizontal.
export function swipeToInput(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < SWIPE_MIN && ay < SWIPE_MIN) return null;
  if (ax >= ay) return { move: dx > 0 ? 'right' : 'left', pause: false };
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

// The queue holds at most this many inputs.
export const INPUT_QUEUE_MAX = 4;

// Returns a new queue with the input appended, or the queue unchanged
// when it is full or the input is null. Never changes its argument.
export function queuePush(queue, input) {
  if (input === null) return queue;
  if (queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

// Takes the first input: { input, queue } with the rest, or no move and
// an empty queue for an empty queue. Never changes its argument.
export function queueTake(queue) {
  if (queue.length === 0) return { input: NONE, queue: [] };
  return { input: queue[0], queue: queue.slice(1) };
}

// Listens for keydown on the target, preventDefaults and reports every
// mapped key through onInput. Returns a function that removes the
// listener again.
export function attachKeyboard(target, onInput) {
  const handler = (event) => {
    const input = keyToInput(event.key);
    if (input) {
      event.preventDefault();
      onInput(input);
    }
  };
  target.addEventListener('keydown', handler);
  return () => target.removeEventListener('keydown', handler);
}
