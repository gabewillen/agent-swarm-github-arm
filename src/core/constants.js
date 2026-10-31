// The constants every module shares, DESIGN.md §2.
// x grows right and y grows down; (0, 0) is the top-left cell.

export const CARRY_MAX = 3;
export const START_LIVES = 3;
export const INVULN_TICKS = 6;
export const CONFLICT_TICKS = 10;
export const PATCH_BASE = 100;
export const SAME_COLOR_BONUS = 50;
export const TIME_BONUS_PER_TICK = 10;
export const COLORS = 4;
export const TICK_MS = 120;

export const DIRS = Object.freeze({
  up: Object.freeze([0, -1]),
  right: Object.freeze([1, 0]),
  down: Object.freeze([0, 1]),
  left: Object.freeze([-1, 0]),
});

export const CLOCKWISE = Object.freeze(['up', 'right', 'down', 'left']);
