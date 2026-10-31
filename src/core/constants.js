// Quorum Run shared constants (DESIGN.md §2).
// x grows right, y grows down; (0, 0) is the top-left cell.

// patches the player can carry
export const CARRY_MAX = 3;
// lives at init
export const START_LIVES = 3;
// ticks of immunity after a hit or a drop
export const INVULN_TICKS = 6;
// a conflict's life in ticks
export const CONFLICT_TICKS = 10;
// base points per merged patch
export const PATCH_BASE = 100;
// bonus per patch for a same-colour merge of 2 or more
export const SAME_COLOR_BONUS = 50;
// points per tick under par at the exit
export const TIME_BONUS_PER_TICK = 10;
// patch colours, numbered 0 to COLORS - 1
export const COLORS = 4;
// real milliseconds per tick in the browser
export const TICK_MS = 120;

// moves as [dx, dy]
export const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

// turn order
export const CLOCKWISE = ['up', 'right', 'down', 'left'];
