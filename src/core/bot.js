// The autopilot of Quorum Run (DESIGN.md §9). Pure and deterministic: it
// reads the state only and plans one step — over the walkable grid with a
// weighted shortest path whose extra-weight cells are the ones a drift
// could reach soon, so drift avoidance only ever bends the route, never
// blocks it. Targets, in priority: the open exit while empty-handed, the
// merge pad with full hands, the nearest reachable patch, the merge pad
// with anything in hand, and holding a safe position otherwise.

import { CARRY_MAX, CLOCKWISE, DIRS } from './constants.js';

const IDLE = { move: null, pause: false };
const MOVES = ['up', 'right', 'down', 'left'];
// The cost of a step onto a cell a drift could be on next tick: enough
// that a long safe detour beats a short risky one.
const RISK = 4096;
const SAFE = Number.MAX_SAFE_INTEGER;

// The level's terrain character at a cell, '#' outside the map (§5).
function tileChar(state, x, y) {
  const tiles = state.level && state.level.tiles;
  if (!tiles || y < 0 || y >= tiles.length) return '#';
  const row = tiles[y];
  if (x < 0 || x >= row.length) return '#';
  return row[x];
}

// Whether a conflict sits on a cell.
function conflictAt(conflicts, x, y) {
  return conflicts.some((c) => c.x === x && c.y === y);
}

// A cell the player may walk onto (§6.6): no wall, no hold nor closed
// exit, and no conflict on it.
function passable(state, x, y) {
  const t = tileChar(state, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !state.open) return false;
  return !conflictAt(state.conflicts, x, y);
}

// The cells drifts could be on after their next move (their own cells,
// and, on a tick their period divides, the cell §6.10 turns each one to,
// over conflicts as the next step ages them).
function driftSpots(state) {
  const spots = new Set();
  for (const d of state.drifts) spots.add(`${d.x},${d.y}`);
  if ((state.tick + 1) % state.level.driftPeriod !== 0) return spots;
  const aged = [];
  for (const c of state.conflicts) if (c.ttl > 1) aged.push(c);
  for (const drift of state.drifts) {
    const at = CLOCKWISE.indexOf(drift.dir);
    for (let k = 0; k < 4; k++) {
      const x = drift.x + DIRS[CLOCKWISE[(at + k) % 4]][0];
      const y = drift.y + DIRS[CLOCKWISE[(at + k) % 4]][1];
      const t = tileChar(state, x, y);
      if (t === '#' || t === 'H' || t === 'X') continue;
      if (conflictAt(aged, x, y)) continue;
      spots.add(`${x},${y}`);
      break;
    }
  }
  return spots;
}

// A map-wide weighted shortest path from the player. Every walkable cell
// costs one step; a cell a drift could reach next costs RISK on top. The
// neighbours sweep in fixed direction order, so routes are deterministic.
function routeMap(state, spots) {
  const w = state.level.width;
  const h = state.level.height;
  const start = state.player.y * w + state.player.x;
  const dist = new Array(w * h).fill(Infinity);
  const prev = new Array(w * h).fill(-1);
  dist[start] = 0;
  // A lazy binary heap of [cost, cell]: stale entries are skipped.
  const heap = [[0, start]];
  const push = (cost, cell) => {
    heap.push([cost, cell]);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      const a = heap[parent];
      heap[parent] = heap[i];
      heap[i] = a;
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        const a = heap[m];
        heap[m] = heap[i];
        heap[i] = a;
        i = m;
      }
    }
    return top;
  };
  while (heap.length > 0) {
    const [d, u] = pop();
    if (d > dist[u]) continue;
    const ux = u % w;
    const uy = (u - ux) / w;
    for (const move of MOVES) {
      const x = ux + DIRS[move][0];
      const y = uy + DIRS[move][1];
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (!passable(state, x, y)) continue;
      const nd = d + 1 + (spots.has(`${x},${y}`) ? RISK : 0);
      const v = y * w + x;
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
        push(nd, v);
      }
    }
  }
  return { dist, prev, w, start };
}

// The first step of the shortest path to a cell, or null when the player
// is already there or the cell is unreachable.
function firstStep(map, x, y) {
  const target = y * map.w + x;
  if (target === map.start) return IDLE.move;
  if (!Number.isFinite(map.dist[target])) return null;
  let at = target;
  while (map.prev[at] !== map.start && map.prev[at] >= 0) at = map.prev[at];
  if (map.prev[at] < 0) return null;
  const ax = at % map.w;
  const ay = (at - ax) / map.w;
  const dx = ax - (map.start % map.w);
  const dy = ay - (((map.start - (map.start % map.w)) / map.w));
  for (const move of MOVES) {
    if (DIRS[move][0] === dx && DIRS[move][1] === dy) return move;
  }
  return null;
}

// The maze's target cells by kind, in scan order (reading order).
function cellsOfTiles(state, wanted) {
  const out = [];
  const tiles = state.level.tiles;
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      if (tiles[y][x] === wanted) out.push({ x, y });
    }
  }
  return out;
}

// The reachable cell of a kind whose weighted cost is the least. `list`
// is scanned in order and ties go to the first, so the choice is
// deterministic.
function bestCell(map, list) {
  let best = null;
  let cost = Infinity;
  for (const cell of list) {
    const d = map.dist[cell.y * map.w + cell.x];
    if (d < cost) {
      cost = d;
      best = cell;
    }
  }
  return best;
}

// Where to hold when there is nothing to fetch: the reachable cell
// (staying counts) farthest from every drift spot. Ties go to the local
// fixed order: stay, up, right, down, left.
function wanderMove(state, spots) {
  const p = state.player;
  const candidates = [
    { move: null, x: p.x, y: p.y },
    ...MOVES.map((move) => ({ move, x: p.x + DIRS[move][0], y: p.y + DIRS[move][1] })),
  ];
  let best = null;
  let bestCost = -1;
  for (const cand of candidates) {
    if (!(cand.move === null) && !passable(state, cand.x, cand.y)) continue;
    let cost = SAFE;
    for (const spot of spots) {
      const [sx, sy] = spot.split(',');
      const away = Math.abs(+sx - cand.x) + Math.abs(+sy - cand.y);
      if (away < cost) cost = away;
    }
    if (cost > bestCost) {
      bestCost = cost;
      best = cand.move;
    }
  }
  return best;
}

// botInput(state) returns an input { move, pause: false } for the state.
export function botInput(state) {
  if (!state || state.status !== 'playing' || state.paused) return IDLE;
  const level = state.level;
  if (!level || !level.tiles) return IDLE;
  const spots = driftSpots(state);
  const map = routeMap(state, spots);
  const carried = state.carried;
  const pads = cellsOfTiles(state, 'M');
  const patches = state.patches.slice();
  const exit = state.open ? cellsOfTiles(state, 'X') : [];

  // The open exit, empty-handed: ship the level.
  if (exit.length > 0 && carried.length === 0) {
    const e = bestCell(map, exit);
    if (e) {
      const move = firstStep(map, e.x, e.y);
      if (move !== null) return { move, pause: false };
    }
  }
  // Full hands: to the merge pad. Patches first otherwise.
  if (carried.length >= CARRY_MAX) {
    const pad = bestCell(map, pads);
    if (pad) {
      const move = firstStep(map, pad.x, pad.y);
      if (move !== null) return { move, pause: false };
    }
  } else {
    const patch = bestCell(map, patches);
    if (patch && Number.isFinite(map.dist[patch.y * map.w + patch.x])) {
      const move = firstStep(map, patch.x, patch.y);
      if (move !== null) return { move, pause: false };
    }
  }
  // Nothing is reachable to fetch, but patches are in hand: merge them.
  if (carried.length > 0) {
    const pad = bestCell(map, pads);
    if (pad) {
      const move = firstStep(map, pad.x, pad.y);
      if (move !== null) return { move, pause: false };
    }
  }
  return { move: wanderMove(state, spots), pause: false };
}
