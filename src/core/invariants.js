// DESIGN.md §8: state validation. Pure: it reads a state and reports the
// rules it breaks, if any, as codes.
import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

function isInt(v) {
  return typeof v === 'number' && Number.isInteger(v);
}

export function checkState(state) {
  const errors = [];
  if (!state || typeof state !== 'object') return ['bad_status'];
  const { status } = state;
  if (status !== 'playing' && status !== 'won' && status !== 'lost') errors.push('bad_status');

  const tiles = state.level && state.level.tiles ? state.level.tiles : null;
  const wall = (x, y) => {
    if (!isInt(x) || !isInt(y)) return true;
    const row = tiles && tiles[y];
    if (row === undefined || x < 0 || x >= row.length) return true;
    return row[x] === '#';
  };

  const player = state.player;
  if (!player || wall(player.x, player.y)) errors.push('player_in_wall');

  const carried = Array.isArray(state.carried) ? state.carried : [];
  if (carried.length > CARRY_MAX) errors.push('carry_overflow');

  if (!isInt(state.lives) || state.lives < 0 || state.lives > START_LIVES) errors.push('lives_range');
  if (!isInt(state.score) || state.score < 0) errors.push('score_negative');

  const badColor = (c) => !isInt(c) || c < 0 || c >= COLORS;
  const patches = Array.isArray(state.patches) ? state.patches : [];
  const spawns = (state.level && Array.isArray(state.level.spawns)) ? state.level.spawns : null;
  for (const p of patches) {
    if (spawns && !spawns.some((s) => s.x === p.x && s.y === p.y)) errors.push('patch_off_spawn');
    if (badColor(p && p.color)) errors.push('bad_color');
  }
  for (const c of carried) if (badColor(c)) errors.push('bad_color');

  const drifts = Array.isArray(state.drifts) ? state.drifts : [];
  for (const d of drifts) if (!d || wall(d.x, d.y)) errors.push('drift_in_wall');

  return errors;
}
