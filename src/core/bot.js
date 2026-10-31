// DESIGN.md §9: botInput(state) returns { move, pause: false } for the state.
// Pure and deterministic with no hidden state: it reads only what it is given
// and rebuilds its whole picture from the state on every call.
//
// How it plays. Drifts move on a fixed schedule with no randomness, so the bot
// simulates them forward for HORIZON ticks and plans paths that only arrive on
// a cell at a tick no drift will be there (and never head-on through one).
// Every move it is about to return is re-checked against an exact one-step
// simulation of §6, so it never walks into a wall, a closed hold, an open
// conflict-timed cell a drift is about to occupy, or a swap with a drift.
// Empty-handed it fetches the nearest patch (holding one or two it keeps
// fetching while that is no worse than the merge pad), full-handed it merges,
// and once the quorum is met it rides the exit.

import { CARRY_MAX, CONFLICT_TICKS, CLOCKWISE, DIRS } from './constants.js';

const HORIZON = 36;  // ticks of drift lookahead
const SLACK = 14;    // extra waiting allowed per cell in the planned path
const BUDGET = 60000; // relaxations before a search gives up

// --- geometry helpers -------------------------------------------------------

function tileOf(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

function dims(state) {
  const tiles = state.level.tiles;
  const width = state.level.width ?? (tiles[0] ? tiles[0].length : 0);
  const height = state.level.height ?? tiles.length;
  return { width, height };
}

// Passable to the player: not a wall; a hold or the exit only when open (§6.6).
function passable(state, x, y) {
  const ch = tileOf(state, x, y);
  if (ch === '#') return false;
  if ((ch === 'H' || ch === 'X') && !state.open) return false;
  return true;
}

// Passable to a drift: holds and the exit never are, open or not (§6.10).
function driftPassable(state, x, y, conflicts) {
  const ch = tileOf(state, x, y);
  if (ch === '#' || ch === 'H' || ch === 'X') return false;
  for (const c of conflicts) {
    if (c.x === x && c.y === y && c.ttl >= 1) return false;
  }
  return true;
}

function conflictBlocked(conflicts, x, y, tick) {
  for (const c of conflicts) {
    if (c.x === x && c.y === y && c.ttl - tick >= 1) return true;
  }
  return false;
}

// --- drift futures ----------------------------------------------------------

// Simulate the drifts of §6.10–11 forward for horizon steps from the state.
// Returns futures[k]: the drift positions after k steps (index-aligned with
// state.drifts, in array order). Collisions, reversals and the conflicts they
// leave behind are modelled too, since later drift moves walk around them.
function driftFutures(state, horizon) {
  const period = Math.max(1, state.level.driftPeriod | 0);
  const tick = state.tick | 0;
  let drifts = (state.drifts ?? []).map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  let conflicts = (state.conflicts ?? []).map((c) => ({ x: c.x, y: c.y, ttl: c.ttl }));
  const futures = [drifts.map((d) => ({ x: d.x, y: d.y }))];
  for (let k = 1; k <= horizon; k++) {
    // Step 5: conflicts age one tick and the ones at 0 go.
    conflicts = conflicts
      .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }))
      .filter((c) => c.ttl >= 1);
    if ((tick + k) % period === 0) {
      // Step 10: each drift takes the first passable direction clockwise.
      const moved = [];
      for (const d of drifts) {
        let placed = null;
        const start = CLOCKWISE.indexOf(d.dir);
        for (let i = 0; i < 4; i++) {
          const dir = CLOCKWISE[(start + i) % 4];
          const [dx, dy] = DIRS[dir];
          const nx = d.x + dx;
          const ny = d.y + dy;
          if (driftPassable(state, nx, ny, conflicts)) {
            placed = { x: nx, y: ny, dir };
            break;
          }
        }
        moved.push(placed ?? { x: d.x, y: d.y, dir: d.dir });
      }
      // Step 11: two or more drifts on a cell reverse and leave a conflict.
      const byCell = new Map();
      for (const d of moved) {
        const key = d.y * 64 + d.x;
        const list = byCell.get(key);
        if (list) list.push(d); else byCell.set(key, [d]);
      }
      const fresh = [];
      for (const [key, list] of byCell) {
        if (list.length >= 2) {
          for (const d of list) {
            d.dir = CLOCKWISE[(CLOCKWISE.indexOf(d.dir) + 2) % 4];
          }
          fresh.push(key);
        }
      }
      for (const key of fresh) {
        const x = key & 63;
        const y = key >> 6;
        if (!conflicts.some((c) => c.x === x && c.y === y)) {
          conflicts.push({ x, y, ttl: CONFLICT_TICKS });
        }
      }
      drifts = moved;
    }
    futures.push(drifts.map((d) => ({ x: d.x, y: d.y })));
  }
  return futures;
}

// --- one-step outcome -------------------------------------------------------

// Would the step §6 runs from this state with this input hit the player?
// Conflicts age before the player moves, so a conflict with ttl 1 is gone when
// the player arrives. A move onto an open exit ends the level there, before
// the drifts step. invuln > 0 covers the whole step.
function stepSafe(state, move, futures) {
  const px = state.player.x;
  const py = state.player.y;
  const nx = move == null ? px : px + DIRS[move][0];
  const ny = move == null ? py : py + DIRS[move][1];
  if (move != null) {
    if (!passable(state, nx, ny)) return false;
    for (const c of state.conflicts) {
      if (c.x === nx && c.y === ny && c.ttl > 1) return false;
    }
  }
  if (state.open && tileOf(state, nx, ny) === 'X') return true;
  if (state.invuln > 0) return true;
  const after = futures[1];
  for (const d of after) {
    if (d.x === nx && d.y === ny) return false;
  }
  if (move != null) {
    const before = futures[0];
    for (let i = 0; i < after.length; i++) {
      if (before[i].x === nx && before[i].y === ny
        && after[i].x === px && after[i].y === py) return false;
    }
  }
  return true;
}

// --- search -----------------------------------------------------------------

// One BFS over the grid that every consumer shares: distance from the player
// to every cell (walkable terrain with closed holds and conflicts as walls),
// plus the move and cell each distance was reached through.
function bfsDists(state) {
  const { width, height } = dims(state);
  const n = width * height;
  const dist = new Int32Array(n).fill(-1);
  const parentMove = new Array(n).fill(null);
  const parentCell = new Int32Array(n).fill(-1);
  const player = state.player.y * width + state.player.x;
  const blocked = (x, y) => {
    if (!passable(state, x, y)) return true;
    for (const c of state.conflicts) {
      if (c.x === x && c.y === y && c.ttl >= 1) return true;
    }
    return false;
  };
  dist[player] = 0;
  const queue = [player];
  for (let head = 0; head < queue.length; head++) {
    const from = queue[head];
    const x = from % width;
    const y = (from - x) / width;
    for (const move of CLOCKWISE) {
      const nx = x + DIRS[move][0];
      const ny = y + DIRS[move][1];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (blocked(nx, ny)) continue;
      const to = ny * width + nx;
      if (dist[to] !== -1) continue;
      dist[to] = dist[from] + 1;
      parentMove[to] = move;
      parentCell[to] = from;
      queue.push(to);
    }
  }
  return { dist, parentMove, parentCell, width, height };
}

// The nearest reachable cell of a goal set (ties in reading order), and the
// move that starts the walk to it.
function bfsRoute(state, bfs, cells) {
  const { dist, parentMove, parentCell, width } = bfs;
  let best = -1;
  for (const c of cells) {
    const i = c.y * width + c.x;
    if (i < 0 || i >= dist.length) continue;
    if (dist[i] === -1) continue;
    if (best === -1 || dist[i] < dist[best]) best = i;
  }
  if (best === -1) return { path: null, dist: Infinity };
  const path = [];
  for (let at = best; dist[at] > 0; at = parentCell[at]) path.push(parentMove[at]);
  path.reverse();
  return { path, dist: dist[best] };
}

// Time-aware path: a timed BFS where a cell is only walkable at a tick no
// drift will be on it (head-on swaps included), and only for a while past the
// first arrival so waiting stays cheap. Waits appear in the path as nulls.
function timedPath(state, futures, cells) {
  const { width, height } = dims(state);
  const px = state.player.x;
  const py = state.player.y;
  if (cells.some((c) => c.x === px && c.y === py)) return [];
  const period = Math.max(1, state.level.driftPeriod | 0);
  const conflicts = state.conflicts ?? [];
  const invuln = state.invuln | 0;
  const earliest = new Int32Array(width * height).fill(1 << 20);
  const seen = new Uint8Array((HORIZON + 1) * width * height);
  const parent = new Map();
  const keyOf = (x, y, t) => t * width * height + y * width + x;
  const queue = [{ x: px, y: py, t: 0, k: keyOf(px, py, 0) }];
  seen[queue[0].k] = 1;
  earliest[py * width + px] = 0;
  let relax = 0;
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    if (node.t >= HORIZON) continue;
    const immune = invuln - node.t > 0;
    for (let e = 0; e < 5; e++) {
      const move = e < 4 ? CLOCKWISE[e] : null;
      const nx = move == null ? node.x : node.x + DIRS[move][0];
      const ny = move == null ? node.y : node.y + DIRS[move][1];
      const nt = node.t + 1;
      if (move != null) {
        if (!passable(state, nx, ny)) continue;
        if (conflictBlocked(conflicts, nx, ny, nt)) continue;
      }
      const endsLevel = state.open && tileOf(state, nx, ny) === 'X';
      let arrived = false;
      for (const c of cells) {
        if (c.x === nx && c.y === ny) { arrived = true; break; }
      }
      if (!immune && !(arrived && endsLevel)) {
        const pos = futures[nt];
        let shadowed = false;
        for (const d of pos) {
          if (d.x === nx && d.y === ny) { shadowed = true; break; }
        }
        if (shadowed) continue;
        if ((state.tick + nt) % period === 0) {
          const prev = futures[node.t];
          for (let i = 0; i < pos.length; i++) {
            if (prev[i].x === nx && prev[i].y === ny
              && pos[i].x === node.x && pos[i].y === node.y) {
              shadowed = true;
              break;
            }
          }
          if (shadowed) continue;
        }
      }
      if (arrived) {
        const path = [];
        for (let at = node.k; parent.has(at); at = parent.get(at)[0]) {
          path.push(parent.get(at)[1]);
        }
        path.reverse();
        path.push(move);
        return path;
      }
      const cell = ny * width + nx;
      if (nt < earliest[cell]) earliest[cell] = nt;
      else if (nt - earliest[cell] > SLACK) continue;
      const k = keyOf(nx, ny, nt);
      if (seen[k]) continue;
      seen[k] = 1;
      parent.set(k, [node.k, move]);
      queue.push({ x: nx, y: ny, t: nt, k });
      if (++relax > BUDGET) return null;
    }
  }
  return null;
}

// --- goals and the choice ---------------------------------------------------

function cellsOf(state, ch) {
  const { width, height } = dims(state);
  const out = [];
  for (let y = 0; y < height; y++) {
    const row = state.level.tiles[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === ch) out.push({ x, y });
    }
  }
  return out;
}

// Choose what the state calls for: the exit once it is open, the merge pad
// with full hands, the nearest patch while a fetch is no worse than merging,
// or nothing (which just means stand there and stay out of harm's way).
function pickGoal(state, bfs) {
  if (state.open) {
    const cells = cellsOf(state, 'X');
    return cells.length > 0 ? { kind: 'exit', cells } : { kind: 'wait', cells: [] };
  }
  const pads = cellsOf(state, 'M');
  const carriedNow = state.carried.length;
  if (carriedNow >= CARRY_MAX) {
    return pads.length > 0 ? { kind: 'merge', cells: pads } : { kind: 'wait', cells: [] };
  }
  const patchCells = state.patches.map((p) => ({ x: p.x, y: p.y }));
  if (carriedNow > 0) {
    if (patchCells.length > 0) {
      const patch = bfsRoute(state, bfs, patchCells);
      const pad = bfsRoute(state, bfs, pads);
      if (patch.dist < pad.dist) return { kind: 'fetch', cells: patchCells };
      return { kind: 'merge', cells: pads };
    }
    return { kind: 'merge', cells: pads };
  }
  if (patchCells.length > 0) {
    const patch = bfsRoute(state, bfs, patchCells);
    if (Number.isFinite(patch.dist)) return { kind: 'fetch', cells: patchCells };
  }
  return { kind: 'wait', cells: [] };
}

function chooseMove(state, futures, path) {
  const seen = new Set();
  const ordered = [];
  if (path && path.length > 0) ordered.push(path[0]);
  ordered.push(null);
  for (const move of CLOCKWISE) ordered.push(move);
  for (const move of ordered) {
    if (seen.has(move)) continue;
    seen.add(move);
    if (stepSafe(state, move, futures)) return move;
  }
  // No safe move: take a drop over a life when carrying, else any legal move.
  const desperate = [];
  if (path && path.length > 0) desperate.push(path[0]);
  for (const move of CLOCKWISE) desperate.push(move);
  desperate.push(null);
  for (const move of desperate) {
    if (move == null) return move;
    if (passable(state, state.player.x + DIRS[move][0], state.player.y + DIRS[move][1])) return move;
  }
  return null;
}

export function botInput(state) {
  if (!state || state.status !== 'playing' || !state.level) {
    return { move: null, pause: false };
  }
  const futures = driftFutures(state, HORIZON);
  const bfs = bfsDists(state);
  const goal = pickGoal(state, bfs);
  let path = null;
  if (goal.kind !== 'wait') {
    path = timedPath(state, futures, goal.cells);
    if (path == null) path = bfsRoute(state, bfs, goal.cells).path;
  }
  return { move: chooseMove(state, futures, path), pause: false };
}
