// Quorum Run: state validation (DESIGN.md §8).
// Pure: reads a state object, returns an array of error codes, empty when
// the state is valid. It checks at least the codes below, in this order.

import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

const STATUSES = ['playing', 'won', 'lost'];

// The character of a cell of the state's parsed level, or undefined off
// the map.
function tileAt(state, x, y) {
  const tiles = state && state.level ? state.level.tiles : null;
  if (!Array.isArray(tiles) || y < 0 || y >= tiles.length) return undefined;
  const row = tiles[y];
  if (typeof row !== 'string') return undefined;
  return x >= 0 && x < row.length ? row[x] : undefined;
}

export function checkState(state) {
  const errors = [];
  if (state === null || typeof state !== 'object') return errors;

  const flags = {
    bad_status: false,
    player_in_wall: false,
    carry_overflow: false,
    lives_range: false,
    score_negative: false,
    patch_off_spawn: false,
    drift_in_wall: false,
    bad_color: false,
  };

  // bad_status
  flags.bad_status = !STATUSES.includes(state.status);

  // player_in_wall: off the map or on a wall
  if (state.player && typeof state.player === 'object') {
    flags.player_in_wall = tileAt(state, state.player.x, state.player.y) === undefined
      || tileAt(state, state.player.x, state.player.y) === '#';
  }

  // carry_overflow
  if (Array.isArray(state.carried) && state.carried.length > CARRY_MAX) {
    flags.carry_overflow = true;
  }

  // lives_range: an integer from 0 to START_LIVES
  if (!Number.isInteger(state.lives)
    || state.lives < 0
    || state.lives > START_LIVES) {
    flags.lives_range = true;
  }

  // score_negative: negative or not an integer
  if (!Number.isInteger(state.score) || state.score < 0) {
    flags.score_negative = true;
  }

  // patches: each lies on a spawn point, each colour an integer in range
  const spawns = state.level && Array.isArray(state.level.spawns) ? state.level.spawns : [];
  if (Array.isArray(state.patches)) {
    for (const patch of state.patches) {
      if (!patch || typeof patch !== 'object') continue;
      if (!spawns.some((s) => s && s.x === patch.x && s.y === patch.y)) {
        flags.patch_off_spawn = true;
      }
      if (!Number.isInteger(patch.color)
        || patch.color < 0
        || patch.color >= COLORS) {
        flags.bad_color = true;
      }
    }
  }

  // drift_in_wall: off the map or on a wall
  if (Array.isArray(state.drifts)) {
    for (const drift of state.drifts) {
      if (!drift || typeof drift !== 'object') continue;
      const tile = tileAt(state, drift.x, drift.y);
      if (tile === undefined || tile === '#') flags.drift_in_wall = true;
    }
  }

  // carried colours too
  if (Array.isArray(state.carried)) {
    for (const color of state.carried) {
      if (!Number.isInteger(color) || color < 0 || color >= COLORS) {
        flags.bad_color = true;
      }
    }
  }

  for (const code of Object.keys(flags)) {
    if (flags[code]) errors.push(code);
  }
  return errors;
}
