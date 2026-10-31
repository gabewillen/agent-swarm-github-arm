// §8 Invariants: checkState(state) returns an array of error codes, empty
// for a valid state. Pure and defensive: it reads the state only, changes
// nothing, and never throws, whatever shape the state has.

import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

const STATUSES = ['playing', 'won', 'lost'];

// The map character at a cell, '#' when the cell is off the map, when the
// level or its tiles are missing, or when the coordinates are not usable
// integers (as tileAt treats the world beyond the map).
function cell(state, x, y) {
  const tiles = state && state.level ? state.level.tiles : null;
  if (!Array.isArray(tiles)) return '#';
  if (!Number.isInteger(y) || y < 0 || y >= tiles.length) return '#';
  const row = tiles[y];
  if (typeof row !== 'string') return '#';
  if (!Number.isInteger(x) || x < 0 || x >= row.length) return '#';
  return row[x];
}

export function checkState(state) {
  const errors = [];
  const add = (code) => {
    if (!errors.includes(code)) errors.push(code);
  };

  // bad_status
  if (!state || typeof state !== 'object' || !STATUSES.includes(state.status)) {
    add('bad_status');
  }

  // player_in_wall: off the map or on a '#' (a missing or wild player
  // coordinate lands outside the map too).
  const player = state && state.player;
  if (cell(state, player && player.x, player && player.y) === '#') {
    add('player_in_wall');
  }

  // carry_overflow
  if (Array.isArray(state && state.carried) && state.carried.length > CARRY_MAX) {
    add('carry_overflow');
  }

  // lives_range: an integer from 0 to START_LIVES.
  const lives = state ? state.lives : NaN;
  if (!Number.isInteger(lives) || lives < 0 || lives > START_LIVES) {
    add('lives_range');
  }

  // score_negative: an integer, and not negative.
  const score = state ? state.score : NaN;
  if (!Number.isInteger(score) || score < 0) {
    add('score_negative');
  }

  // patch_off_spawn: every lying patch sits on a spawn point.
  const spawns = state && state.level && Array.isArray(state.level.spawns)
    ? state.level.spawns
    : [];
  const spawnCells = new Set(spawns.map((s) => `${s.x},${s.y}`));
  const patches = Array.isArray(state && state.patches) ? state.patches : [];
  for (const patch of patches) {
    if (!spawnCells.has(`${patch.x},${patch.y}`)) {
      add('patch_off_spawn');
      break;
    }
  }

  // drift_in_wall: off the map or on a '#'.
  const drifts = Array.isArray(state && state.drifts) ? state.drifts : [];
  for (const drift of drifts) {
    if (cell(state, drift && drift.x, drift && drift.y) === '#') {
      add('drift_in_wall');
      break;
    }
  }

  // bad_color: a carried or lying patch colour not an integer in
  // [0, COLORS).
  const inColorRange = (c) => Number.isInteger(c) && c >= 0 && c < COLORS;
  if (Array.isArray(state && state.carried)) {
    for (const color of state.carried) {
      if (!inColorRange(color)) add('bad_color');
    }
  }
  for (const patch of patches) {
    if (!inColorRange(patch ? patch.color : undefined)) add('bad_color');
  }

  return errors;
}
