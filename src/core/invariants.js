// State validation (DESIGN.md §8).
//
// checkState(state) returns the array of error codes the state violates,
// empty for a valid state. It is pure and defensive: a malformed field is
// reported, never a crash. Each code appears at most once, in the order
// of §8's table. The core stays render-free and uses no forbidden APIs.

import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

const STATUSES = ['playing', 'won', 'lost'];

// §5 tileAt's rules: the terrain character at a cell, '#' off the map.
// Used against the state's parsed level so the whole check is local.
function tileOf(level, x, y) {
  const tiles = level && typeof level === 'object' && Array.isArray(level.tiles) ? level.tiles : null;
  if (!tiles || typeof x !== 'number' || !Number.isInteger(x) || typeof y !== 'number' || !Number.isInteger(y)) {
    return '#';
  }
  if (y < 0 || y >= tiles.length) return '#';
  const row = tiles[y];
  if (typeof row !== 'string' || x < 0 || x >= row.length) return '#';
  return row[x];
}

const isObject = (v) => v !== null && typeof v === 'object';

// A carried or lying patch colour: an integer in [0, COLORS).
const goodColor = (c) => typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < COLORS;

export function checkState(state) {
  const errors = [];
  if (!isObject(state)) return errors;

  const level = isObject(state.level) ? state.level : null;
  const player = isObject(state.player) ? state.player : null;
  const carried = Array.isArray(state.carried) ? state.carried : null;
  const patches = Array.isArray(state.patches) ? state.patches : null;
  const drifts = Array.isArray(state.drifts) ? state.drifts : null;
  const spawns = level && Array.isArray(level.spawns) ? level.spawns : null;

  // bad_status
  if (!STATUSES.includes(state.status)) errors.push('bad_status');

  // player_in_wall: the player off the map or on a '#'
  if (!player || tileOf(level, player.x, player.y) === '#') errors.push('player_in_wall');

  // carry_overflow: more than CARRY_MAX carried
  if (carried && carried.length > CARRY_MAX) errors.push('carry_overflow');

  // lives_range: not an integer from 0 to START_LIVES
  if (!Number.isInteger(state.lives) || state.lives < 0 || state.lives > START_LIVES) {
    errors.push('lives_range');
  }

  // score_negative: negative or not an integer
  if (!Number.isInteger(state.score) || state.score < 0) errors.push('score_negative');

  // patch_off_spawn: a lying patch not on a spawn point
  if (patches) {
    const onSpawn = (p) => isObject(p) && !!spawns && spawns.some((s) => isObject(s) && s.x === p.x && s.y === p.y);
    if (patches.some((p) => !onSpawn(p))) errors.push('patch_off_spawn');
  }

  // drift_in_wall: a drift off the map or on a '#'
  if (drifts) {
    const walled = (d) => !isObject(d) || tileOf(level, d.x, d.y) === '#';
    if (drifts.some(walled)) errors.push('drift_in_wall');
  }

  // bad_color: a carried or lying patch colour not an integer in [0, COLORS)
  const badCarried = carried !== null && carried.some((c) => !goodColor(c));
  const badLying = patches !== null && patches.some((p) => !isObject(p) || !goodColor(p.color));
  if (badCarried || badLying) errors.push('bad_color');

  return errors;
}
