// Input (DESIGN.md §12): keyboard mapping, touch swipes, and the input
// queue. The queue functions are pure; `attachKeyboard` only touches the
// event target it is given.

export const INPUT_QUEUE_MAX = 4;

const KEY_MOVES = {
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

const PAUSE_KEYS = { p: true, P: true, Escape: true };

export function keyToInput(key) {
  const move = Object.prototype.hasOwnProperty.call(KEY_MOVES, key)
    ? KEY_MOVES[key]
    : null;
  if (move !== null) return { move, pause: false };
  if (Object.prototype.hasOwnProperty.call(PAUSE_KEYS, key)) {
    return { move: null, pause: true };
  }
  return null;
}

export function swipeToInput(dx, dy) {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx < 24 && ady < 24) return null;
  // A tie goes horizontal.
  let move;
  if (adx >= ady) move = dx > 0 ? 'right' : 'left';
  else move = dy > 0 ? 'down' : 'up';
  return { move, pause: false };
}

export function queuePush(queue, input) {
  if (input === null || queue.length >= INPUT_QUEUE_MAX) return queue;
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
    if (input !== null) {
      event.preventDefault();
      onInput(input);
    }
  };
  target.addEventListener('keydown', handler);
  return () => target.removeEventListener('keydown', handler);
}
