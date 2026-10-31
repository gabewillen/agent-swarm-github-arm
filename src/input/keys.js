// Quorum Run input (DESIGN.md §12): mapping of keys and swipes to the
// step input `{ move, pause }`, and a small immutable input queue.
// Nothing touches the DOM at import time; attachKeyboard uses only the
// event target it is given.

const MOVE_KEYS = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
};

const PAUSE_KEYS = { p: 'p', P: 'p', Escape: 'p' };

const NO_INPUT = { move: null, pause: false };

/** Map a KeyboardEvent.key to an input, or null when unmapped (§12). */
export function keyToInput(key) {
  const move = MOVE_KEYS[key];
  if (move) return { move, pause: false };
  if (PAUSE_KEYS[key]) return { move: null, pause: true };
  return null;
}

/** The smallest swipe in pixels that counts as a move. */
export const SWIPE_MIN = 24;

/** Map a touch swipe in pixels to an input: move along the larger axis,
 * horizontal on a tie, null when both axes are below the threshold. */
export function swipeToInput(dx, dy) {
  const x = Math.abs(dx);
  const y = Math.abs(dy);
  if (x < SWIPE_MIN && y < SWIPE_MIN) return null;
  if (y > x) return { move: dy > 0 ? 'down' : 'up', pause: false };
  return { move: dx > 0 ? 'right' : 'left', pause: false };
}

/** The queue holds at most this many inputs. */
export const INPUT_QUEUE_MAX = 4;

/** Push an input, if there is room and it is not null; the queue's own
 * array is never changed, a new one comes back instead. */
export function queuePush(queue, input) {
  if (input === null || queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

/** Take the first input: the rest of the queue comes back second. An
 * empty queue gives a null move and no pause. */
export function queueTake(queue) {
  if (queue.length === 0) return { input: NO_INPUT, queue: [] };
  return { input: queue[0], queue: queue.slice(1) };
}

/** Listen for keydown on target: mapped keys call preventDefault and
 * onInput, unmapped ones keep their default. Returns a function that
 * removes the listener again. */
export function attachKeyboard(target, onInput) {
  const onKey = (event) => {
    const input = keyToInput(event.key);
    if (input) {
      event.preventDefault();
      onInput(input);
    }
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
