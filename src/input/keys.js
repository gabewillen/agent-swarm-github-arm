// Input (DESIGN.md §12): key and swipe mapping plus a small immutable
// input queue. Nothing here touches the DOM: attachKeyboard only uses the
// event target it is given.

// Maps a KeyboardEvent.key to an input, or null for keys that do nothing.
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

// Maps a touch swipe in pixels to a move, or null below 24 px on both
// axes. The larger axis wins; a tie goes horizontal.
export function swipeToInput(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 24 && ay < 24) return null;
  if (ax >= ay) return { move: dx > 0 ? 'right' : 'left', pause: false };
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

// The input queue holds at most this many inputs; further pushes are
// dropped.
export const INPUT_QUEUE_MAX = 4;

// Returns a new queue with input appended, or the queue unchanged when it
// is full or the input is null. Never changes its argument.
export function queuePush(queue, input) {
  if (input === null) return queue;
  if (queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

// Takes the first input off the queue; an empty queue gives no move.
// Never changes its argument.
export function queueTake(queue) {
  if (queue.length === 0) return { input: { move: null, pause: false }, queue: [] };
  return { input: queue[0], queue: queue.slice(1) };
}

// Listens for keydown on target and reports mapped inputs. Returns a
// function that removes the same listener.
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
