// Quorum Run · src/input/keys.js
// Keyboard and touch input (DESIGN.md §12). Pure mappings plus a small
// immutable input queue; the only DOM-facing function is `attachKeyboard`,
// which uses the event target it is given.

const KEY_MOVES = new Map([
  ['ArrowUp', 'up'], ['w', 'up'], ['W', 'up'],
  ['ArrowDown', 'down'], ['s', 'down'], ['S', 'down'],
  ['ArrowLeft', 'left'], ['a', 'left'], ['A', 'left'],
  ['ArrowRight', 'right'], ['d', 'right'], ['D', 'right'],
]);

const PAUSE_KEYS = new Set(['p', 'P', 'Escape']);

// maps a KeyboardEvent.key: a move, a pause, or null for anything else.
export function keyToInput(key) {
  if (KEY_MOVES.has(key)) return { move: KEY_MOVES.get(key), pause: false };
  if (PAUSE_KEYS.has(key)) return { move: null, pause: true };
  return null;
}

// maps a touch swipe in pixels: null below 24 px on both axes, else a move
// along the larger axis, a tie going horizontal.
export function swipeToInput(dx, dy) {
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return { move: dx > 0 ? 'right' : 'left', pause: false };
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

export const INPUT_QUEUE_MAX = 4;

// returns a new queue with `input` appended, or the queue unchanged when it
// is full or `input` is null. Never changes its argument.
export function queuePush(queue, input) {
  if (input === null || queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

// returns { input, queue }: the first input and the rest, or no move and an
// empty queue when the queue is empty. Never changes its argument.
export function queueTake(queue) {
  if (queue.length === 0) return { input: { move: null, pause: false }, queue: [] };
  return { input: queue[0], queue: queue.slice(1) };
}

// listens for keydown on `target`: for a key that `keyToInput` maps it
// prevents the default and reports the input. Returns a detach function.
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
