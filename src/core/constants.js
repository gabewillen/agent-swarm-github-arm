// Quorum Run's shared constants (DESIGN.md §2).

// Patches the player can carry at once.
export const CARRY_MAX = 3;

// Lives at `init`.
export const START_LIVES = 3;

// Ticks of immunity after a hit or a drop.
export const INVULN_TICKS = 6;

// A conflict's life in ticks.
export const CONFLICT_TICKS = 10;

// Base points per merged patch.
export const PATCH_BASE = 100;

// Bonus per patch for a same-colour merge of 2 or more.
export const SAME_COLOR_BONUS = 50;

// Points per tick under par at the exit.
export const TIME_BONUS_PER_TICK = 10;

// Patch colours, numbered 0 to COLORS - 1.
export const COLORS = 4;

// Real milliseconds per tick in the browser.
export const TICK_MS = 120;

// Moves as [dx, dy]; x grows right and y grows down.
export const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

// Turn order, starting at up.
export const CLOCKWISE = ['up', 'right', 'down', 'left'];
