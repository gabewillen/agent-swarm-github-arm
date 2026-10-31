// Quorum Run — input (DESIGN.md §12).
// Key mapping, touch swipes, and the pure input queue. Plain ES module,
// no dependencies, nothing Node-only; the DOM is touched only through the
// event target that `attachKeyboard` is given.

const MOVES = {
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

// Maps a KeyboardEvent.key to an input, or null for anything unmapped.
export function keyToInput(key) {
  const move = MOVES[key];
  if (move) return { move, pause: false };
  if (PAUSE_KEYS[key]) return { move: null, pause: true };
  return null;
}

// A swipe smaller than 24 px on both axes is no move; else it moves
// along the larger axis, with ties going horizontal.
export function swipeToInput(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 24 && ay < 24) return null;
  if (ax >= ay) return { move: dx > 0 ? 'right' : 'left', pause: false };
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

export const INPUT_QUEUE_MAX = 4;

// Appends an input to a fresh queue, unless the queue is full or the
// input is null: then the queue comes back unchanged.
export function queuePush(queue, input) {
  if (input === null || queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

// Takes the first input off a queue; an empty queue is no move.
export function queueTake(queue) {
  if (queue.length === 0) return { input: { move: null, pause: false }, queue: [] };
  return { input: queue[0], queue: queue.slice(1) };
}

// Listens for keydown on the given target; mapped keys are prevented and
// reported to onInput. Returns a function that removes the listener.
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
