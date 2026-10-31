// §8 State invariants. `checkState(state)` returns the codes of the broken
// rules of a state, empty for a valid one. Pure, render-free, and forgiving:
// a malformed field is named what the table says, never a crash.
//
// Tiles are read straight from the parsed level the state carries
// (`state.level.tiles`), with the same outside-the-map rule as `tileAt` in
// §5: anything outside is `#`. Only `src/core/constants.js` is imported, so
// this module can never form a cycle with `src/core/game.js`.
import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

const STATUSES = ['playing', 'won', 'lost'];

// A patch colour is an integer in [0, COLORS).
function colorOk(c) {
  return Number.isInteger(c) && c >= 0 && c < COLORS;
}

// '#' for a cell off the map, the row's character otherwise.
function tileAt(level, x, y) {
  if (!level || !Array.isArray(level.tiles)) return '#';
  const row = level.tiles[y];
  if (typeof row !== 'string' || !Number.isInteger(x) || x < 0 || x >= row.length) {
    return '#';
  }
  return row[x];
}

// A body (the player, a drift) is in a wall when it is off the map or on '#'.
function inWall(level, body) {
  if (!body || typeof body !== 'object') return false;
  if (!Number.isInteger(body.x) || !Number.isInteger(body.y)) return false;
  return tileAt(level, body.x, body.y) === '#';
}

export function checkState(state) {
  if (!state || typeof state !== 'object') return [];
  const errors = new Set();

  if (!STATUSES.includes(state.status)) errors.add('bad_status');

  const level = state.level && typeof state.level === 'object' ? state.level : null;
  if (!state.player || typeof state.player !== 'object' || inWall(level, state.player)) {
    errors.add('player_in_wall');
  }

  if (Array.isArray(state.carried) && state.carried.length > CARRY_MAX) {
    errors.add('carry_overflow');
  }

  if (!Number.isInteger(state.lives) || state.lives < 0 || state.lives > START_LIVES) {
    errors.add('lives_range');
  }

  if (!Number.isInteger(state.score) || state.score < 0) {
    errors.add('score_negative');
  }

  const spawns = level && Array.isArray(level.spawns) ? level.spawns : null;
  if (Array.isArray(state.patches)) {
    if (spawns) {
      const onSpawn = (q) => spawns.some((s) => s && s.x === q.x && s.y === q.y);
      if (state.patches.some((q) => q && typeof q === 'object' && !onSpawn(q))) {
        errors.add('patch_off_spawn');
      }
    }
    if (state.patches.some((q) => !q || typeof q !== 'object' || !colorOk(q.color))) {
      errors.add('bad_color');
    }
  }

  if (Array.isArray(state.drifts)) {
    const dud = (d) => !d || typeof d !== 'object' || inWall(level, d);
    if (state.drifts.some(dud)) errors.add('drift_in_wall');
  }

  if (Array.isArray(state.carried) && !state.carried.every(colorOk)) {
    errors.add('bad_color');
  }

  return [...errors];
}
