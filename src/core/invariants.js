// Quorum Run — state invariants (DESIGN.md §8).
// checkState(state) returns the codes of a broken state, in the order of the
// §8 table and at most once each. A part of the state the checks cannot read
// (no usable parsed level, say) is not itself a breach: the checks that need
// it are skipped, and nothing else is invented.

import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

const STATUSES = ['playing', 'won', 'lost'];

// The terrain at (x, y) from the state's parsed level: the character there,
// '#' off the map, and null when the state carries no usable tiles.
function tileOf(state, x, y) {
  const tiles = state && state.level ? state.level.tiles : null;
  if (!Array.isArray(tiles)) return null;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return '#';
  if (y < 0 || y >= tiles.length) return '#';
  const row = tiles[y];
  if (typeof row !== 'string' || x < 0 || x >= row.length) return '#';
  return row[x];
}

// A colour is valid when it is an integer in [0, COLORS).
function badColor(color) {
  return !Number.isInteger(color) || color < 0 || color >= COLORS;
}

export function checkState(state) {
  if (!state || typeof state !== 'object') return ['bad_status'];
  const codes = [];
  const seen = new Set();
  const add = (code) => {
    if (!seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  };

  // bad_status: the status is one of the three.
  if (!STATUSES.includes(state.status)) add('bad_status');

  // player_in_wall: the player is off the map or on a '#'.
  const player = state.player;
  if (tileOf(state, player ? player.x : undefined, player ? player.y : undefined) === '#') {
    add('player_in_wall');
  }

  // carry_overflow: no more than CARRY_MAX carried patches.
  if (Array.isArray(state.carried) && state.carried.length > CARRY_MAX) {
    add('carry_overflow');
  }

  // lives_range: an integer from 0 to START_LIVES.
  if (!Number.isInteger(state.lives) || state.lives < 0 || state.lives > START_LIVES) {
    add('lives_range');
  }

  // score_negative: a non-negative integer.
  if (!Number.isInteger(state.score) || state.score < 0) add('score_negative');

  // patch_off_spawn: every lying patch sits on one of the level's spawns.
  const spawns = state.level && Array.isArray(state.level.spawns) ? state.level.spawns : [];
  if (Array.isArray(state.patches)) {
    for (const patch of state.patches) {
      const placed = patch && typeof patch === 'object' &&
        spawns.some((sp) => sp && sp.x === patch.x && sp.y === patch.y);
      if (!placed) add('patch_off_spawn');
    }
  }

  // drift_in_wall: every drift is on the map and not on a '#'.
  if (Array.isArray(state.drifts)) {
    for (const drift of state.drifts) {
      if (drift && typeof drift === 'object' &&
          tileOf(state, drift.x, drift.y) === '#') {
        add('drift_in_wall');
      }
    }
  }

  // bad_color: carried colours and lying patches are integers in [0, COLORS).
  if (Array.isArray(state.carried)) {
    for (const color of state.carried) if (badColor(color)) add('bad_color');
  }
  if (Array.isArray(state.patches)) {
    for (const patch of state.patches) {
      if (badColor(patch ? patch.color : undefined)) add('bad_color');
    }
  }

  return codes;
}
