// Input (DESIGN.md §12): keyboard and swipe mapping plus a small input
// queue. Pure functions; the only DOM access is through the event target
// that attachKeyboard is given.

export const INPUT_QUEUE_MAX = 4;

const MOVES = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
};

const PAUSE_KEYS = new Set(['p', 'P', 'Escape']);

// Maps a KeyboardEvent.key to an input, or null for an unmapped key.
export function keyToInput(key) {
  const move = MOVES[key];
  if (move) return { move, pause: false };
  if (PAUSE_KEYS.has(key)) return { move: null, pause: true };
  return null;
}

// Maps a touch swipe in pixels to a move, or null for swipes shorter than
// 24 px on both axes. A tie between the axes goes horizontal.
export function swipeToInput(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 24 && ay < 24) return null;
  let move;
  if (ax >= ay) move = dx > 0 ? 'right' : 'left';
  else move = dy > 0 ? 'down' : 'up';
  return { move, pause: false };
}

// queuePush returns a new array with input appended, or the queue
// unchanged when it already holds INPUT_QUEUE_MAX inputs or input is null.
export function queuePush(queue, input) {
  if (input === null) return queue;
  if (queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

// queueTake returns the first input and the rest, or a no-move input and
// an empty queue when the queue is empty. Neither function changes its
// argument.
export function queueTake(queue) {
  if (queue.length === 0) return { input: { move: null, pause: false }, queue: [] };
  return { input: queue[0], queue: queue.slice(1) };
}

// attachKeyboard listens for keydown on target; for a key that
// keyToInput maps it calls event.preventDefault() and onInput(input).
// Returns a function that removes that same listener.
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
