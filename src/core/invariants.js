// The state invariants (DESIGN.md §8).
// `checkState(state)` returns the codes of every invariant the state
// breaks; an empty array is a valid state. It only reads the state: pure.

import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

const STATUSES = ['playing', 'won', 'lost'];

// The character at a cell: '#' outside the map, as `tileAt` reports it.
// Ragged rows and a missing level stay non-crashing checks.
function terrain(tiles, x, y) {
  if (!Array.isArray(tiles)) return '#';
  if (!Number.isInteger(y) || y < 0 || y >= tiles.length) return '#';
  const row = tiles[y];
  if (!Array.isArray(row) && typeof row !== 'string') return '#';
  if (!Number.isInteger(x) || x < 0 || x >= row.length) return '#';
  return row[x];
}

function offMapOrWall(tiles, x, y) {
  return terrain(tiles, x, y) === '#';
}

function isInt(n) {
  return typeof n === 'number' && Number.isInteger(n);
}

// A lying or carried colour: an integer in [0, COLORS).
function isColor(color) {
  return isInt(color) && color >= 0 && color < COLORS;
}

function list(state, field) {
  const v = state[field];
  return Array.isArray(v) ? v : [];
}

export function checkState(state) {
  if (!state || typeof state !== 'object') return [];
  const errors = [];
  const level = (state.level && typeof state.level === 'object') ? state.level : {};
  const tiles = level.tiles;
  const spawns = Array.isArray(level.spawns) ? level.spawns : [];

  // bad_status
  if (!STATUSES.includes(state.status)) errors.push('bad_status');

  // player_in_wall: off the map or on a wall
  const player = (state.player && typeof state.player === 'object') ? state.player : {};
  if (offMapOrWall(tiles, player.x, player.y)) errors.push('player_in_wall');

  // carry_overflow
  if (Array.isArray(state.carried) && state.carried.length > CARRY_MAX) {
    errors.push('carry_overflow');
  }

  // lives_range: an integer from 0 to START_LIVES
  if (!isInt(state.lives) || state.lives < 0 || state.lives > START_LIVES) {
    errors.push('lives_range');
  }

  // score_negative: negative or not an integer
  if (!isInt(state.score) || state.score < 0) errors.push('score_negative');

  // patch_off_spawn: a lying patch not on a spawn point
  for (const patch of list(state, 'patches')) {
    const spot = (patch && typeof patch === 'object') ? patch : {};
    const onSpawn = spawns.some((s) => s && s.x === spot.x && s.y === spot.y);
    if (!onSpawn) {
      errors.push('patch_off_spawn');
      break;
    }
  }

  // drift_in_wall: off the map or on a wall
  for (const drift of list(state, 'drifts')) {
    const d = (drift && typeof drift === 'object') ? drift : {};
    if (offMapOrWall(tiles, d.x, d.y)) {
      errors.push('drift_in_wall');
      break;
    }
  }

  // bad_color on carried and lying patches
  for (const color of list(state, 'carried')) {
    if (!isColor(color)) {
      errors.push('bad_color');
      break;
    }
  }
  for (const patch of list(state, 'patches')) {
    const spot = (patch && typeof patch === 'object') ? patch : {};
    if (!isColor(spot.color)) {
      errors.push('bad_color');
      break;
    }
  }

  return errors;
}
