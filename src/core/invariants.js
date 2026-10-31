// Invariants: checkState walks one game state and lists what is wrong
// with it (DESIGN.md §8). Empty means valid.

import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

export function checkState(state) {
  const errors = [];
  if (!state || typeof state !== 'object') return ['bad_status'];

  if (state.status !== 'playing' && state.status !== 'won' && state.status !== 'lost') {
    errors.push('bad_status');
  }

  const at = (x, y) => {
    const row = state.level.tiles[y];
    if (row === undefined || x < 0 || x >= row.length) return '#';
    return row[x];
  };

  if (state.player === undefined || state.player === null ||
      at(state.player.x, state.player.y) === '#') {
    errors.push('player_in_wall');
  }

  if (Array.isArray(state.carried) && state.carried.length > CARRY_MAX) {
    errors.push('carry_overflow');
  }

  if (!Number.isInteger(state.lives) || state.lives < 0 || state.lives > START_LIVES) {
    errors.push('lives_range');
  }

  if (!Number.isInteger(state.score) || state.score < 0) {
    errors.push('score_negative');
  }

  if (Array.isArray(state.patches) && Array.isArray(state.level.spawns) &&
      state.patches.some((p) => !state.level.spawns.some((q) =>
        q.x === p.x && q.y === p.y))) {
    errors.push('patch_off_spawn');
  }

  if (Array.isArray(state.drifts) &&
      state.drifts.some((d) => at(d.x, d.y) === '#')) {
    errors.push('drift_in_wall');
  }

  const okColor = (c) => Number.isInteger(c) && c >= 0 && c < COLORS;
  if ((Array.isArray(state.carried) && state.carried.some((c) => !okColor(c))) ||
      (Array.isArray(state.patches) && state.patches.some((p) => !okColor(p.color)))) {
    errors.push('bad_color');
  }

  return errors;
}
