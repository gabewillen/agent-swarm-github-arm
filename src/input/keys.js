// Input (DESIGN.md §12): keyboard and touch swipes become game inputs
// `{ move, pause }`, and a small queue holds the ones the loop has not
// consumed yet. Nothing here is Node-only and nothing imports the core, so
// the page and the tests can load this module on its own.

// How many inputs the queue may hold before `queuePush` drops one.
export const INPUT_QUEUE_MAX = 4;

// The smallest meaningful swipe, in pixels.
const SWIPE_MIN = 24;

// `KeyboardEvent.key` -> a game input. Movement and the pause toggle; every
// other key is left to the page (Enter and the menus' own keys, for one).
const KEY_MAP = {
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

const PAUSE_KEYS = ['p', 'P', 'Escape'];

const NO_MOVE = { move: null, pause: false };

/** One key as a game input, or `null` when it is not one of the game's. */
export function keyToInput(key) {
  if (typeof key !== 'string') return null;
  const move = KEY_MAP[key];
  if (move !== undefined) return { move, pause: false };
  if (PAUSE_KEYS.includes(key)) return { move: null, pause: true };
  return null;
}

/** A touch swipe in pixels as a game input, or `null` when too small. */
export function swipeToInput(dx, dy) {
  const x = Math.abs(dx);
  const y = Math.abs(dy);
  if (x < SWIPE_MIN && y < SWIPE_MIN) return null;
  // The larger axis wins; a tie swipes horizontally.
  if (x >= y) return { move: dx > 0 ? 'right' : 'left', pause: false };
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

/** `queue` with `input` at the end, or `queue` itself when full or empty. */
export function queuePush(queue, input) {
  if (!input) return queue;
  if (!queue || queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

/** The front input and the rest of the queue, or no move when it is empty. */
export function queueTake(queue) {
  if (!queue || queue.length === 0) return { input: { ...NO_MOVE }, queue: [] };
  return { input: queue[0], queue: queue.slice(1) };
}

/**
 * Listen for `keydown` on `target`, calling `onInput` for every key the game
 * claims and preventing its default (scrolling, the browser's own search).
 * Returns a function that removes that same listener.
 */
export function attachKeyboard(target, onInput) {
  const handler = (event) => {
    const input = keyToInput(event.key);
    if (input === null) return;
    event.preventDefault();
    onInput(input);
  };
  target.addEventListener('keydown', handler);
  return () => target.removeEventListener('keydown', handler);
}
