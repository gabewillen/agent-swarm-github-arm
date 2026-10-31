// State validation (DESIGN.md §8). Pure: reads a state, returns error codes.
// Every code is at most once, in the order of the table below.

import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

const STATUSES = ['playing', 'won', 'lost'];

// The terrain characters of a parsed level.
function isOnMap(state, x, y) {
  const level = state.level;
  if (!level || !Array.isArray(level.tiles) || level.tiles.length === 0) return false;
  if (!Number.isInteger(y) || y < 0 || y >= level.height) return false;
  if (!Number.isInteger(x) || x < 0 || x >= level.tiles[y].length) return false;
  return true;
}

function tileOf(state, x, y) {
  if (!isOnMap(state, x, y)) return null;
  return state.level.tiles[y][x];
}

export function checkState(state) {
  const errors = [];

  // A state must be an object to check anything else.
  if (!state || typeof state !== 'object') return errors;

  // bad_status
  if (!STATUSES.includes(state.status)) errors.push('bad_status');

  // player_in_wall: off the map or on a wall
  if (typeof state.player === 'object' && state.player !== null) {
    const tile = tileOf(state, state.player.x, state.player.y);
    if (tile === null || tile === '#') errors.push('player_in_wall');
  }

  // carry_overflow
  if (Array.isArray(state.carried) && state.carried.length > CARRY_MAX) {
    errors.push('carry_overflow');
  }

  // lives_range: an integer from 0 to START_LIVES
  const lives = state.lives;
  if (!(typeof lives === 'number' && Number.isInteger(lives) && lives >= 0 && lives <= START_LIVES)) {
    errors.push('lives_range');
  }

  // score_negative
  if (typeof state.score !== 'number' || !Number.isInteger(state.score) || state.score < 0) {
    errors.push('score_negative');
  }

  // patch_off_spawn: every lying patch sits on a spawn point
  if (Array.isArray(state.patches) && Array.isArray(state.level?.spawns)) {
    for (const patch of state.patches) {
      const onSpawn = state.level.spawns.some((s) => s.x === patch.x && s.y === patch.y);
      if (!onSpawn) {
        errors.push('patch_off_spawn');
        break;
      }
    }
  }

  // drift_in_wall
  if (Array.isArray(state.drifts)) {
    for (const drift of state.drifts) {
      const tile = tileOf(state, drift.x, drift.y);
      if (tile === null || tile === '#') {
        errors.push('drift_in_wall');
        break;
      }
    }
  }

  // bad_color: carried or lying patch colour, integer in [0, COLORS)
  const badColor = (c) => !Number.isInteger(c) || c < 0 || c >= COLORS;
  if (Array.isArray(state.carried) && state.carried.some(badColor)) errors.push('bad_color');
  if (Array.isArray(state.patches) && state.patches.some((p) => badColor(p.color))) errors.push('bad_color');

  return errors;
}
