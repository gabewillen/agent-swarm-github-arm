// The autopilot (DESIGN.md §9): `botInput(state)` returns an input for the
// state, pure and deterministic, with no randomness. It walks the shortest
// path to its current goal — a patch, the merge pad, or the open exit —
// dodging predicted drift moves and conflicts, and waits by the nearest
// spawn point when the floor is bare.

import { CARRY_MAX, DIRS } from './constants.js';

const DIR_ORDER = ['up', 'right', 'down', 'left'];

function cellKey(x, y) {
  return `${x},${y}`;
}

function tileAt(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined) return '#';
  const ch = row[x];
  return ch === undefined ? '#' : ch;
}

function conflictBlocks(conflicts, x, y) {
  for (let i = 0; i < conflicts.length; i++) {
    const c = conflicts[i];
    if (c.x === x && c.y === y && c.ttl > 1) return true;
  }
  return false;
}

// What blocks the player: walls, closed holds and exit, and conflicts.
function playerCanEnter(level, open, conflicts, x, y) {
  const t = tileAt(level, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !open) return false;
  if (conflictBlocks(conflicts, x, y)) return false;
  return true;
}

// What blocks a drift: walls, holds, the exit (open or not), conflicts.
function driftCanEnter(level, conflicts, x, y) {
  const t = tileAt(level, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  if (conflictBlocks(conflicts, x, y)) return false;
  return true;
}

// One BFS over the player-passable grid, from every target cell at once:
// dist[cell] is the fewest moves to any target, or -1 when unreachable.
function distField(level, open, conflicts, targets, rows, cols) {
  const dist = new Array(rows * cols).fill(-1);
  const queue = [];
  for (const t of targets) {
    if (t.y < 0 || t.y >= rows || t.x < 0 || t.x >= cols) continue;
    const i = t.y * cols + t.x;
    if (dist[i] !== -1) continue;
    if (!playerCanEnter(level, open, conflicts, t.x, t.y)) continue;
    dist[i] = 0;
    queue.push(i);
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % cols;
    const y = (i - x) / cols;
    for (const dir of DIR_ORDER) {
      const nx = x + DIRS[dir][0];
      const ny = y + DIRS[dir][1];
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const j = ny * cols + nx;
      if (dist[j] !== -1) continue;
      if (!playerCanEnter(level, open, conflicts, nx, ny)) continue;
      dist[j] = dist[i] + 1;
      queue.push(j);
    }
  }
  return dist;
}

// Where each drift will be after its next move: it turns clockwise to the
// first passable direction. On ticks outside its period (predicting the
// step that is about to run: tick + 1) it stays put. Conflicts that will
// have aged away this instant (ttl 1) still block nothing, which the
// ttl check covers.
function predictDrifts(state) {
  const level = state.level;
  const moving = (state.tick + 1) % level.driftPeriod === 0;
  const out = [];
  for (const d of state.drifts) {
    const drift = { x: d.x, y: d.y, dir: d.dir, moves: false, from: null };
    if (moving) {
      const facing = DIR_ORDER.indexOf(d.dir);
      for (let k = 0; k < 4; k++) {
        const dir = DIR_ORDER[(facing + k) % 4];
        const nx = d.x + DIRS[dir][0];
        const ny = d.y + DIRS[dir][1];
        if (driftCanEnter(level, state.conflicts, nx, ny)) {
          drift.x = nx;
          drift.y = ny;
          drift.dir = dir;
          drift.moves = true;
          drift.from = { x: d.x, y: d.y };
          break;
        }
      }
    }
    out.push(drift);
  }
  return out;
}

// Cells with a patch, merge pad, or the exit, in reading order.
function scanTiles(level) {
  const merges = [];
  const exits = [];
  for (let y = 0; y < level.tiles.length; y++) {
    const row = level.tiles[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'M') merges.push({ x, y });
      else if (row[x] === 'X') exits.push({ x, y });
    }
  }
  return { merges, exits };
}

function decide(state) {
  const level = state.level;
  const p = state.player;
  const rows = level.tiles.length;
  const cols = level.tiles[0].length;
  // Conflicts that still block the step to come (ttl 1 ages away first).
  const conflicts = state.conflicts.filter((c) => c.ttl > 1);
  const { merges, exits } = scanTiles(level);
  const opened = state.open;

  // The bot's goal (§9): the open exit; else fill the hands, merge when
  // the quorum is at hand or the hands are full, otherwise fetch patches;
  // with a bare floor, wait by the nearest spawn point.
  const patchCells = state.patches.map((q) => ({ x: q.x, y: q.y }));
  const spawnCells = level.spawns.map((q) => ({ x: q.x, y: q.y }));
  const carriedN = state.carried.length;
  let targets;
  if (opened) {
    targets = exits;
  } else if (carriedN === 0 && patchCells.length > 0) {
    targets = patchCells;
  } else if (carriedN === 0) {
    targets = spawnCells;
  } else if (state.merges + carriedN >= level.quorum || carriedN >= CARRY_MAX) {
    targets = merges;
  } else if (patchCells.length > 0) {
    const dPatch = distField(level, opened, conflicts, patchCells, rows, cols);
    const dMerge = distField(level, opened, conflicts, merges, rows, cols);
    const here = p.y * cols + p.x;
    targets = dPatch[here] >= 0 && (dMerge[here] < 0 || dPatch[here] <= dMerge[here])
      ? patchCells
      : merges;
  } else {
    targets = merges;
  }
  const dist = distField(level, opened, conflicts, targets, rows, cols);

  // Drift danger: the cells they will occupy, and swap risk between two
  // neighbouring cells (§6 step 12) when a drift slides past the player.
  const predicted = predictDrifts(state);
  const occupied = new Set();
  for (const d of predicted) occupied.add(cellKey(d.x, d.y));

  // Every candidate move gets a score to minimise: path distance to the
  // goal plus safety penalties, tie-broken in DIR_ORDER then waiting.
  const candidates = [];
  for (const dir of DIR_ORDER) {
    const bx = p.x + DIRS[dir][0];
    const by = p.y + DIRS[dir][1];
    if (!playerCanEnter(level, opened, conflicts, bx, by)) continue;
    const d = dist[by * cols + bx];
    let risk = d < 0 ? 9000 : 0;
    if (occupied.has(cellKey(bx, by))) risk += 1000;
    for (const drift of predicted) {
      if (!drift.moves || !drift.from) continue;
      if (drift.from.x === bx && drift.from.y === by) {
        // swap risk: the drift leaves the cell I would enter and lands on me
        if (drift.x === p.x && drift.y === p.y) risk += 1000;
      }
    }
    risk += countPressure(predicted, { x: bx, y: by }) * 5;
    candidates.push({ move: dir, score: risk + d });
  }
  const waitDist = dist[p.y * cols + p.x];
  const waitRisk = occupied.has(cellKey(p.x, p.y)) ? 5000 : 0;
  candidates.push({
    move: null,
    score: (waitDist < 0 ? 9000 : waitDist) + waitRisk
      + countPressure(predicted, p),
  });

  let best = candidates[0];
  for (const c of candidates) {
    if (c.score < best.score) best = c;
  }
  return { move: best.move, pause: false };
}

// pressure: how many predicted drift landings neighbour a cell
function countPressure(predicted, cell) {
  let n = 0;
  for (const d of predicted) {
    if (Math.abs(d.x - cell.x) + Math.abs(d.y - cell.y) === 1) n++;
  }
  return n;
}

export function botInput(state) {
  try {
    return decide(state);
  } catch {
    // never crash, never break a rule; hold this tick
    return { move: null, pause: false };
  }
}
