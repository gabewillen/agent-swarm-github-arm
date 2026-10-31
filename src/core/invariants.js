// State invariants (DESIGN.md §8): checkState(state) returns an array of
// error codes, empty for a valid state. It is pure: it reads the state it
// is given and changes nothing.
//
// A broken state should only ever exist between a caller's own edits, so
// the check is a debugging aid as much as a rule: every code below comes
// straight from §8's table, and a state that `init` made or `step` returned
// must produce an empty array.

import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

// The level's character at (x, y); null when the cell is off the map.
function tileAt(level, x, y) {
  const tiles = level && level.tiles;
  if (!Array.isArray(tiles) || !Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (y < 0 || y >= tiles.length) return null;
  const row = tiles[y];
  if (typeof row !== 'string') return null;
  if (x < 0 || x >= row.length) return null;
  return row[x];
}

// True when the cell is off the map or on a '#'.
function isWallOrOutside(level, x, y) {
  const tile = tileAt(level, x, y);
  return tile === null || tile === '#';
}

// A patch colour is an integer in [0, COLORS).
function isColor(color) {
  return Number.isInteger(color) && color >= 0 && color < COLORS;
}

export function checkState(state) {
  const errors = [];
  const s = state && typeof state === 'object' ? state : {};

  // bad_status: status is one of the three.
  if (s.status !== 'playing' && s.status !== 'won' && s.status !== 'lost') errors.push('bad_status');

  // player_in_wall: the player is on the map and not on a '#'.
  const player = s.player;
  const px = player && player.x;
  const py = player && player.y;
  if (isWallOrOutside(s.level, px, py)) errors.push('player_in_wall');

  // carry_overflow: at most CARRY_MAX carried, in play.
  const carried = Array.isArray(s.carried) ? s.carried : [];
  if (carried.length > CARRY_MAX) errors.push('carry_overflow');

  // lives_range: an integer from 0 to START_LIVES.
  if (!Number.isInteger(s.lives) || s.lives < 0 || s.lives > START_LIVES) errors.push('lives_range');

  // score_negative: a non-negative integer score.
  if (!Number.isInteger(s.score) || s.score < 0) errors.push('score_negative');

  // patch_off_spawn: every lying patch is on a spawn point.
  const spawns = s.level ? s.level.spawns : null;
  const hasSpawn = Array.isArray(spawns)
    ? spawns.some((sp) => sp && Number.isFinite(sp.x))
    : false;
  const patches = Array.isArray(s.patches) ? s.patches : [];
  for (const patch of patches) {
    if (!patch || typeof patch !== 'object' || !hasSpawn ||
        !spawns.some((sp) => sp.x === patch.x && sp.y === patch.y)) {
      errors.push('patch_off_spawn');
      break;
    }
  }

  // drift_in_wall: every drift is on the map and not on a '#'.
  const drifts = Array.isArray(s.drifts) ? s.drifts : [];
  for (const drift of drifts) {
    if (!drift || typeof drift !== 'object' || isWallOrOutside(s.level, drift.x, drift.y)) {
      errors.push('drift_in_wall');
      break;
    }
  }

  // bad_color: a carried colour or a lying patch colour is an integer in
  // [0, COLORS).
  if (!carried.every(isColor)) errors.push('bad_color');
  if (!patches.every((patch) => patch && isColor(patch.color))) errors.push('bad_color');

  return errors;
}
