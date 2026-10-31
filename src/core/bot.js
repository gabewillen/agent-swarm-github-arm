// The autopilot (DESIGN.md §9): botInput(state) returns the input that
// plays a state well — fetch patches, merge them, avoid drifts, and take
// the exit once it is open. Pure and deterministic: the same state always
// yields the same input, and no state is changed.
import { CARRY_MAX, DIRS } from './constants.js';

const DIR_ORDER = ['up', 'right', 'down', 'left'];
const NO_INPUT = { move: null, pause: false };

const key = (x, y) => `${x},${y}`;

// The terrain character of a cell, read-only for planning.
function cellChar(state, x, y) {
  const tiles = state.level.tiles;
  if (y < 0 || y >= tiles.length) return '#';
  const row = tiles[y];
  if (!row || x < 0 || x >= row.length) return '#';
  return row[x];
}

// Cells the player may enter apart from conflicts and drifts: not a wall,
// not a hold or the exit while the level is closed (§6 step 6).
function passableTerrain(state, x, y) {
  const ch = cellChar(state, x, y);
  if (ch === '#') return false;
  if (ch === 'H' && !state.open) return false;
  if (ch === 'X' && !state.open) return false;
  return true;
}

// Cells that block every player move (§6 step 6): conflicts.
function conflictCells(state) {
  const out = new Set();
  for (const c of state.conflicts) out.add(key(c.x, c.y));
  return out;
}

// Drift positions, which the planner routes around when it can.
function driftCells(state) {
  const out = new Set();
  for (const d of state.drifts) out.add(key(d.x, d.y));
  return out;
}

// Cells a drift might occupy after this step's drift move: always its own
// cell, and on a tick when drifts move also every neighbour it could turn
// into (§6 step 10: it tries up to four directions clockwise).
function dangerCells(state) {
  const out = driftCells(state);
  const moving = (state.tick + 1) % state.level.driftPeriod === 0;
  if (!moving) return out;
  for (const d of state.drifts) {
    for (const dir of DIR_ORDER) {
      const [dx, dy] = DIRS[dir];
      out.add(key(d.x + dx, d.y + dy));
    }
  }
  return out;
}

// Breadth-first distances from a set of goal cells over the grid, minus
// the blocked cells. Goals may sit in blocked cells (they are still
// reached); every other blocked cell is impassable.
function distances(state, goals, blocked) {
  const dist = new Map();
  let frontier = [];
  for (const g of goals) {
    const k = key(g.x, g.y);
    if (!dist.has(k) && passableTerrain(state, g.x, g.y)) {
      dist.set(k, 0);
      frontier.push(g);
    }
  }
  while (frontier.length > 0) {
    const next = [];
    for (const cell of frontier) {
      const step = dist.get(key(cell.x, cell.y)) + 1;
      for (const dir of DIR_ORDER) {
        const [dx, dy] = DIRS[dir];
        const x = cell.x + dx;
        const y = cell.y + dy;
        const k = key(x, y);
        if (dist.has(k) || blocked.has(k) || !passableTerrain(state, x, y)) continue;
        dist.set(k, step);
        next.push({ x, y });
      }
    }
    frontier = next;
  }
  return dist;
}

// Every merge pad cell ('M') in reading order.
function mergeCells(state) {
  const out = [];
  const tiles = state.level.tiles;
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      if (tiles[y][x] === 'M') out.push({ x, y });
    }
  }
  return out;
}

// The exit cell, or null when the level has none (it always has one).
function exitCell(state) {
  const tiles = state.level.tiles;
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      if (tiles[y][x] === 'X') return { x, y };
    }
  }
  return null;
}

// Pick the move among the player's neighbours: prefer a safe, non-drift
// neighbour on a shortest path; else any safe neighbour when the player
// stands in danger; else stay put and let the grid reshuffle.
function chooseMove(state, dist, blocked) {
  const { x, y } = state.player;
  const drifts = driftCells(state);
  const danger = dangerCells(state);
  const here = dist.get(key(x, y));
  if (here === undefined) return null; // the goal is unreachable: wait
  let bestMove = null;
  let bestDist = here === undefined ? Infinity : here;
  let bestEvade = null;
  let evadeDist = Infinity;
  for (const dir of DIR_ORDER) {
    const [dx, dy] = DIRS[dir];
    const nx = x + dx;
    const ny = y + dy;
    const k = key(nx, ny);
    if (blocked.has(k) || drifts.has(k) || !passableTerrain(state, nx, ny)) continue;
    if (danger.has(k)) continue;
    const d = dist.has(k) ? dist.get(k) : Infinity;
    if (d < bestDist) {
      bestDist = d;
      bestMove = dir;
    }
    if (d < evadeDist) {
      evadeDist = d;
      bestEvade = dir;
    }
  }
  if (bestMove) return bestMove;
  if (danger.has(key(x, y))) return bestEvade; // sidestep an incoming drift
  return null;
}

export function botInput(state) {
  const { x, y } = state.player;
  const here = key(x, y);
  const conflicts = conflictCells(state);
  const drifts = driftCells(state);
  const blocked = (extra) => {
    const out = new Set(conflicts);
    for (const k of extra) out.add(k);
    return out;
  };

  const carried = state.carried.length;
  const patches = state.patches.map((p) => ({ x: p.x, y: p.y }));
  const merges = mergeCells(state);
  const exit = state.open && exitCell(state);
  const blockedWithDrifts = blocked(drifts);

  // Which goal to chase: the open exit; a merge when hands are full or
  // nothing lies to fetch; otherwise the nearest reachable patch.
  let plan = null;
  if (exit) plan = distances(state, [exit], blockedWithDrifts);
  else if (merges.length === 0) plan = null;
  else if (carried >= CARRY_MAX || patches.length === 0) {
    if (merges.length > 0) plan = distances(state, merges, blockedWithDrifts);
  } else {
    plan = distances(state, patches, blockedWithDrifts);
    if (!plan.has(here)) {
      if (carried > 0) {
        const overMerges = distances(state, merges, blockedWithDrifts);
        if (overMerges.has(here)) plan = overMerges;
      }
      if (!plan.has(here)) {
        // Patches sit behind drifts: plan through them if there is no
        // drift-free route at all; the step-by-step move still avoids
        // standing on a drift.
        const through = distances(state, patches, conflicts);
        if (through.has(here)) {
          const overMerges = carried > 0 ? distances(state, merges, blockedWithDrifts) : null;
          if (!(overMerges && overMerges.has(here))) plan = through;
        }
      }
    } else if (carried > 0 && carried < CARRY_MAX) {
      // Merge early when the pad is closer than the next patch.
      const overMerges = distances(state, merges, blockedWithDrifts);
      if (overMerges.has(here) && overMerges.get(here) < plan.get(here)) plan = overMerges;
    }
  }
  return { move: plan ? chooseMove(state, plan, conflicts) : null, pause: false };
}
