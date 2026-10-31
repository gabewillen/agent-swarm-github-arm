// §8: state invariants. checkState(state) returns the error codes of every
// rule the state breaks, each at most once and in the order of §8's table,
// or an empty array for a valid state. It reads the state only: a pure
// function with no draws and no clock.
import { CARRY_MAX, START_LIVES, COLORS } from './constants.js';

const STATUSES = ['playing', 'won', 'lost'];
const CODES = [
  'bad_status',
  'player_in_wall',
  'carry_overflow',
  'lives_range',
  'score_negative',
  'patch_off_spawn',
  'drift_in_wall',
  'bad_color',
];

// The terrain character of a cell, or: `null` when the cell lies off the
// map, and `undefined` when the state carries no map to check against.
function mapTile(tiles, x, y) {
  if (!Array.isArray(tiles)) return undefined;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (y < 0 || y >= tiles.length) return null;
  const row = tiles[y];
  if (typeof row !== 'string' || x < 0 || x >= row.length) return null;
  return row[x];
}

// Off the map or on a wall: a body no legal step put there.
const inWall = (tile) => tile === null || tile === '#';

export function checkState(state) {
  const s = state && typeof state === 'object' ? state : {};
  const level = s.level && typeof s.level === 'object' ? s.level : {};
  const tiles = level.tiles;

  const player = s.player && typeof s.player === 'object' ? s.player : {};
  const carried = Array.isArray(s.carried) ? s.carried : [];
  const patches = Array.isArray(s.patches) ? s.patches : [];
  const drifts = Array.isArray(s.drifts) ? s.drifts : [];
  const spawns = Array.isArray(level.spawns) ? level.spawns : [];

  const onSpawn = (x, y) =>
    spawns.some((sp) => sp && sp.x === x && sp.y === y);
  const goodColor = (c) => Number.isInteger(c) && c >= 0 && c < COLORS;

  const breach = {
    bad_status: !STATUSES.includes(s.status),
    player_in_wall: inWall(mapTile(tiles, player.x, player.y)),
    carry_overflow: carried.length > CARRY_MAX,
    lives_range: !Number.isInteger(s.lives) || s.lives < 0 || s.lives > START_LIVES,
    score_negative: !Number.isInteger(s.score) || s.score < 0,
    patch_off_spawn: patches.some((p) => !(p && onSpawn(p.x, p.y))),
    drift_in_wall: drifts.some((d) => inWall(mapTile(tiles, d && d.x, d && d.y))),
    bad_color:
      carried.some((c) => !goodColor(c)) ||
      patches.some((p) => !(p && goodColor(p.color))),
  };

  return CODES.filter((code) => breach[code]);
}
