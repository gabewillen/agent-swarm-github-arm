// Input (DESIGN.md twelfth section): key and touch-swipe mapping, and the
// pure input queue. Nothing here touches the DOM on import;
// `attachKeyboard` uses only the event target it is given.

const MOVE_KEYS = {
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

// A swipe shorter than this many pixels, on both axes at once, is a tap.
const SWIPE_MIN = 24;

export function keyToInput(key) {
  const move = MOVE_KEYS[key];
  if (move) return { move, pause: false };
  if (PAUSE_KEYS.has(key)) return { move: null, pause: true };
  return null;
}

export function swipeToInput(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < SWIPE_MIN && ay < SWIPE_MIN) return null;
  // A tie goes horizontal. Beyond the null case above the larger axis is
  // never 0, so its sign decides.
  if (ax >= ay) return { move: dx > 0 ? 'right' : 'left', pause: false };
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

export const INPUT_QUEUE_MAX = 4;

export function queuePush(queue, input) {
  if (input == null || queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

export function queueTake(queue) {
  if (queue.length === 0) {
    return { input: { move: null, pause: false }, queue: [] };
  }
  return { input: queue[0], queue: queue.slice(1) };
}

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
