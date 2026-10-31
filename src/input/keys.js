// Quorum Run input (DESIGN.md §12): keyboard mapping, touch swipes, and the
// small input queue the browser loop drains one move from each tick.

// keyToInput maps a KeyboardEvent.key to an input { move, pause } or null.
// Arrow keys and WASD move (either case); p, P, and Escape pause.
export function keyToInput(key) {
  if (key === 'ArrowUp' || key === 'w' || key === 'W') return { move: 'up', pause: false };
  if (key === 'ArrowDown' || key === 's' || key === 'S') return { move: 'down', pause: false };
  if (key === 'ArrowLeft' || key === 'a' || key === 'A') return { move: 'left', pause: false };
  if (key === 'ArrowRight' || key === 'd' || key === 'D') return { move: 'right', pause: false };
  if (key === 'p' || key === 'P' || key === 'Escape') return { move: null, pause: true };
  return null;
}

// swipeToInput maps a touch swipe in pixels: a move along the larger axis
// (a tie goes horizontal), or null when both axes are below 24 px.
export function swipeToInput(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 24 && ay < 24) return null;
  if (ax >= ay) return { move: dx > 0 ? 'right' : 'left', pause: false };
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

// The queue holds at most INPUT_QUEUE_MAX inputs at a time.
export const INPUT_QUEUE_MAX = 4;

// queuePush appends an input to a new queue, or returns the queue unchanged
// when it is full or the input is null. It never changes its argument.
export function queuePush(queue, input) {
  if (input === null || queue.length >= INPUT_QUEUE_MAX) return queue;
  const next = queue.slice();
  next.push(input);
  return next;
}

// queueTake takes the first input and the rest of the queue; an empty queue
// gives no move and none left.
export function queueTake(queue) {
  if (queue.length === 0) return { input: { move: null, pause: false }, queue: [] };
  const [input, ...rest] = queue;
  return { input, queue: rest };
}

// attachKeyboard listens for keydown on target and calls onInput with the
// mapped input, calling preventDefault for mapped keys only. It returns a
// detach function that removes that same listener.
export function attachKeyboard(target, onInput) {
  function handler(event) {
    const input = keyToInput(event.key);
    if (input === null) return;
    event.preventDefault();
    onInput(input);
  }
  target.addEventListener('keydown', handler);
  return function detach() {
    target.removeEventListener('keydown', handler);
  };
}
