// The autopilot of Quorum Run (DESIGN.md §9): botInput(state) returns one
// input for the state, pure and deterministic. It plays well: it fetches
// patches, merges them on a pad, avoids the drifts, and takes the exit
// once the level's quorum is met. Path-finding runs two breadth-first
// searches over the grid: first one that never steps near a drift, then
// one that may, preferring never to lose a patch or a life.

import { CLOCKWISE, DIRS } from './constants.js';

const IDLE = { move: null, pause: false };

// The cells a drift could be on next tick: its own cell and, when the
// drift could move there (no wall, no hold, never the exit), each of its
// four neighbours. Stepping onto those is allowed but avoided.
export function softDanger(state) {
  const tiles = state.level.tiles;
  const height = tiles.length;
  const width = height > 0 ? tiles[0].length : 0;
  const soft = new Set();
  const inside = (x, y) => y >= 0 && y < height && x >= 0 && x < width;
  const openToDrift = (x, y) => {
    if (!inside(x, y)) return false;
    const t = tiles[y][x];
    return t !== '#' && t !== 'H' && t !== 'X';
  };
  for (const d of state.drifts) {
    for (const dir of CLOCKWISE) {
      const x = d.x + DIRS[dir][0];
      const y = d.y + DIRS[dir][1];
      if (openToDrift(x, y)) soft.add(y * width + x);
    }
    if (state.conflicts.some((c) => c.x === d.x && c.y === d.y)) continue;
    soft.delete(d.y * width + d.x);
  }
  return soft;
}

// Where the bot wants to be, cheapest goal first: the exit once the level
// is open, else a merge pad when carrying, else the nearest patch.
export function goalsFor(state) {
  const tiles = state.level.tiles;
  const width = tiles.length > 0 ? tiles[0].length : 0;
  const out = [];
  if (state.open) {
    for (let y = 0; y < tiles.length; y++) {
      for (let x = 0; x < width; x++) if (tiles[y][x] === 'X') out.push({ x, y });
    }
    return out;
  }
  if (state.carried.length > 0) {
    for (let y = 0; y < tiles.length; y++) {
      for (let x = 0; x < width; x++) if (tiles[y][x] === 'M') out.push({ x, y });
    }
    return out;
  }
  for (const p of state.patches) out.push({ x: p.x, y: p.y });
  return out;
}

// The first move along a shortest path to any of the goals. `blocked`
// cells are walls, conflicts, drifts and (while closed) holds and the
// exit; `soft` cells inside may be crossed only when `avoidSoft` says so.
function firstStep(state, goals, blocked, soft, avoidSoft) {
  const tiles = state.level.tiles;
  const height = tiles.length;
  const width = height > 0 ? tiles[0].length : 0;
  if (width === 0) return null;
  const key = (x, y) => y * width + x;
  const player = state.player;
  const start = key(player.x, player.y);
  const goalSet = new Set(goals.map((g) => key(g.x, g.y)));
  if (goalSet.has(start)) return null;
  const parent = new Map();
  let frontier = [start];
  const seen = new Set([start]);
  while (frontier.length > 0) {
    const next = [];
    for (const at of frontier) {
      const x = at % width;
      const y = (at - x) / width;
      for (const dir of CLOCKWISE) {
        const nx = x + DIRS[dir][0];
        const ny = y + DIRS[dir][1];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nk = ny * width + nx;
        if (seen.has(nk)) continue;
        if (blocked.has(nk) && !soft.has(nk)) continue;
        if (avoidSoft && soft.has(nk)) continue;
        seen.add(nk);
        parent.set(nk, at);
        if (goalSet.has(nk)) {
          // Walk the parent chain back to the cell after the player's.
          let step = nk;
          while (parent.get(step) !== start) step = parent.get(step);
          const sx = step % width;
          const sy = (step - sx) / width;
          const dx = sx - player.x;
          const dy = sy - player.y;
          for (const d of CLOCKWISE) {
            if (DIRS[d][0] === dx && DIRS[d][1] === dy) return d;
          }
          return null;
        }
        next.push(nk);
      }
    }
    frontier = next;
  }
  return null;
}

export function botInput(state) {
  if (!state || !state.level || state.status !== 'playing') return IDLE;
  const tiles = state.level.tiles;
  const height = tiles.length;
  const width = height > 0 ? tiles[0].length : 0;
  if (width === 0) return IDLE;
  const blocked = new Set();
  for (let y = 0; y < height; y++) {
    const row = tiles[y];
    for (let x = 0; x < width; x++) {
      const t = row[x];
      if (t === '#') blocked.add(y * width + x);
      else if ((t === 'H' || t === 'X') && !state.open) blocked.add(y * width + x);
    }
  }
  for (const c of state.conflicts) blocked.add(c.y * width + c.x);
  const soft = softDanger(state);
  for (const d of state.drifts) blocked.add(d.y * width + d.x);
  const goals = goalsFor(state);
  // Path plan: quietly, then — only if that is stuck — braving danger,
  // which may cost a patch or a life when the level is otherwise boxed.
  const cautious = firstStep(state, goals, blocked, soft, true);
  return { move: cautious ?? firstStep(state, goals, blocked, soft, false), pause: false };
}
