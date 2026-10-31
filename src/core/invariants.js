// State validation (DESIGN.md §8).
//
// checkState(state) returns an array of error codes, empty for a valid
// state; each code at most once, listed below in its table order. Pure:
// it reads only its argument and never throws on odd shapes — anything it
// cannot read makes the code it belongs to.

import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

const STATUSES = ['playing', 'won', 'lost'];

// The level's terrain character at a cell: tiles[y][x], '#' off the map.
function tileAt(level, x, y) {
  if (!level || !Array.isArray(level.tiles) || typeof x !== 'number' ||
      typeof y !== 'number' || !Number.isInteger(x) || !Number.isInteger(y)) return '#';
  if (y < 0 || y >= level.tiles.length) return '#';
  const row = level.tiles[y];
  if (typeof row !== 'string') return '#';
  if (x < 0 || x >= row.length) return '#';
  return row[x];
}

export function checkState(state) {
  const errors = [];
  const add = (code) => {
    if (!errors.includes(code)) errors.push(code);
  };

  // bad_status: status is not 'playing', 'won', or 'lost'. [§8]
  if (!STATUSES.includes(state?.status)) add('bad_status');

  // player_in_wall: the player is off the map or on a '#'. [§8]
  const player = state?.player;
  if (!player || tileAt(state?.level, player.x, player.y) === '#') {
    add('player_in_wall');
  }

  const carried = state?.carried;

  // carry_overflow: more than CARRY_MAX carried. [§8]
  if (carried !== undefined && (!Array.isArray(carried) || carried.length > CARRY_MAX)) {
    add('carry_overflow');
  }

  // lives_range: lives is not an integer from 0 to START_LIVES. [§8]
  const lives = state?.lives;
  if (!Number.isInteger(lives) || lives < 0 || lives > START_LIVES) {
    add('lives_range');
  }

  // score_negative: score is negative or not an integer. [§8]
  const score = state?.score;
  if (!Number.isInteger(score) || score < 0) add('score_negative');

  // patch_off_spawn: a patch is not on a spawn point. [§8]
  const patches = state?.patches;
  const spawns = state?.level?.spawns;
  if (Array.isArray(patches) && Array.isArray(spawns)) {
    for (const patch of patches) {
      const spawn = spawns.find((sp) => sp?.x === patch?.x && sp?.y === patch?.y);
      if (!spawn) {
        add('patch_off_spawn');
        break;
      }
    }
  }

  // drift_in_wall: a drift is off the map or on a '#'. [§8]
  const drifts = state?.drifts;
  if (Array.isArray(drifts)) {
    for (const drift of drifts) {
      if (tileAt(state?.level, drift?.x, drift?.y) === '#') {
        add('drift_in_wall');
        break;
      }
    }
  }

  // bad_color: a carried or lying patch colour is not an integer in
  // [0, COLORS). [§8]
  if (Array.isArray(carried)) {
    for (const color of carried) {
      if (!Number.isInteger(color) || color < 0 || color >= COLORS) {
        add('bad_color');
        break;
      }
    }
  }
  if (Array.isArray(patches)) {
    for (const patch of patches) {
      const color = patch?.color;
      if (!Number.isInteger(color) || color < 0 || color >= COLORS) {
        add('bad_color');
        break;
      }
    }
  }

  return errors;
}
