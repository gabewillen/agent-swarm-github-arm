// Quorum Run state validation (DESIGN.md §8).
//
// checkState(state) returns every error code it finds, in the order of
// §8's table; an empty array means a valid state. It never throws: a
// value it cannot read (a missing level, malformed coordinates) fails
// the checks that would need it.

import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

const STATUSES = ['playing', 'won', 'lost'];

// The terrain character at a cell, or null when it cannot be read: off
// the map, on non-integer coordinates, or on tiles that are missing or
// malformed (not an array of strings).
function tile(state, x, y) {
  const tiles = state && state.level ? state.level.tiles : null;
  if (!Array.isArray(tiles)) return null;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (y < 0 || y >= tiles.length) return null;
  const row = tiles[y];
  if (typeof row !== 'string') return null;
  if (x < 0 || x >= row.length) return null;
  return row[x];
}

// The integer coordinates of a point, or null when it is not an object
// holding integers.
function pointOf(p) {
  if (!p || typeof p !== 'object') return null;
  const { x, y } = p;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return { x, y };
}

// Whether a spawn point lies on (x, y).
function onSpawn(spawns, x, y) {
  for (const spawn of spawns) {
    if (spawn && spawn.x === x && spawn.y === y) return true;
  }
  return false;
}

// Returns the list of error codes of the state, empty when it is valid.
export function checkState(state) {
  const s = state && typeof state === 'object' ? state : {};
  const errors = [];
  const add = (code) => {
    if (!errors.includes(code)) errors.push(code);
  };

  // bad_status: the status is not one of the three.
  if (!STATUSES.includes(s.status)) add('bad_status');

  // player_in_wall: the player is off the map or on a wall.
  const player = pointOf(s.player);
  const pt = player ? tile(s, player.x, player.y) : null;
  if (pt === null || pt === '#') add('player_in_wall');

  // carry_overflow: more patches carried than CARRY_MAX.
  const carried = Array.isArray(s.carried) ? s.carried : [];
  if (carried.length > CARRY_MAX) add('carry_overflow');

  // lives_range: lives is not an integer from 0 to START_LIVES.
  if (!Number.isInteger(s.lives) || s.lives < 0 || s.lives > START_LIVES) {
    add('lives_range');
  }

  // score_negative: score is negative or not an integer.
  if (!Number.isInteger(s.score) || s.score < 0) add('score_negative');

  // patch_off_spawn: a lying patch is not on a spawn point.
  const level = s.level && typeof s.level === 'object' ? s.level : {};
  const spawns = Array.isArray(level.spawns) ? level.spawns : [];
  const patches = Array.isArray(s.patches) ? s.patches : [];
  for (const patch of patches) {
    const at = pointOf(patch);
    if (!at || !onSpawn(spawns, at.x, at.y)) add('patch_off_spawn');
  }

  // drift_in_wall: a drift is off the map or on a wall.
  const drifts = Array.isArray(s.drifts) ? s.drifts : [];
  for (const drift of drifts) {
    const at = pointOf(drift);
    const t = at ? tile(s, at.x, at.y) : null;
    if (t === null || t === '#') add('drift_in_wall');
  }

  // bad_color: a carried or lying patch colour is not an integer in
  // [0, COLORS).
  const goodColor = (color) => Number.isInteger(color) && color >= 0 && color < COLORS;
  for (const color of carried) {
    if (!goodColor(color)) add('bad_color');
  }
  for (const patch of patches) {
    if (!patch || typeof patch !== 'object' || !goodColor(patch.color)) add('bad_color');
  }

  return errors;
}
