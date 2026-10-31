// Quorum Run input (DESIGN.md §12).
// Maps keys and swipes to inputs, and holds a small input queue. The only
// DOM this module touches is objects it is given (an event target), so it
// loads cleanly anywhere.

// Map a KeyboardEvent.key to an input, or null for keys the game ignores.
export function keyToInput(key) {
  switch (key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      return { move: 'up', pause: false };
    case 'ArrowDown':
    case 's':
    case 'S':
      return { move: 'down', pause: false };
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return { move: 'left', pause: false };
    case 'ArrowRight':
    case 'd':
    case 'D':
      return { move: 'right', pause: false };
    case 'p':
    case 'P':
    case 'Escape':
      return { move: null, pause: true };
    default:
      return null;
  }
}

// Map a touch swipe in pixels to a move: null until the swipe is long
// enough (24 px), then along the larger axis, a tie horizontal.
export function swipeToInput(dx, dy) {
  const w = Math.abs(dx);
  const h = Math.abs(dy);
  if (w < 24 && h < 24) return null;
  if (w >= h) return { move: dx > 0 ? 'right' : 'left', pause: false };
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

export const INPUT_QUEUE_MAX = 4;

// Append an input, as a new array; never change the queue given. Nulls
// and full queues come back unchanged.
export function queuePush(queue, input) {
  if (input === null || input === undefined) return queue;
  if (queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

// Take the first input off the front, or no move for an empty queue.
export function queueTake(queue) {
  if (queue.length === 0) {
    return { input: { move: null, pause: false }, queue: [] };
  }
  return { input: queue[0], queue: queue.slice(1) };
}

// Listen for keydown on target, calling onInput with each mapped input,
// preventing the browser's response for the keys the game uses. Returns
// a function that removes that same listener.
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
