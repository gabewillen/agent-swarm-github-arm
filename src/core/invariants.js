// State validation (DESIGN.md §8): checkState returns the error codes of
// every rule the state breaks, empty for a valid one. Pure: it reads the
// state and changes nothing.
import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

// The terrain character at a cell, '#' off the map or where the row or
// column does not exist (so a bad coordinate reads as a wall).
function tileAt(state, x, y) {
  const tiles = state.level && state.level.tiles;
  const row = y == null ? undefined : tiles[y];
  const ch = x == null || row == null ? undefined : row[x];
  return ch === undefined ? '#' : ch;
}

function badColor(color) {
  return !Number.isInteger(color) || color < 0 || color >= COLORS;
}

export function checkState(state) {
  const errors = [];

  // bad_status
  if (state.status !== 'playing' && state.status !== 'won' && state.status !== 'lost') {
    errors.push('bad_status');
  }

  // player_in_wall: off the map or on a '#'
  if (tileAt(state, state.player && state.player.x, state.player && state.player.y) === '#') {
    errors.push('player_in_wall');
  }

  // carry_overflow
  const carried = Array.isArray(state.carried) ? state.carried : [];
  if (carried.length > CARRY_MAX) errors.push('carry_overflow');

  // lives_range: an integer from 0 to START_LIVES
  const lives = state.lives;
  if (!Number.isInteger(lives) || lives < 0 || lives > START_LIVES) {
    errors.push('lives_range');
  }

  // score_negative: negative or not an integer
  const score = state.score;
  if (!Number.isInteger(score) || score < 0) {
    errors.push('score_negative');
  }

  const spawnCells = new Set(
    (state.level && Array.isArray(state.level.spawns) ? state.level.spawns : [])
      .map((p) => `${p.x},${p.y}`),
  );

  // patch_off_spawn and bad_color on lying patches
  const patches = Array.isArray(state.patches) ? state.patches : [];
  for (const patch of patches) {
    if (!spawnCells.has(`${patch && patch.x},${patch && patch.y}`)) {
      errors.push('patch_off_spawn');
    }
    if (badColor(patch && patch.color)) {
      errors.push('bad_color');
    }
  }

  // bad_color on carried patches
  for (const color of carried) {
    if (badColor(color)) errors.push('bad_color');
  }

  // drift_in_wall: a drift off the map or on a '#'
  const drifts = Array.isArray(state.drifts) ? state.drifts : [];
  for (const drift of drifts) {
    if (tileAt(state, drift && drift.x, drift && drift.y) === '#') {
      errors.push('drift_in_wall');
    }
  }

  return errors;
}
