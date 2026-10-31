// §9 The bot — the autopilot that plays the game.
//
// botInput(state) returns the input `{ move, pause: false }` for one step,
// a pure function of the state: it reads nothing but the state and writes
// nothing anywhere. It plays well: it walks to the nearest patch it can
// reach safely, carries up to CARRY_MAX of them, merges on a pad, ships
// through the exit once the quorum is landed, and dodges drifts and
// conflicts by path-finding over the grid (breadth-first search).
//
// Everything here is grid math in reading order: cell `i` is
// `(i % width, floor(i / width))` of the level's tiles.

import { DIRS, CLOCKWISE, CARRY_MAX } from './constants.js';

const WAIT = { move: null, pause: false };
const DIR_COUNT = CLOCKWISE.length;

// A drift's direction order starts at its own dir, reading CLOCKWISE from
// there: its own direction first, then each next direction clockwise.
function turnOrder(dir) {
  const i = CLOCKWISE.indexOf(dir);
  return i < 0 ? CLOCKWISE : CLOCKWISE.slice(i).concat(CLOCKWISE.slice(0, i));
}

// The terrain character of a cell, '#' off the map, as tileAt does.
function tileAt(state, x, y) {
  const level = state.level;
  const row = level && level.tiles ? level.tiles[y] : undefined;
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

// Passable to the player: not a wall, not a hold or the exit unless open
// (§6 step 6). Conflicts and drift hits are handled separately.
function walkable(state, x, y, open) {
  const t = tileAt(state, x, y);
  if (t === '#') return false;
  if (t === 'H' || t === 'X') return open;
  return true;
}

// Cells a conflict blocks this step. Step 5 ages every conflict by one and
// removes those at 0, so a conflict at ttl 1 is gone before the player or
// a drift could step there next step: only those at ttl 2 and up block.
function conflictBlocked(state, w, h) {
  const blocked = new Uint8Array(w * h);
  for (const c of state.conflicts || []) {
    if (c && c.ttl > 1 && c.x >= 0 && c.y >= 0 && c.x < w && c.y < h) {
      blocked[c.y * w + c.x] = 1;
    }
  }
  return blocked;
}

// Exactly where each drift will be after the next step: each tries its
// own direction, then each next clockwise, moving to the first target
// passable to a drift — not a wall, not a hold, not the exit (open or
// not), and no conflict on it (§6 step 10). Drifts ignore everything else.
function planDrifts(state, w, h, conflict) {
  const plan = [];
  for (const d of state.drifts || []) {
    if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;
    let cell = d.y * w + d.x;
    let nx = d.x;
    let ny = d.y;
    for (const dir of turnOrder(d.dir)) {
      const off = DIRS[dir];
      if (!off) continue;
      const tx = d.x + off[0];
      const ty = d.y + off[1];
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
      const t = tileAt(state, tx, ty);
      if (t === '#' || t === 'H' || t === 'X') continue;
      if (conflict[ty * w + tx]) continue;
      nx = tx;
      ny = ty;
      break;
    }
    plan.push({ x: d.x, y: d.y, cell, nx, ny, ncell: ny * w + nx });
  }
  return plan;
}

// Hit zones for the step we are planning, per drift (§6 step 12):
// - a drift that stays on its cell is fatal to stand on;
// - on a tick when drifts move, so is the cell it lands on;
// - a drift leaving its cell is only fatal to step into when it would
//   swap with the player (it then ends up where the player stood):
//   following a drift into the cell it vacates is safe otherwise.
function dangerMap(w, h, plan, driftsMove, playerCell) {
  const danger = new Uint8Array(w * h);
  for (const d of plan) {
    if (d.ncell === d.cell) danger[d.cell] = 1;
    if (driftsMove) {
      danger[d.ncell] = 1;
      if (d.ncell === playerCell) danger[d.cell] = 1;
    }
  }
  return danger;
}

// Breadth-first search from one cell over the cells it may stand on this
// step: blockers are walls, closed holds and exits, conflicts, and extra
// cells given in `avoid` (drift danger, merge pads). Returns, per cell,
// its distance and the first move (a DIR_COUNT index, -1 unknown) of one
// shortest path to it, so the first step of any path is the input to give.
function bfs(state, w, h, sx, sy, open, blocked, avoid) {
  const n = w * h;
  const dist = new Int32Array(n).fill(-1);
  const first = new Int32Array(n).fill(-1);
  const start = sy * w + sx;
  dist[start] = 0;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cell = queue[qi];
    const layer = dist[cell];
    const cx = cell % w;
    const cy = (cell - cx) / w;
    for (let di = 0; di < DIR_COUNT; di++) {
      const dir = CLOCKWISE[di];
      const off = DIRS[dir];
      if (!off) continue;
      const nx = cx + off[0];
      const ny = cy + off[1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (dist[ni] !== -1) continue;
      if (!walkable(state, nx, ny, open)) continue;
      if (blocked[ni] || (avoid && avoid[ni])) continue;
      dist[ni] = layer + 1;
      first[ni] = layer === 0 ? di : first[cell];
      queue.push(ni);
    }
  }
  return { dist, first };
}

// The first move toward the nearest cell of `targets` the search reached:
// a DIR_COUNT index, -1 when the search started on a target (hold still),
// or null when no target was reached. Ties prefer a smaller first move
// (CLOCKWISE order), then the earlier cell in reading order.
function toward(targets, search) {
  let best = null;
  for (const t of targets) {
    if (t == null || search.dist[t] < 0) continue;
    if (best === null) {
      best = t;
      continue;
    }
    if (search.dist[t] < search.dist[best] ||
        (search.dist[t] === search.dist[best] &&
         (search.first[t] < search.first[best] ||
          (search.first[t] === search.first[best] && t < best)))) {
      best = t;
    }
  }
  if (best === null) return null;
  if (search.dist[best] === 0) return -1;
  return search.first[best];
}

function inputFor(dirIndex) {
  const move = dirIndex >= 0 && dirIndex < DIR_COUNT ? CLOCKWISE[dirIndex] : null;
  return { move, pause: false };
}

// Every cell of a terrain character, in reading order. `state.level.tiles`
// holds no '@', 'P', or drift characters (§4), so each uses tileAt.
function cellsOf(state, w, h, ch) {
  const cells = [];
  const level = state.level;
  for (let y = 0; y < h; y++) {
    const row = level.tiles[y];
    if (row === undefined) continue;
    for (let x = 0; x < w && x < row.length; x++) {
      if (row[x] === ch) cells.push(y * w + x);
    }
  }
  return cells;
}

export function botInput(state) {
  if (!state || state.status !== 'playing' || state.paused) return WAIT;
  const level = state.level;
  if (!level || !level.tiles || !level.width || !level.height) return WAIT;
  const player = state.player;
  if (!player || typeof player.x !== 'number' || typeof player.y !== 'number') return WAIT;
  const w = level.width;
  const h = level.height;
  if (player.x < 0 || player.y < 0 || player.x >= w || player.y >= h) return WAIT;
  const open = !!state.open;

  const conflict = conflictBlocked(state, w, h);
  const period = level.driftPeriod > 0 ? level.driftPeriod : 1;
  const tick = Number.isInteger(state.tick) ? state.tick : 0;
  const willMove = ((tick + 1) % period) === 0;
  const plan = planDrifts(state, w, h, conflict);
  const playerCell = player.y * w + player.x;
  const danger = dangerMap(w, h, plan, willMove, playerCell);

  // Where we want to go, most valuable first. The searches all avoid
  // conflicts; they differ in avoiding drift hit zones (safe) and merge
  // pads (unwanted while carrying: stepping on one merges early).
  const exitCells = open ? cellsOf(state, w, h, 'X') : [];
  const padCells = cellsOf(state, w, h, 'M');
  const padMiss = new Uint8Array(w * h);
  for (const p of padCells) padMiss[p] = 1;
  const carried = [];
  for (const c of state.carried || []) if (typeof c === 'number') carried.push(c);
  const hands = carried.length;
  const patchCells = [];
  for (const p of state.patches || []) {
    if (p && typeof p.x === 'number' && typeof p.y === 'number' &&
        p.x >= 0 && p.y >= 0 && p.x < w && p.y < h) {
      patchCells.push(p.y * w + p.x);
    }
  }

  const safeSearch = bfs(state, w, h, player.x, player.y, open, conflict, danger);

  // Picks the move toward the nearest cell of `cells`, optionally for a
  // search that also shuns `avoid` cells (merge pads, while carrying:
  // stepping on one merges early).
  const go = (cells, avoid) => {
    if (!cells.length) return null;
    const s = avoid
      ? bfs(state, w, h, player.x, player.y, open, conflict, avoid)
      : safeSearch;
    const dir = toward(cells, s);
    return dir === null ? null : inputFor(dir);
  };

  // Cells to hold position on while a spawn point is free: next to one,
  // never on it (standing on a free spawn point keeps patches off it).
  function spawnWatch() {
    const lying = new Set(patchCells);
    const spawnCells = new Set();
    for (const sp of level.spawns || []) {
      if (sp && typeof sp.x === 'number' && typeof sp.y === 'number' &&
          sp.x >= 0 && sp.y >= 0 && sp.x < w && sp.y < h) {
        spawnCells.add(sp.y * w + sp.x);
      }
    }
    const targets = [];
    const seen = new Set();
    for (const sp of level.spawns || []) {
      if (!sp || typeof sp.x !== 'number' || typeof sp.y !== 'number') continue;
      if (sp.x < 0 || sp.y < 0 || sp.x >= w || sp.y >= h) continue;
      const si = sp.y * w + sp.x;
      if (lying.has(si)) continue;
      for (let di = 0; di < DIR_COUNT; di++) {
        const off = DIRS[CLOCKWISE[di]];
        const nx = sp.x + off[0];
        const ny = sp.y + off[1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (spawnCells.has(ni)) continue; // never camp on a spawn point
        if (seen.has(ni)) continue;
        seen.add(ni);
        targets.push(ni);
      }
    }
    return targets;
  }

  const watchedSpawns = () => go(spawnWatch(), null);

  // 1. The quorum is landed: ship the level through the exit.
  if (exitCells.length) {
    const input = go(exitCells, null);
    if (input) return input;
  }
  // 2. Full hands: merge.
  if (hands >= CARRY_MAX && padCells.length) {
    const input = go(padCells, null);
    if (input) return input;
  }
  // 3. Part hands: prefer filling up on a patch the safe route to which
  //    crosses no pad; with no such route, merge what we hold.
  if (hands > 0 && hands < CARRY_MAX) {
    if (patchCells.length) {
      const input = go(patchCells, padMiss);
      if (input) return input;
    }
    if (padCells.length) {
      const merge = go(padCells, null);
      if (merge) return merge;
    }
  }
  // 5. Empty hands: go to a patch.
  if (hands === 0 && patchCells.length) {
    const input = patchCells.some((p) => safeSearch.dist[p] >= 0)
      ? go(patchCells, null)
      : null;
    if (input) return input;
  }
  // 6. Nothing to fetch on the board: hold position near a free spawn
  //    point and wait for one to appear.
  if ((hands === 0 || !patchCells.length) && (level.spawns || []).length) {
    const input = watchedSpawns();
    if (input) return input;
  }

  // 7. Nothing useful is safely reachable: hold still…
  if (!danger[playerCell]) return WAIT;

  // 8. …unless a drift is about to land on the player: step out of the
  //    hit zone, first toward the drift-free neighbour with the most
  //    elbow room, and never onto a conflict.
  let bestDir = -1;
  let bestScore = -1;
  for (let di = 0; di < DIR_COUNT; di++) {
    const dir = CLOCKWISE[di];
    const off = DIRS[dir];
    const nx = player.x + off[0];
    const ny = player.y + off[1];
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    if (!walkable(state, nx, ny, open)) continue;
    const ni = ny * w + nx;
    if (conflict[ni]) continue;
    let room = Infinity;
    for (const d of plan) {
      room = Math.min(room, Math.abs(nx - d.x) + Math.abs(ny - d.y),
        Math.abs(nx - d.nx) + Math.abs(ny - d.ny));
    }
    const score = (danger[ni] ? 0 : 1000) + room;
    if (score > bestScore) {
      bestScore = score;
      bestDir = di;
    }
  }
  if (bestDir < 0) return WAIT;
  return inputFor(bestDir);
}
