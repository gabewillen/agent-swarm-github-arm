// Input (DESIGN.md §12): keyboard mapping, touch swipes, and a small
// input queue. Pure functions throughout; attachKeyboard is handed its
// event target and touches nothing global.

// KeyboardEvent.key to §6's input shape; an unmapped key is null.
const MOVES = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
};

export function keyToInput(key) {
  if (key === 'p' || key === 'P' || key === 'Escape') return { move: null, pause: true };
  const move = MOVES[key];
  if (move === undefined) return null;
  return { move, pause: false };
}

// A swipe shorter than 24 px on both axes is a tap, not a move. Beyond
// that the larger axis wins; a tie goes horizontal.
export function swipeToInput(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 24 && ay < 24) return null;
  if (ax >= ay) return { move: dx > 0 ? 'right' : 'left', pause: false };
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

// The queue holds at most this many inputs; a push beyond it is dropped.
export const INPUT_QUEUE_MAX = 4;

// The queue is a plain array of inputs. Neither helper changes its
// argument; pushes copy, takes slice.
export function queuePush(queue, input) {
  if (input === null || queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

export function queueTake(queue) {
  if (queue.length === 0) return { input: { move: null, pause: false }, queue: [] };
  return { input: queue[0], queue: queue.slice(1) };
}

// Wire a keydown listener on target: mapped keys prevent default and are
// reported to onInput; the returned function removes the same listener.
export function attachKeyboard(target, onInput) {
  const handler = (event) => {
    const input = keyToInput(event.key);
    if (input === null) return;
    event.preventDefault();
    onInput(input);
  };
  target.addEventListener('keydown', handler);
  return () => target.removeEventListener('keydown', handler);
}
