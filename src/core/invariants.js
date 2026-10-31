// State validation (DESIGN.md §8). `checkState(state)` returns the array of
// error codes it finds, empty for a valid state, and never changes the state.
// It is structural: it reads the state's own shape, not the rules, so it only
// flags what the codes name — a player off the map is the player's problem
// even when closed hold doors would have made the position impossible.
import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

const STATUSES = ['playing', 'won', 'lost'];

// The map's character at a cell, or null when off the map or malformed.
function tileAt(tiles, x, y) {
  if (!Array.isArray(tiles) || typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (y < 0 || y >= tiles.length) return null;
  const row = tiles[y];
  if (typeof row !== 'string' || x < 0 || x >= row.length) return null;
  return row[x];
}

// True when a cell is a real, non-wall cell of the map.
function onFloor(tiles, p) {
  return tileAt(tiles, p?.x, p?.y) !== null && tileAt(tiles, p?.x, p?.y) !== '#';
}

// True when `p` is on the same cell as any of the spawn points.
function onAnySpawn(spawns, p) {
  if (!Array.isArray(spawns)) return false;
  return spawns.some((s) => s && s.x === p?.x && s.y === p?.y);
}

// True when `c` is an integer patch colour in [0, COLORS).
function goodColor(c) {
  return Number.isInteger(c) && c >= 0 && c < COLORS;
}

const each = (arr, fn) => {
  if (Array.isArray(arr)) for (const item of arr) fn(item);
};

export function checkState(state) {
  if (!state || typeof state !== 'object') return ['bad_status'];
  const errors = [];
  if (!STATUSES.includes(state.status)) errors.push('bad_status');
  const tiles = state.level?.tiles;

  if (!onFloor(tiles, state.player)) errors.push('player_in_wall');

  const carried = state.carried;
  if (!Array.isArray(carried) || carried.length > CARRY_MAX) errors.push('carry_overflow');

  const lives = state.lives;
  if (!Number.isInteger(lives) || lives < 0 || lives > START_LIVES) errors.push('lives_range');

  const score = state.score;
  if (!Number.isInteger(score) || score < 0) errors.push('score_negative');

  each(state.patches, (p) => {
    if (!onAnySpawn(state.level?.spawns, p)) errors.push('patch_off_spawn');
    if (!goodColor(p?.color)) errors.push('bad_color');
  });

  each(state.drifts, (d) => {
    if (!onFloor(tiles, d)) errors.push('drift_in_wall');
  });

  each(carried, (c) => {
    if (!goodColor(c)) errors.push('bad_color');
  });

  // Each code at most once, in the order it was first found.
  return [...new Set(errors)];
}
