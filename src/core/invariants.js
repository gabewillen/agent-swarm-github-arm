// Quorum Run — invariants (DESIGN.md §8).
// checkState(state) returns an array of error codes, empty for a valid
// state. It is pure: it never changes the state.

import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

const STATUSES = ['playing', 'won', 'lost'];

// The terrain character at a cell, or null when the cell is not on the
// map (or the level carries no tiles to look at).
function cellAt(level, x, y) {
  const tiles = level && level.tiles;
  if (!Array.isArray(tiles)) return null;
  if (typeof level.width === 'number' && !(x >= 0 && x < level.width)) return null;
  if (typeof level.height === 'number' && !(y >= 0 && y < level.height)) return null;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (y < 0 || y >= tiles.length) return null;
  const row = tiles[y];
  if (typeof row !== 'string' || x < 0 || x >= row.length) return null;
  return row[x];
}

// A patch colour: an integer in [0, COLORS).
function isColor(c) {
  return Number.isInteger(c) && c >= 0 && c < COLORS;
}

// `checkState` flags each error code at most once, in the order of §8's
// table. A field that is absent or of no usable shape is skipped by the
// checks that read it, so a half-built state fails no invented code.
export function checkState(state) {
  const s = state && typeof state === 'object' ? state : {};
  const level = s.level && typeof s.level === 'object' ? s.level : null;
  const hasMap = !!level && Array.isArray(level.tiles);
  const spawns = level && level.spawns && Array.isArray(level.spawns) ? level.spawns : null;
  const carried = Array.isArray(s.carried) ? s.carried : null;
  const patches = Array.isArray(s.patches) ? s.patches : null;
  const drifts = Array.isArray(s.drifts) ? s.drifts : null;
  const bad = {};

  if (!STATUSES.includes(s.status)) bad.bad_status = true;

  if (hasMap) {
    const player = s.player && typeof s.player === 'object' ? s.player : {};
    const cell = cellAt(level, player.x, player.y);
    if (cell === null || cell === '#') bad.player_in_wall = true;
  }

  if (carried && carried.length > CARRY_MAX) bad.carry_overflow = true;

  if (!Number.isInteger(s.lives) || s.lives < 0 || s.lives > START_LIVES) {
    bad.lives_range = true;
  }

  if (!Number.isInteger(s.score) || s.score < 0) bad.score_negative = true;

  if (patches && spawns) {
    for (const p of patches) {
      const off =
        !p || typeof p !== 'object' ||
        !spawns.some((t) => t && t.x === p.x && t.y === p.y);
      if (off) {
        bad.patch_off_spawn = true;
        break;
      }
    }
  }

  if (drifts && hasMap) {
    for (const d of drifts) {
      const cell = cellAt(level, d && d.x, d && d.y);
      if (cell === null || cell === '#') {
        bad.drift_in_wall = true;
        break;
      }
    }
  }

  if (carried && carried.some((c) => !isColor(c))) bad.bad_color = true;
  if (patches && patches.some((p) => p && !isColor(p.color))) bad.bad_color = true;

  return [
    'bad_status',
    'player_in_wall',
    'carry_overflow',
    'lives_range',
    'score_negative',
    'patch_off_spawn',
    'drift_in_wall',
    'bad_color',
  ].filter((code) => bad[code]);
}
