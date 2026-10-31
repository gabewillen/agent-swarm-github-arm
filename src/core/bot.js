// The autopilot (DESIGN.md §9): `botInput(state)` returns an input for the
// state, pure and deterministic. Strategy: take the open exit; otherwise
// fill the hands with the nearest reachable patch and empty them on the
// nearest reachable merge pad, waiting when there is nothing to do. A
// breadth-first search over the player-passable plan gives the route, and
// every candidate move is simulated through the game's own `step`, so a
// move that would end in a drift hit, a drop, a conflict cell, or death is
// skipped for the next-best direction.
import { CARRY_MAX, DIRS } from './constants.js';
import { step } from './game.js';

// Fixed tie-break order for moves and neighbour scans.
const MOVES = ['up', 'right', 'down', 'left'];

const key = (x, y, width) => y * width + x;

// True when the player cannot stand on (x, y) right now: off the map, a
// wall, a hold door or the exit while closed, or a live conflict.
function blocked(level, open, conflicts, x, y, width, height) {
  if (x < 0 || x >= width || y < 0 || y >= height) return true;
  const tile = level.tiles[y][x];
  if (tile === '#' || tile === undefined) return true;
  if ((tile === 'H' || tile === 'X') && !open) return true;
  for (const c of conflicts) if (c.x === x && c.y === y) return true;
  return false;
}

// Breadth-first step counts over the passable grid, seeded at one cell.
function distances(level, open, conflicts, sx, sy) {
  const width = level.width;
  const height = level.height;
  const from = key(sx, sy, width);
  const dist = new Map();
  const queue = [from];
  dist.set(from, 0);
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i];
    const x = k % width;
    const y = Math.floor(k / width);
    const d = dist.get(k) + 1;
    for (const dir of MOVES) {
      const [dx, dy] = DIRS[dir];
      const nx = x + dx;
      const ny = y + dy;
      if (blocked(level, open, conflicts, nx, ny, width, height)) continue;
      const nk = key(nx, ny, width);
      if (dist.has(nk)) continue;
      dist.set(nk, d);
      queue.push(nk);
    }
  }
  return dist;
}

// Where to go and why: the exit when the quorum has landed, otherwise the
// nearest reachable fetch for the hands. Deterministic reading order on
// every tie. Returns { cell, reason } or { cell: null }.
function chooseTarget(state, dist) {
  const { level, open, player, carried, patches } = state;
  const width = level.width;

  // The single exit.
  let exitDist = Infinity;
  for (let y = 0; y < level.height; y++) {
    const row = level.tiles[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'X') exitDist = dist.get(key(x, y, width)) ?? Infinity;
    }
  }

  // The nearest merge pad, in reading order.
  let mergeDist = Infinity;
  let mergeCell = null;
  for (let y = 0; y < level.height; y++) {
    const row = level.tiles[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== 'M') continue;
      const d = dist.get(key(x, y, width)) ?? Infinity;
      if (d < mergeDist) {
        mergeDist = d;
        mergeCell = { x, y };
      }
    }
  }

  // The nearest reachable lying patch, in reading order.
  let patchDist = Infinity;
  let patchCell = null;
  for (const p of patches) {
    const d = dist.get(key(p.x, p.y, width)) ?? Infinity;
    if (d < patchDist) {
      patchDist = d;
      patchCell = { x: p.x, y: p.y };
    }
  }

  if (open && exitDist < Infinity) return { cell: exitCellOf(state), reason: 'exit' };
  if (carried.length >= CARRY_MAX && mergeDist < Infinity) return { cell: mergeCell, reason: 'merge' };
  if (patchDist < Infinity) return { cell: patchCell, reason: 'patch' };
  if (carried.length > 0 && mergeDist < Infinity) return { cell: mergeCell, reason: 'merge' };
  return { cell: null, reason: 'idle' };
}

// The exit cell, for the open-exit target.
function exitCellOf(state) {
  const { level } = state;
  for (let y = 0; y < level.height; y++) {
    const row = level.tiles[y];
    for (let x = 0; x < row.length; x++) if (row[x] === 'X') return { x, y };
  }
  return null;
}

// How badly a simulated result would hurt. 0 is clean; a drop loses
// carried patches, a hit loses a life, losing ends the game.
function penalty(next) {
  if (next.events.includes('drop')) return 1;
  if (next.events.includes('hit')) return 2;
  if (next.status === 'lost') return 3;
  return 0;
}

export function botInput(state) {
  const idle = { move: null, pause: false };
  if (!state || state.status !== 'playing') return idle;

  const level = state.level;
  const width = level.width;
  const player = state.player;

  // Reachability counts, from the player, with conflicts and closed
  // holds blocking, decide the target.
  const here = distances(level, state.open, state.conflicts, player.x, player.y);
  const target = chooseTarget(state, here);

  // Nothing to fetch and empty hands: wait for a spawn rather than roam.
  if (target.cell === null) {
    const stay = step(state, idle);
    if (penalty(stay) === 0) return idle;
    // A drift is closing on the spot: take any safe step.
    for (const dir of MOVES) {
      const next = step(state, { move: dir, pause: false });
      if (penalty(next) === 0) return { move: dir, pause: false };
    }
    return idle;
  }

  // Step counts to the target, seeded at the target cell: the movement
  // rank of every candidate destination.
  const toTarget = distances(level, state.open, state.conflicts, target.cell.x, target.cell.y);
  const dHere = toTarget.get(key(player.x, player.y, width)) ?? Infinity;
  if (dHere === 0) return idle; // on the target; the step itself finishes the job

  // Candidate moves: the four directions that lead somewhere standable,
  // ranked by remaining steps to the target, then a stand-still.
  const candidates = [];
  for (const dir of MOVES) {
    const [dx, dy] = DIRS[dir];
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (blocked(level, state.open, state.conflicts, nx, ny, width, level.height)) continue;
    candidates.push({ move: dir, rank: toTarget.get(key(nx, ny, width)) ?? Infinity });
  }
  candidates.push({ move: null, rank: dHere });
  candidates.sort((a, b) => a.rank - b.rank);

  // First candidate whose simulated step is clean wins.
  let fallback = null;
  let fallbackPenalty = Infinity;
  for (const c of candidates) {
    const next = step(state, { move: c.move, pause: false });
    const p = penalty(next);
    if (p === 0) return { move: c.move, pause: false };
    if (p < fallbackPenalty) {
      fallbackPenalty = p;
      fallback = c.move;
    }
  }
  // Every move hurts: take the least damage deterministically.
  return { move: fallback, pause: false };
}
