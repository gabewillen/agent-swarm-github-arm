// Input: key and swipe mapping plus the queued input list (DESIGN.md §12).
// Pure apart from the listener that `attachKeyboard` installs on the event
// target it is given; nothing touches `window` or `document` on import.

// The keys the game listens for, mapped to an input. Anything else is `null`.
const KEY_MAP = new Map([
  ['ArrowUp', { move: 'up', pause: false }],
  ['w', { move: 'up', pause: false }],
  ['W', { move: 'up', pause: false }],
  ['ArrowDown', { move: 'down', pause: false }],
  ['s', { move: 'down', pause: false }],
  ['S', { move: 'down', pause: false }],
  ['ArrowLeft', { move: 'left', pause: false }],
  ['a', { move: 'left', pause: false }],
  ['A', { move: 'left', pause: false }],
  ['ArrowRight', { move: 'right', pause: false }],
  ['d', { move: 'right', pause: false }],
  ['D', { move: 'right', pause: false }],
  ['p', { move: null, pause: true }],
  ['P', { move: null, pause: true }],
  ['Escape', { move: null, pause: true }],
]);

// The distance (in pixels) a swipe must cover on an axis to count.
const SWIPE_MIN = 24;

// How many inputs the queue holds at most.
export const INPUT_QUEUE_MAX = 4;

export function keyToInput(key) {
  return KEY_MAP.get(key) ?? null;
}

export function swipeToInput(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < SWIPE_MIN && ay < SWIPE_MIN) return null;
  const horizontal = ax >= ay; // a tie goes horizontal
  if (horizontal) return { move: dx > 0 ? 'right' : 'left', pause: false };
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

export function queuePush(queue, input) {
  if (input == null || queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

export function queueTake(queue) {
  if (queue.length === 0) return { input: { move: null, pause: false }, queue: [] };
  return { input: queue[0], queue: queue.slice(1) };
}

export function attachKeyboard(target, onInput) {
  const handler = (event) => {
    const input = keyToInput(event.key);
    if (input) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      onInput(input);
    }
  };
  target.addEventListener('keydown', handler);
  return () => target.removeEventListener('keydown', handler);
}
