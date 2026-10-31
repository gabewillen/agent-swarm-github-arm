// Input (DESIGN.md §12): keyboard and touch mapping, and a small queue.

// keyToInput maps a KeyboardEvent.key to an input for the game's step.
const MOVE_KEYS = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
};

const PAUSE_KEYS = { p: true, P: true, Escape: true };

export function keyToInput(key) {
  const move = MOVE_KEYS[key];
  if (move) return { move, pause: false };
  if (PAUSE_KEYS[key]) return { move: null, pause: true };
  return null;
}

// swipeToInput maps a touch swipe in pixels. Swipes below 24 px on both
// axes are nothing; a tie goes horizontal.
const SWIPE_MIN = 24;

export function swipeToInput(dx, dy) {
  if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return { move: dx > 0 ? 'right' : 'left', pause: false };
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

// The input queue holds at most INPUT_QUEUE_MAX inputs, ready for step.
export const INPUT_QUEUE_MAX = 4;

export function queuePush(queue, input) {
  if (input === null || input === undefined || queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

export function queueTake(queue) {
  if (queue.length === 0) return { input: { move: null, pause: false }, queue: [] };
  return { input: queue[0], queue: queue.slice(1) };
}

// attachKeyboard listens for keydown on target, mapping keys; Mapped keys
// get their default behaviour prevented, unmapped keys pass through. It
// returns a function that removes that same listener.
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
