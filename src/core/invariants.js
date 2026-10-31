// State invariants (DESIGN.md §8): checkState(state) returns an array of
// error codes, empty for a valid state. Pure: reads only plain data off
// the state and imports the shared constants of §2.
import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

const STATUSES = ['playing', 'won', 'lost'];

// The codes of §8, in table order.
const CODES = [
  'bad_status', 'player_in_wall', 'carry_overflow', 'lives_range',
  'score_negative', 'patch_off_spawn', 'drift_in_wall', 'bad_color',
];

function tileAt(level, x, y) {
  const tiles = level && level.tiles;
  if (!Array.isArray(tiles) || !Number.isInteger(y) || y < 0 || y >= tiles.length) return '#';
  const row = tiles[y];
  if (typeof row !== 'string' || !Number.isInteger(x) || x < 0 || x >= row.length) return '#';
  return row[x];
}

function onSpawn(level, patch) {
  const spawns = level && level.spawns;
  if (!Array.isArray(spawns) || !patch) return false;
  return spawns.some((s) => s && s.x === patch.x && s.y === patch.y);
}

export function checkState(state) {
  const bad = new Set();
  const inWall = (e) => !e || !Number.isInteger(e.x) || !Number.isInteger(e.y) || tileAt(state && state.level, e.x, e.y) === '#';

  if (state) {
    if (!STATUSES.includes(state.status)) bad.add('bad_status');

    if (inWall(state.player)) bad.add('player_in_wall');

    if (Array.isArray(state.carried) && state.carried.length > CARRY_MAX) bad.add('carry_overflow');

    if (!Number.isInteger(state.lives) || state.lives < 0 || state.lives > START_LIVES) bad.add('lives_range');

    if (!Number.isInteger(state.score) || state.score < 0) bad.add('score_negative');

    if (Array.isArray(state.patches)) {
      for (const patch of state.patches) {
        if (!patch || !onSpawn(state.level, patch)) bad.add('patch_off_spawn');
        if (!patch || !Number.isInteger(patch.color) || patch.color < 0 || patch.color >= COLORS) bad.add('bad_color');
      }
    }

    if (Array.isArray(state.drifts)) {
      for (const drift of state.drifts) if (inWall(drift)) bad.add('drift_in_wall');
    }

    if (Array.isArray(state.carried)) {
      for (const color of state.carried) {
        if (!Number.isInteger(color) || color < 0 || color >= COLORS) bad.add('bad_color');
      }
    }
  }

  return CODES.filter((code) => bad.has(code));
}
