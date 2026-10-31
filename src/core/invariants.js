// Quorum Run state invariants (DESIGN.md §8).
// checkState(state) reads one game state and returns its error codes as an
// array, each code at most once, in the table's order; empty for a valid
// state. Pure: it only reads, and never changes, its argument.

import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

const STATUSES = ['playing', 'won', 'lost'];

// The terrain character of the state's level at a cell ('#' off the map),
// the same rule game.js's tileAt follows, read from the parsed level.
function tileAt(state, x, y) {
  const tiles = state && state.level ? state.level.tiles : null;
  if (!Array.isArray(tiles) || !Number.isInteger(y) || y < 0 || y >= tiles.length) return '#';
  const row = tiles[y];
  if (typeof row !== 'string' || !Number.isInteger(x) || x < 0 || x >= row.length) return '#';
  return row[x];
}

// A patch colour is an integer in [0, COLORS).
function isColor(value) {
  return Number.isInteger(value) && value >= 0 && value < COLORS;
}

export function checkState(state) {
  const errors = [];
  if (!state || typeof state !== 'object') return errors;

  // bad_status: status is one of the three the game can hold.
  if (!STATUSES.includes(state.status)) errors.push('bad_status');

  // player_in_wall: the player is off the map or stands on a wall.
  const p = state.player;
  if (!p || typeof p !== 'object' || tileAt(state, p.x, p.y) === '#') {
    errors.push('player_in_wall');
  }

  // carry_overflow: more than CARRY_MAX patches carried.
  const carried = Array.isArray(state.carried) ? state.carried : [];
  if (carried.length > CARRY_MAX) errors.push('carry_overflow');

  // lives_range: lives is an integer from 0 to START_LIVES.
  if (!Number.isInteger(state.lives) || state.lives < 0 || state.lives > START_LIVES) {
    errors.push('lives_range');
  }

  // score_negative: score is a non-negative integer.
  if (!Number.isInteger(state.score) || state.score < 0) errors.push('score_negative');

  // patch_off_spawn and bad_color: every lying patch sits on a spawn point
  // of this level and holds a colour the patches come in.
  const spawns = state.level && Array.isArray(state.level.spawns) ? state.level.spawns : [];
  const spots = new Set(spawns.map((s) => `${s.x},${s.y}`));
  const patches = Array.isArray(state.patches) ? state.patches : [];
  for (const patch of patches) {
    const onSpawn = !!patch && typeof patch === 'object' && spots.has(`${patch.x},${patch.y}`);
    if (!onSpawn) errors.push('patch_off_spawn');
    if (!patch || typeof patch !== 'object' || !isColor(patch.color)) errors.push('bad_color');
  }

  // drift_in_wall: a drift is off the map or on a wall.
  const drifts = Array.isArray(state.drifts) ? state.drifts : [];
  for (const drift of drifts) {
    if (!drift || typeof drift !== 'object' || tileAt(state, drift.x, drift.y) === '#') {
      errors.push('drift_in_wall');
    }
  }

  // bad_color: a carried patch colour, too.
  for (const color of carried) {
    if (!isColor(color)) errors.push('bad_color');
  }

  return errors;
}
