// Quorum Run — the bot (DESIGN.md §9): a pure, deterministic autopilot.
// botInput(state) reads one state and returns `{ move, pause: false }`: it
// fetches patches, merges them, avoids drifts, and takes the exit once it is
// open. It path-finds with a BFS over the cells the player may enter and
// dodges drifts by predicting where the drift phase (§6 steps 10-12) sends
// them next step. No randomness, no mutation of its argument.

import { DIRS, CLOCKWISE } from './constants.js';

const IDLE = { move: null, pause: false };

// §6 step 6: a cell the player may enter — not a wall, not a closed hold or
// exit, and no conflict on it (already aged: a conflict at ttl 1 is gone).
function enterable(level, open, agedConflicts, x, y) {
  if (x < 0 || y < 0 || y >= level.height) return false;
  const row = level.tiles[y];
  if (x >= row.length) return false;
  const tile = row[x];
  if (tile === '#') return false;
  if ((tile === 'H' || tile === 'X') && !open) return false;
  return !agedConflicts.some((c) => c.x === x && c.y === y);
}

// §6 step 5: the conflicts as the next step's phases read them — aged one
// tick, so a ttl of 1 is already gone.
function agedConflicts(state) {
  return state.conflicts.filter((c) => c.ttl - 1 > 0);
}

// BFS over the enterable cells from one start cell; `dist[y * width + x]` is
// the number of moves from the start to that cell, Infinity if unreachable.
function distances(level, open, aged, fromX, fromY) {
  const width = level.width;
  const dist = new Array(width * level.height).fill(Infinity);
  dist[fromY * width + fromX] = 0; // the player may stand on and walk off any cell
  const queue = [[fromX, fromY]];
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    const steps = dist[y * width + x] + 1;
    for (const dir of CLOCKWISE) {
      const [dx, dy] = DIRS[dir];
      const nx = x + dx, ny = y + dy;
      if (!enterable(level, open, aged, nx, ny)) continue;
      const at = ny * width + nx;
      if (steps < dist[at]) {
        dist[at] = steps;
        queue.push([nx, ny]);
      }
    }
  }
  return dist;
}

// Where the drift phase sends each drift this up-coming step: its own
// direction first, then clockwise, to the first target that is passable to a
// drift (§6 step 10 — not a wall, hold, or exit, and no conflict on it);
// boxed in, it stays and keeps its direction.
function predictedDrift(state, aged, fromX, fromY, dir) {
  for (let n = 0; n < 4; n++) {
    const next = CLOCKWISE[(CLOCKWISE.indexOf(dir) + n) % 4];
    const [dx, dy] = DIRS[next];
    const x = fromX + dx, y = fromY + dy;
    if (y < 0 || !state.level.tiles[y]) continue;
    const row = state.level.tiles[y];
    if (x < 0 || x >= row.length) continue;
    const tile = row[x];
    if (tile === '#' || tile === 'H' || tile === 'X') continue;
    if (aged.some((c) => c.x === x && c.y === y)) continue;
    return { x, y };
  }
  return { x: fromX, y: fromY };
}

// The goal: the open exit when the level is open, else the nearest merge pad
// when carrying, else the nearest reachable patch. `dist` is a distances map
// rooted at the player; ties break in reading order (top row first, left
// first). `unreachable` (null) means nothing is reachable this tick.
function chooseGoal(state, dist) {
  const width = state.level.width;
  const at = (x, y) => dist[y * width + x];
  if (state.open) {
    let goal = null;
    for (let y = 0; y < state.level.height; y++) {
      for (let x = 0; x < width; x++) {
        if (state.level.tiles[y][x] !== 'X') continue;
        if (goal === null || at(x, y) < dist[goal.y * width + goal.x]) {
          goal = { x, y };
        }
      }
    }
    return goal;
  }
  if (state.carried.length > 0) {
    let goal = null;
    for (let y = 0; y < state.level.height; y++) {
      for (let x = 0; x < width; x++) {
        if (state.level.tiles[y][x] !== 'M') continue;
        if (goal === null || at(x, y) < dist[goal.y * width + goal.x]) {
          goal = { x, y };
        }
      }
    }
    return goal;
  }
  let goal = null;
  for (const patch of state.patches) {
    if (goal === null) { goal = { x: patch.x, y: patch.y }; continue; }
    const here = at(patch.x, patch.y);
    const there = at(goal.x, goal.y);
    if (here < there || (here === there && (patch.y < goal.y || (patch.y === goal.y && patch.x < goal.x)))) {
      goal = { x: patch.x, y: patch.y };
    }
  }
  return goal;
}

export function botInput(state) {
  if (!state || typeof state !== 'object') return IDLE;
  const level = state.level;
  if (!level || !state.player || state.status !== 'playing') return IDLE;

  const aged = agedConflicts(state);
  const open = state.open;
  const distFromPlayer = distances(level, open, aged, state.player.x, state.player.y);
  const goal = chooseGoal(state, distFromPlayer);
  if (goal === null) return IDLE;
  const goalFromPlayer = distFromPlayer[goal.y * level.width + goal.x];
  if (!Number.isFinite(goalFromPlayer)) return IDLE; // the goal is beyond a conflict
  if (goalFromPlayer === 0) return IDLE; // on the goal: step() resolves pickup, merge, or exit

  // Steering: a second BFS, rooted at the goal, whose map is the distance
  // from every cell to the goal.
  const dist = distances(level, open, aged, goal.x, goal.y);

  // Where the drifts will be after this step (§6 step 10) — only on a step
  // when the drift phase moves them.
  const driftMoveTick = (state.tick + 1) % level.driftPeriod === 0;
  const fromCells = state.drifts.map((d) => ({ x: d.x, y: d.y }));
  const driftsNext = driftMoveTick
    ? state.drifts.map((d, i) => predictedDrift(state, aged, fromCells[i].x, fromCells[i].y, d.dir))
    : fromCells;

  // §6 step 12's two ways the player is hit: a drift landing on the player's
  // post-step cell, or a drifting drift swapping cells with the player (a
  // moved drift landing on the cell the player just left). Standing still is
  // judged on the same terms.
  const hitAfter = (cell, leftBehind, stayed) => {
    for (let i = 0; i < driftsNext.length; i++) {
      const p = driftsNext[i];
      if (p.x === cell.x && p.y === cell.y) return true;
      if (!stayed && driftMoveTick &&
        p.x === leftBehind.x && p.y === leftBehind.y &&
        fromCells[i].x === cell.x && fromCells[i].y === cell.y) return true;
    }
    return false;
  };

  const candidates = [];
  for (const dir of CLOCKWISE) {
    const [dx, dy] = DIRS[dir];
    candidates.push({ move: dir, x: state.player.x + dx, y: state.player.y + dy });
  }

  let best = null;
  const fromGoal = dist[state.player.y * level.width + state.player.x];
  let bestDist = Number.isFinite(fromGoal) ? fromGoal : Infinity; // strictly better only
  for (const cand of candidates) {
    if (!enterable(level, open, aged, cand.x, cand.y)) continue; // a wall never helps
    if (hitAfter({ x: cand.x, y: cand.y }, state.player, false)) continue;
    const toward = dist[cand.y * level.width + cand.x];
    if (toward < bestDist) {
      best = cand;
      bestDist = toward;
    }
  }
  if (best) return { move: best.move, pause: false };

  // Every neighbour is a wall or hazard this tick: hold still unless holding
  // still is a hit too, then any enterable cell (a drift may take it next,
  // but a wasted tick beats a drift landing on us), else stand.
  if (!hitAfter(state.player, state.player, true)) return IDLE;
  for (const dir of CLOCKWISE) {
    const [dx, dy] = DIRS[dir];
    const x = state.player.x + dx, y = state.player.y + dy;
    if (enterable(level, open, aged, x, y)) return { move: dir, pause: false };
  }
  return IDLE;
}
