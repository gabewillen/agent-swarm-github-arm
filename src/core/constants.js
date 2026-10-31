// Quorum Run: constants shared by every module (DESIGN.md §2).
export const CARRY_MAX = 3; // patches the player can carry
export const START_LIVES = 3; // lives at init
export const INVULN_TICKS = 6; // ticks of immunity after a hit or a drop
export const CONFLICT_TICKS = 10; // a conflict's life in ticks
export const PATCH_BASE = 100; // base points per merged patch
export const SAME_COLOR_BONUS = 50; // bonus per patch for a same-colour merge of 2+
export const TIME_BONUS_PER_TICK = 10; // points per tick under par at the exit
export const COLORS = 4; // patch colours, numbered 0 to 3
export const TICK_MS = 120; // real milliseconds per tick in the browser
export const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
export const CLOCKWISE = ['up', 'right', 'down', 'left'];
