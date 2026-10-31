// State validation (DESIGN.md §8): checkState returns the error codes it
// finds, in §8's order, empty for a valid state.

import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

const STATUSES = new Set(['playing', 'won', 'lost']);

export function checkState(state) {
  const errors = [];

  // bad_status: the only legal statuses.
  if (!STATUSES.has(state.status)) errors.push('bad_status');

  // player_in_wall: off the map or on a wall cell.
  {
    const x = state.player?.x;
    const y = state.player?.y;
    const tiles = state.level?.tiles;
    const ch = tiles && Number.isInteger(y) && y >= 0 && y < tiles.length &&
      Number.isInteger(x) && x >= 0 && x < tiles[y].length
      ? tiles[y][x]
      : '#';
    if (ch === '#') errors.push('player_in_wall');
  }

  // carry_overflow: more carried patches than hands have.
  if (state.carried?.length > CARRY_MAX) errors.push('carry_overflow');

  // lives_range: an integer from 0 to START_LIVES.
  if (!Number.isInteger(state.lives) || state.lives < 0 || state.lives > START_LIVES) {
    errors.push('lives_range');
  }

  // score_negative: not an integer or below zero.
  if (!Number.isInteger(state.score) || state.score < 0) errors.push('score_negative');

  // patch_off_spawn: every lying patch sits on a spawn point.
  {
    const spawns = state.level?.spawns ?? [];
    for (const p of state.patches ?? []) {
      if (!spawns.some((sp) => sp.x === p.x && sp.y === p.y)) {
        errors.push('patch_off_spawn');
        break;
      }
    }
  }

  // drift_in_wall: off the map or on a wall cell.
  {
    const tiles = state.level?.tiles;
    for (const d of state.drifts ?? []) {
      const inside = tiles && Number.isInteger(d.y) && d.y >= 0 && d.y < tiles.length &&
        Number.isInteger(d.x) && d.x >= 0 && d.x < tiles[d.y].length;
      if (!inside || tiles[d.y][d.x] === '#') {
        errors.push('drift_in_wall');
        break;
      }
    }
  }

  // bad_color: carried or lying colours are integers in [0, COLORS).
  {
    for (const c of state.carried ?? []) {
      if (!Number.isInteger(c) || c < 0 || c >= COLORS) {
        errors.push('bad_color');
        break;
      }
    }
    if (!errors.includes('bad_color')) {
      for (const p of state.patches ?? []) {
        if (!Number.isInteger(p.color) || p.color < 0 || p.color >= COLORS) {
          errors.push('bad_color');
          break;
        }
      }
    }
  }

  return errors;
}
