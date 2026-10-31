// Input (DESIGN.md §12): keyboard and touch to game inputs, and the queue
// the game loop drains one input per tick. Nothing here touches the DOM
// when imported; attachKeyboard works on a target it is given.

export const INPUT_QUEUE_MAX = 4;

const KEY_MAP = {
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  ArrowDown: 'down',
  s: 'down',
  S: 'down',
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
};

const PAUSE_KEYS = new Set(['p', 'P', 'Escape']);

const SWIPE_MIN = 24;

/** A KeyboardEvent.key as an input, or null when it does not move the game. */
export function keyToInput(key) {
  if (typeof key !== 'string') return null;
  const move = KEY_MAP[key];
  if (move) return { move, pause: false };
  if (PAUSE_KEYS.has(key)) return { move: null, pause: true };
  return null;
}

/** A touch swipe in pixels as an input, or null when it is too small. */
export function swipeToInput(dx, dy) {
  if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return null;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { move: dx > 0 ? 'right' : 'left', pause: false };
  }
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

/** A new queue with `input` at the end, or `queue` when there is no room. */
export function queuePush(queue, input) {
  if (input === null || input === undefined) return queue;
  if (!Array.isArray(queue)) return [copyInput(input)];
  if (queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, copyInput(input)];
}

/** The queue's first input and the rest, or no move for an empty queue. */
export function queueTake(queue) {
  if (!Array.isArray(queue) || queue.length === 0) {
    return { input: { move: null, pause: false }, queue: [] };
  }
  return { input: copyInput(queue[0]), queue: queue.slice(1) };
}

/** Listens for keydown on `target` and reports mapped keys; returns a detach. */
export function attachKeyboard(target, onInput) {
  const handler = (event) => {
    const input = keyToInput(event && event.key);
    if (!input) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof onInput === 'function') onInput(input);
  };
  target.addEventListener('keydown', handler);
  return () => target.removeEventListener('keydown', handler);
}

function copyInput(input) {
  return { move: normaliseMove(input.move), pause: input.pause === true };
}

function normaliseMove(move) {
  if (move === 'up' || move === 'right' || move === 'down' || move === 'left') return move;
  return null;
}
