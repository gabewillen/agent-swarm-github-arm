// Input (DESIGN.md §12): keyboard and swipe mapping, plus a tiny input
// queue. Pure apart from the event target handed to `attachKeyboard`.

// The inputs `step` understands. Shared, frozen objects: mapping is cheap
// and identical keys give identical inputs.
const MOVE = {
  up: Object.freeze({ move: 'up', pause: false }),
  right: Object.freeze({ move: 'right', pause: false }),
  down: Object.freeze({ move: 'down', pause: false }),
  left: Object.freeze({ move: 'left', pause: false }),
};

const PAUSE = Object.freeze({ move: null, pause: true });
const NO_INPUT = Object.freeze({ move: null, pause: false });

// The smallest swipe, in pixels, that counts. Below it both axes on their
// own are treated as null.
const SWIPE_MIN = 24;

// How many inputs the queue holds at most.
export const INPUT_QUEUE_MAX = 4;

// `keyToInput(key)` maps a KeyboardEvent.key to an input, or null.
export function keyToInput(key) {
  switch (key) {
    case 'ArrowUp': case 'w': case 'W': return MOVE.up;
    case 'ArrowDown': case 's': case 'S': return MOVE.down;
    case 'ArrowLeft': case 'a': case 'A': return MOVE.left;
    case 'ArrowRight': case 'd': case 'D': return MOVE.right;
    case 'p': case 'P': case 'Escape': return PAUSE;
    default: return null;
  }
}

// `swipeToInput(dx, dy)` maps a touch swipe in pixels to an input: null
// when both |dx| and |dy| are below SWIPE_MIN, else a move along the
// larger axis (a tie goes horizontal).
export function swipeToInput(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < SWIPE_MIN && ay < SWIPE_MIN) return null;
  if (ax >= ay) return { move: dx > 0 ? 'right' : 'left', pause: false };
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

// `queuePush(queue, input)` returns a new array with `input` appended, or
// the queue unchanged when it is full or `input` is null. Never changes
// its argument.
export function queuePush(queue, input) {
  if (input === null || input === undefined) return queue;
  if (queue.length >= INPUT_QUEUE_MAX) return queue;
  return queue.concat([input]);
}

// `queueTake(queue)` returns { input, queue }: the first input and the
// rest, or no input and an empty queue. Never changes its argument.
export function queueTake(queue) {
  if (queue.length === 0) return { input: NO_INPUT, queue: [] };
  return { input: queue[0], queue: queue.slice(1) };
}

// `attachKeyboard(target, onInput)` listens for keydown on `target`; a key
// `keyToInput` maps is preventDefaulted and reported. Returns a function
// that removes the same listener.
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
