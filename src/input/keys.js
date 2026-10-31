// Input, DESIGN.md §12: keyboard and touch mapping, and a small queue of
// pending inputs. Pure except attachKeyboard, which uses the event target
// it is given (§1: only functions may touch objects they are handed).

// KeyboardEvent.key -> move direction.
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

// A swipe shorter than this, along both axes, is a tap, not a move.
const SWIPE_MIN = 24;

export const INPUT_QUEUE_MAX = 4;

// keyToInput(key) maps a KeyboardEvent.key to an input, or null.
export function keyToInput(key) {
  if (PAUSE_KEYS.has(key)) return { move: null, pause: true };
  const move = MOVE_KEYS[key];
  if (move === undefined) return null;
  return { move, pause: false };
}

// swipeToInput(dx, dy) maps a touch swipe in pixels: null below the
// threshold on both axes, else a move along the larger axis (a tie goes
// horizontal).
export function swipeToInput(dx, dy) {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx < SWIPE_MIN && ady < SWIPE_MIN) return null;
  if (adx >= ady) return { move: dx > 0 ? 'right' : 'left', pause: false };
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

// queuePush returns a new queue with input appended, or the queue itself
// when it is full or the input is null. Neither argument changes.
export function queuePush(queue, input) {
  if (input === null || input === undefined) return queue;
  if (queue.length >= INPUT_QUEUE_MAX) return queue;
  const next = queue.slice();
  next.push(input);
  return next;
}

// queueTake returns the queue's first input and the rest; an empty queue
// takes no move.
export function queueTake(queue) {
  if (queue.length === 0) return { input: { move: null, pause: false }, queue: [] };
  return { input: queue[0], queue: queue.slice(1) };
}

// attachKeyboard listens for keydown on target; a key that keyToInput
// maps is prevented from scrolling and handed to onInput. The return
// value removes that same listener.
export function attachKeyboard(target, onInput) {
  const handler = (event) => {
    const input = keyToInput(event.key);
    if (input) {
      event.preventDefault();
      onInput(input);
    }
  };
  target.addEventListener('keydown', handler);
  return () => {
    target.removeEventListener('keydown', handler);
  };
}
