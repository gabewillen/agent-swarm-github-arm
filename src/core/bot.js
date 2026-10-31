// The autopilot (DESIGN.md §9). Pure and deterministic: it reads one
// state and returns one input — fetch patches, merge on a pad, dodge
// drifts and conflicts, and ship through the exit once it is open.
//
// The bot plans with breadth-first walks over the grid. A walk knows the
// rules the player walks under: walls, holds and the closed exit block,
// conflicts block for their life, and a drift cell is deadly to touch.
// Drifts move on every driftPeriod-th tick, so the bot predicts which
// cells a drift may hold on the tick this input causes and keeps its path
// off those cells; when every strict path is gone, it walks the plain
// one — a dropped patch beats standing in front of a drift.

import { CARRY_MAX } from './constants.js';

const DIRS = [['up', 0, -1], ['right', 1, 0], ['down', 0, 1], ['left', -1, 0]];

// The first step of a breadth-first walk to the first cell that fits the
// goal, or null when none is reachable. `banned` lists extra cells the
// walk must leave free; closed exit and hold, wall, and conflict cells
// are always out.
function stepToward(state, isGoal, banned) {
  const { width, height, tiles } = state.level;
  const open = state.open;
  const conflicts = new Set();
  for (const c of state.conflicts) conflicts.add(c.y * width + c.x);
  const walkable = (x, y) => {
    const row = tiles[y];
    const t = row ? row[x] : '#';
    if (t === '#' || t === undefined) return false;
    if ((t === 'X' || t === 'H') && !open) return false;
    if (conflicts.has(y * width + x)) return false;
    if (banned.has(y * width + x)) return false;
    return true;
  };
  const start = state.player;
  const startKey = start.y * width + start.x;
  const parents = new Map(); // key -> { from, dir }
  const seen = new Set([startKey]);
  let goalKey = null;
  let frontier = [startKey];
  while (frontier.length > 0 && goalKey === null) {
    const next = [];
    for (const key of frontier) {
      const x = key % width;
      const y = (key - x) / width;
      for (const [dir, dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nKey = ny * width + nx;
        if (seen.has(nKey) || !walkable(nx, ny)) continue;
        seen.add(nKey);
        parents.set(nKey, { from: key, dir });
        if (isGoal(nx, ny)) {
          goalKey = nKey;
          break;
        }
        next.push(nKey);
      }
      if (goalKey !== null) break;
    }
    frontier = next;
  }
  if (goalKey === null) return null;
  let cur = goalKey;
  while (parents.get(cur).from !== startKey) cur = parents.get(cur).from;
  return parents.get(cur).dir;
}

// The cells a drift may hold when the tick this input causes moves the
// drifts: each drift keeps its current cell or steps one in its first
// passable direction clockwise (§6 step 10). Off the drift ticks drifts
// hold still, so only their own cells are dangerous.
function driftThreats(state) {
  const { width, height, tiles, driftPeriod } = state.level;
  const threats = new Set();
  for (const d of state.drifts) threats.add(d.y * width + d.x);
  const willMove = (state.tick + 1) % driftPeriod === 0;
  if (!willMove) return threats;
  for (const d of state.drifts) {
    for (let j = 0; j < 4; j++) {
      const i = DIRS.findIndex((e) => e[0] === d.dir);
      const next = DIRS[(i + j) % 4];
      const nx = d.x + next[1];
      const ny = d.y + next[2];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const row = tiles[ny];
      const t = row ? row[nx] : '#';
      if (t === '#' || t === 'X' || t === 'H' || t === undefined) continue;
      threats.add(ny * width + nx);
      break;
    }
  }
  return threats;
}

export function botInput(state) {
  const { width, height, tiles } = state.level;
  const tileAt = (x, y) => {
    const row = tiles[y];
    return row ? row[x] : '#';
  };
  const mergePads = new Set();
  const lyingPatches = new Set();
  let exitKey = null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = y * width + x;
      if (tiles[y][x] === 'M') mergePads.add(key);
      else if (tiles[y][x] === 'X') exitKey = key;
    }
  }
  for (const p of state.patches) lyingPatches.add(p.y * width + p.x);

  const threats = driftThreats(state);
  const chase = (isGoal) => stepToward(state, isGoal, threats)
    ?? stepToward(state, isGoal, new Set());

  // A member of the merge pads or the exit, whichever the plan needs.
  let move = null;
  if (state.open && exitKey !== null) {
    // Ship: the exit is open, walk to it.
    move = chase((x, y) => y * width + x === exitKey);
  } else if (state.carried.length >= CARRY_MAX || (state.carried.length > 0 && state.patches.length === 0)) {
    // Hands full (or nothing left to fetch): take what we carry to a pad.
    move = chase((x, y) => mergePads.has(y * width + x));
  } else if (state.patches.length > 0) {
    // Fetch: the nearest lying patch the walk reaches first.
    move = chase((x, y) => lyingPatches.has(y * width + x));
    if (move === null && state.carried.length > 0) {
      move = chase((x, y) => mergePads.has(y * width + x));
    }
  } else {
    // Nothing lying and nothing carried: wait at a pad for the spawns.
    move = chase((x, y) => mergePads.has(y * width + x));
  }
  return { move, pause: false };
}
