// Input (§12): keyboard and touch swipes turned into game inputs, and the
// small queue the game loop pulls one input per tick from.

// One keydown maps to at most one input; unmapped keys are no input so
// their browser default (Tab, scrolling, dev tools) stays alive.
const MOVE_KEYS = new Map([
  ['ArrowUp', 'up'],
  ['ArrowDown', 'down'],
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
  ['w', 'up'],
  ['W', 'up'],
  ['s', 'down'],
  ['S', 'down'],
  ['a', 'left'],
  ['A', 'left'],
  ['d', 'right'],
  ['D', 'right'],
]);

const PAUSE_KEYS = new Set(['p', 'P', 'Escape']);

// A swipe shorter than this is a tap, not a move.
const SWIPE_MIN = 24;

// How many inputs are kept between ticks: at most a tick's worth of lag,
// and no longer than a corridor is wide.
export const INPUT_QUEUE_MAX = 4;

/** The input for a `KeyboardEvent.key`, or null when the key does nothing. */
export function keyToInput(key) {
  if (typeof key !== 'string') return null;
  if (PAUSE_KEYS.has(key)) return { move: null, pause: true };
  const move = MOVE_KEYS.get(key);
  if (move === undefined) return null;
  return { move, pause: false };
}

/** The input for a touch swipe of `dx, dy` pixels, or null for a small one. */
export function swipeToInput(dx, dy) {
  if (typeof dx !== 'number' || typeof dy !== 'number') return null;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return null;
  // The larger axis wins; a tie swipes horizontally.
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { move: dx > 0 ? 'right' : 'left', pause: false };
  }
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

/** A queue with `input` at the end, or `queue` itself when nothing is added. */
export function queuePush(queue, input) {
  if (input === null || input === undefined) return queue;
  if (!Array.isArray(queue)) return [input];
  if (queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

/** The next input to step with, and the queue left after it. */
export function queueTake(queue) {
  if (!Array.isArray(queue) || queue.length === 0) {
    return { input: { move: null, pause: false }, queue: [] };
  }
  const [input, ...rest] = queue;
  return { input: input ?? { move: null, pause: false }, queue: rest };
}

/**
 * Turn `target`'s keydowns into inputs handed to `onInput`. Returns the
 * function that stops listening again.
 */
export function attachKeyboard(target, onInput) {
  if (!target || typeof target.addEventListener !== 'function') {
    return () => {};
  }
  const handler = (event) => {
    const input = keyToInput(event && event.key);
    if (!input) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof onInput === 'function') onInput(input);
  };
  target.addEventListener('keydown', handler);
  return () => {
    if (typeof target.removeEventListener === 'function') {
      target.removeEventListener('keydown', handler);
    }
  };
}
