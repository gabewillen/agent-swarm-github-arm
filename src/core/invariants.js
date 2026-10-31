// State validation (DESIGN.md §8). `checkState` reads a game state and
// returns the codes of the invariants it breaks, empty for a valid one.
// It is pure: it never changes its argument and touches no DOM, window,
// clock, or source of randomness.

import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

const STATUSES = ['playing', 'won', 'lost'];

const isObject = (v) => v !== null && typeof v === 'object';

// The terrain character at a cell of the state's level, '#' outside the
// map or wherever the level shape does not name a cell.
function tileAt(state, x, y) {
  if (!isObject(state) || !isObject(state.level) || !Array.isArray(state.level.tiles)) return '#';
  const row = state.level.tiles[y];
  if (typeof row !== 'string') return '#';
  if (x < 0 || x >= row.length) return '#';
  return row[x];
}

// A position is on the map when both coordinates are integers naming a
// cell inside it; anything else reads as a wall (off the map).
function inWall(state, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return true;
  return tileAt(state, x, y) === '#';
}

export function checkState(state) {
  if (!isObject(state)) return ['bad_status'];
  const errors = [];

  // bad_status: status is not 'playing', 'won', or 'lost'.
  if (!STATUSES.includes(state.status)) errors.push('bad_status');

  // player_in_wall: the player is off the map or on a '#'.
  const player = state.player;
  if (!isObject(player) || inWall(state, player.x, player.y)) errors.push('player_in_wall');

  // carry_overflow: more than CARRY_MAX carried.
  const carried = Array.isArray(state.carried) ? state.carried : [];
  if (carried.length > CARRY_MAX) errors.push('carry_overflow');

  // lives_range: lives is not an integer from 0 to START_LIVES.
  const { lives } = state;
  if (!Number.isInteger(lives) || lives < 0 || lives > START_LIVES) errors.push('lives_range');

  // score_negative: score is negative or not an integer.
  const { score } = state;
  if (!Number.isInteger(score) || score < 0) errors.push('score_negative');

  // patch_off_spawn: a lying patch is not on a spawn point.
  const patches = Array.isArray(state.patches) ? state.patches : [];
  const spawns = [];
  if (isObject(state.level) && Array.isArray(state.level.spawns)) {
    for (const s of state.level.spawns) if (isObject(s)) spawns.push([s.x, s.y]);
  }
  for (const patch of patches) {
    if (!isObject(patch) || !spawns.some(([sx, sy]) => patch.x === sx && patch.y === sy)) {
      errors.push('patch_off_spawn');
    }
  }

  // drift_in_wall: a drift is off the map or on a '#'.
  const drifts = Array.isArray(state.drifts) ? state.drifts : [];
  for (const drift of drifts) {
    if (!isObject(drift) || inWall(state, drift.x, drift.y)) errors.push('drift_in_wall');
  }

  // bad_color: a carried or lying patch colour is not an integer in
  // [0, COLORS).
  const badColor = (c) => !Number.isInteger(c) || c < 0 || c >= COLORS;
  for (const color of carried) {
    if (badColor(color)) errors.push('bad_color');
  }
  for (const patch of patches) {
    if (!isObject(patch) || badColor(patch.color)) errors.push('bad_color');
  }

  return errors;
}
