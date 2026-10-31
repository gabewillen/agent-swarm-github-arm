// Input mapping and the input queue, DESIGN.md §12.
// Pure mapping and queue logic; only `attachKeyboard` touches an event
// target, and only the one it is given.

const MOVES = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
};

const PAUSES = { p: true, P: true, Escape: true };

// The largest swipe, in pixels, that still counts as a tap.
const SWIPE_MIN = 24;

export function keyToInput(key) {
  const move = MOVES[key];
  if (move) return { move, pause: false };
  if (PAUSES[key]) return { move: null, pause: true };
  return null;
}

export function swipeToInput(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < SWIPE_MIN && ay < SWIPE_MIN) return null;
  // A tie between the axes goes horizontal.
  const horizontal = ax >= ay;
  if (horizontal) return { move: dx > 0 ? 'right' : 'left', pause: false };
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

export const INPUT_QUEUE_MAX = 4;

export function queuePush(queue, input) {
  if (input == null) return queue;
  if (queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

export function queueTake(queue) {
  if (queue.length === 0) return { input: { move: null, pause: false }, queue: [] };
  return { input: queue[0], queue: queue.slice(1) };
}

// Listens for `keydown` on `target`; every key `keyToInput` maps is
// swallowed (`preventDefault`) and reported to `onInput`. Returns a
// function that removes the same listener.
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
