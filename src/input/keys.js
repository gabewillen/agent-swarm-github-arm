// Input mapping and the input queue (DESIGN.md §12).
//
// Pure DOM-free helpers plus one function that attaches a keydown listener
// to an event target it is given. No module state, nothing Node-only.

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

const PAUSE_KEYS = new Set(['p', 'P', 'Escape']);

// keyToInput(key) maps a KeyboardEvent.key to `{ move, pause }`, or null
// for a key the game does not use.
export function keyToInput(key) {
  if (MOVE_KEYS[key] !== undefined) {
    return { move: MOVE_KEYS[key], pause: false };
  }
  if (PAUSE_KEYS.has(key)) {
    return { move: null, pause: true };
  }
  return null;
}

// Minimum swipe length in pixels that counts as a move.
const SWIPE_MIN = 24;

// swipeToInput(dx, dy) maps a touch swipe in pixels: null when both axes
// are below SWIPE_MIN, else a move along the larger axis (a tie goes
// horizontal; dx > 0 is right, dy > 0 is down).
export function swipeToInput(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < SWIPE_MIN && ay < SWIPE_MIN) return null;
  let move = null;
  if (ax >= ay) {
    move = dx > 0 ? 'right' : 'left';
  } else {
    move = dy > 0 ? 'down' : 'up';
  }
  return { move, pause: false };
}

// The input queue holds at most this many inputs.
export const INPUT_QUEUE_MAX = 4;

// queuePush(queue, input) returns a new array with the input appended, or
// the queue unchanged when it is full or the input is null. Neither its
// argument nor the input is changed.
export function queuePush(queue, input) {
  if (input === null || input === undefined) return queue;
  if (queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

// queueTake(queue) returns `{ input, queue }`: the first input and the
// rest, or a no-move input and an empty queue for an empty queue. It never
// changes its argument.
export function queueTake(queue) {
  if (queue.length === 0) {
    return { input: { move: null, pause: false }, queue: [] };
  }
  return { input: queue[0], queue: queue.slice(1) };
}

// attachKeyboard(target, onInput) listens for keydown on the target. For a
// key that maps to an input it calls preventDefault() and onInput(input).
// It returns a function that removes the same listener.
export function attachKeyboard(target, onInput) {
  const handler = (event) => {
    const input = keyToInput(event.key);
    if (input !== null) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      onInput(input);
    }
  };
  target.addEventListener('keydown', handler);
  return function detach() {
    target.removeEventListener('keydown', handler);
  };
}
