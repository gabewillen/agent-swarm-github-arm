// Quorum Run input (DESIGN.md §12): keyboard and swipe mapping, and a
// small queue of pending inputs. The module itself touches no browser
// globals; `attachKeyboard` only calls methods of the target it is
// given, so it imports cleanly outside a browser too.

// Map a `KeyboardEvent.key` to an input, or null for keys the game
// ignores. Arrows and WASD move; p, P, and Escape pause.
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

// Map a touch swipe in pixels: null until it is long enough (24 px on
// both axes), else a move along the larger axis; a tie goes horizontal.
export function swipeToInput(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 24 && ay < 24) return null;
  if (ax >= ay) return { move: dx > 0 ? 'right' : 'left', pause: false };
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

// The queue holds at most this many pending inputs.
export const INPUT_QUEUE_MAX = 4;

// queuePush returns a new array with the input appended, or the queue
// unchanged when it is full or the input is null. It never changes its
// argument.
export function queuePush(queue, input) {
  if (input === null || queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

// queueTake gives the first input and the rest, or no move and an empty
// queue when there is nothing pending. It never changes its argument.
export function queueTake(queue) {
  if (queue.length === 0) {
    return { input: { move: null, pause: false }, queue: [] };
  }
  return { input: queue[0], queue: queue.slice(1) };
}

// attachKeyboard listens for keydown on the target; for a key the game
// maps it stops the browser's own response (arrow keys scroll) and
// calls onInput with the input. It returns a function that removes that
// same listener.
export function attachKeyboard(target, onInput) {
  const handler = (event) => {
    const input = keyToInput(event.key);
    if (input === null) return;
    event.preventDefault();
    onInput(input);
  };
  target.addEventListener('keydown', handler);
  return function detach() {
    target.removeEventListener('keydown', handler);
  };
}
