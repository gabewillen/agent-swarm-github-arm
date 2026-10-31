// src/input/keys.js — input from keyboard and touch (DESIGN.md §12).
//
// The mapping helpers are pure; attachKeyboard only uses the target it is
// handed and never touches DOM or browser globals at import time.

// keyToInput's tables: movement keys and pause keys by KeyboardEvent.key.
const MOVE_KEYS = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
};
const PAUSE_KEYS = new Set(['p', 'P', 'Escape']);

// keyToInput(key) maps a KeyboardEvent.key to { move, pause } or null.
export function keyToInput(key) {
  if (MOVE_KEYS[key] !== undefined) return { move: MOVE_KEYS[key], pause: false };
  if (PAUSE_KEYS.has(key)) return { move: null, pause: true };
  return null;
}

// A swipe shorter than 24 px on both axes is not a move.
const SWIPE_MIN = 24;

// swipeToInput(dx, dy) maps a touch swipe in pixels: null when both axes
// are below 24 px, else a move along the larger axis — a tie goes
// horizontal — with pause: false.
export function swipeToInput(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < SWIPE_MIN && ay < SWIPE_MIN) return null;
  if (ax >= ay) return { move: dx > 0 ? 'right' : 'left', pause: false };
  return { move: dy > 0 ? 'down' : 'up', pause: false };
}

export const INPUT_QUEUE_MAX = 4;

// queuePush(queue, input) returns a new array with input appended, or the
// same queue when it is already full or input is null.
export function queuePush(queue, input) {
  if (input === null || queue.length >= INPUT_QUEUE_MAX) return queue;
  return [...queue, input];
}

// queueTake(queue) returns { input, queue }: the first input and the rest,
// or a no-move input and an empty queue. Neither argument changes.
export function queueTake(queue) {
  if (!queue.length) return { input: { move: null, pause: false }, queue: [] };
  return { input: queue[0], queue: queue.slice(1) };
}

// attachKeyboard(target, onInput) listens for keydown on target; a mapped
// key is intercepted with preventDefault() and handed to onInput. Returns
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
