// Quorum Run: state invariants (DESIGN.md §8).
//
// checkState(state) reads one core state and answers with the codes of the
// checks it breaks, each at most once, in the order §8 lists them; a valid
// state gets an empty array. It reads only the state it is given: pure,
// draw-free, and seeded by nothing.

import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

const STATUSES = ['playing', 'won', 'lost'];

export function checkState(state) {
  if (state === null || typeof state !== 'object') return ['bad_status'];
  const errors = new Set();

  // The terrain of the state's parsed level: a row per entry, '#' also
  // off the edge, per §5's tileAt.
  const level = state.level ?? null;
  const tiles = level !== null && Array.isArray(level.tiles) ? level.tiles : [];
  const tileAt = (x, y) => {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return '#';
    if (y < 0 || y >= tiles.length) return '#';
    const row = tiles[y];
    if (typeof row !== 'string' || x < 0 || x >= row.length) return '#';
    return row[x];
  };

  // bad_status
  if (!STATUSES.includes(state.status)) errors.add('bad_status');

  // player_in_wall: off the map or standing on a wall. A hold, the exit,
  // or a merge pad is never a wall here.
  const player = state.player ?? null;
  if (player === null || typeof player !== 'object' || tileAt(player.x, player.y) === '#') {
    errors.add('player_in_wall');
  }

  // carry_overflow: more patches in hand than the player may carry. The
  // field must be an array at all.
  const carried = state.carried ?? null;
  if (!Array.isArray(carried) || carried.length > CARRY_MAX) errors.add('carry_overflow');

  // lives_range: an integer from 0 to START_LIVES.
  if (!Number.isInteger(state.lives) || state.lives < 0 || state.lives > START_LIVES) {
    errors.add('lives_range');
  }

  // score_negative: negative or not an integer.
  if (!Number.isInteger(state.score) || state.score < 0) errors.add('score_negative');

  // patch_off_spawn: every lying patch sits on one of the level's spawn
  // points.
  const spawns = level !== null && Array.isArray(level.spawns) ? level.spawns : [];
  const onSpawn = (x, y) =>
    spawns.some((spawn) => spawn !== null && typeof spawn === 'object' && spawn.x === x && spawn.y === y);
  const patches = state.patches ?? null;
  if (Array.isArray(patches)) {
    for (const patch of patches) {
      if (patch === null || typeof patch !== 'object' || !onSpawn(patch.x, patch.y)) {
        errors.add('patch_off_spawn');
      }
    }
  } else if (patches !== null) {
    errors.add('patch_off_spawn');
  }

  // drift_in_wall: a drift off the map or standing on a wall.
  const drifts = state.drifts ?? null;
  if (Array.isArray(drifts)) {
    for (const drift of drifts) {
      if (drift === null || typeof drift !== 'object' || tileAt(drift.x, drift.y) === '#') {
        errors.add('drift_in_wall');
      }
    }
  } else if (drifts !== null) {
    errors.add('drift_in_wall');
  }

  // bad_color: a carried or lying patch colour is an integer in [0, COLORS).
  const inColorRange = (color) => Number.isInteger(color) && color >= 0 && color < COLORS;
  if (Array.isArray(carried)) {
    for (const color of carried) if (!inColorRange(color)) errors.add('bad_color');
  }
  if (Array.isArray(patches)) {
    for (const patch of patches) {
      if (!inColorRange(patch?.color)) errors.add('bad_color');
    }
  }

  return [...errors];
}
