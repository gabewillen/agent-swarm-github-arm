// Quorum Run: the autopilot bot (DESIGN.md §9).
// botInput(state) returns { move, pause: false } for the state. It is
// pure, deterministic, and changes nothing: no DOM, no randomness, no
// wall-clock. It finds its way over the grid with a breadth-first path
// sweep, fetches patches, carries up to CARRY_MAX of them, merges on a
// merge pad, ships through the exit once the level's quorum is landed,
// and sidesteps drifts by simulating one step of the real rules before
// it commits to a move.

import { CARRY_MAX, DIRS } from './constants.js';
import { step, tileAt } from './game.js';

const ORDER = ['up', 'right', 'down', 'left'];
const ALL_MOVES = ORDER.concat([null]);
const keyOf = (x, y) => `${x},${y}`;

// The cells the player may enter at this moment: never a wall, never a
// closed hold or the exit, and not a conflict unless `conf` is null
// (conflicts age away, so the bot may plan through them and wait).
function passableAt(state, x, y, conf) {
  const t = tileAt(state, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !state.open) return false;
  if (conf !== null && conf.has(keyOf(x, y))) return false;
  return true;
}

// Multi-source breadth-first sweep: `dist.get(key)` is the number of
// steps from the cell to its nearest seed, through cells the player may
// enter. Seeds are laid down before the sweep, so a target is reachable
// the moment the player's own key is in the map.
function distances(state, seeds, conf) {
  const dist = new Map();
  const frontier = [];
  for (const seed of seeds) {
    const k = keyOf(seed[0], seed[1]);
    if (!dist.has(k)) {
      dist.set(k, 0);
      frontier.push([seed[0], seed[1]]);
    }
  }
  for (let head = 0; head < frontier.length; head++) {
    const cell = frontier[head];
    const x = cell[0];
    const y = cell[1];
    const next = dist.get(keyOf(x, y)) + 1;
    for (const dir of ORDER) {
      const nx = x + DIRS[dir][0];
      const ny = y + DIRS[dir][1];
      const k = keyOf(nx, ny);
      if (dist.has(k) || !passableAt(state, nx, ny, conf)) continue;
      dist.set(k, next);
      frontier.push([nx, ny]);
    }
  }
  return dist;
}

// The move that steps downhill on a distance map. Ties are broken by
// blockage (free ground, then conflict-blocked ground that will clear,
// then terrain we cannot ever enter) and then by ORDER, so the choice
// stays deterministic and never presses into a wall it cannot pass.
function stepToward(state, dist, conf) {
  const home = keyOf(state.player.x, state.player.y);
  const here = dist.get(home);
  if (here === undefined || here === 0) return null;
  let bestDir = null;
  let bestDist = here;
  let bestClass = 3;
  for (let i = 0; i < ORDER.length; i++) {
    const dir = ORDER[i];
    const nx = state.player.x + DIRS[dir][0];
    const ny = state.player.y + DIRS[dir][1];
    const d = dist.get(keyOf(nx, ny));
    if (d === undefined || d >= bestDist) continue;
    let cls;
    const t = tileAt(state, nx, ny);
    if (t === '#' || (t === 'H' || t === 'X') && !state.open) cls = 2;
    else if (conf !== null && conf.has(keyOf(nx, ny))) cls = 1;
    else cls = 0;
    if (d < bestDist || (d === bestDist && cls < bestClass)) {
      bestDir = dir;
      bestDist = d;
      bestClass = cls;
    }
  }
  return bestDir;
}

// Walk to the nearest seed: respect conflicts when they leave a path,
// else push through them (the exact shape stepToward tolerates).
function steer(state, seeds) {
  if (seeds.length === 0) return null;
  const conf = conflictCells(state);
  let dist = distances(state, seeds, conf);
  if (!dist.has(keyOf(state.player.x, state.player.y))) {
    dist = distances(state, seeds, null);
  }
  return stepToward(state, dist, conf);
}

function conflictCells(state) {
  const conf = new Set();
  for (const c of state.conflicts) conf.add(keyOf(c.x, c.y));
  return conf;
}

function cellsOf(state, ch) {
  const out = [];
  const tiles = state.level.tiles;
  for (let y = 0; y < tiles.length; y++) {
    const row = tiles[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === ch) out.push([x, y]);
    }
  }
  return out;
}

// Distance from the player to the nearest seed on a given state; used to
// rank simulated positions by the progress they make toward the goal.
function progressDistance(state, seeds) {
  if (seeds.length === 0) return 0;
  const conf = conflictCells(state);
  let dist = distances(state, seeds, conf);
  const home = keyOf(state.player.x, state.player.y);
  if (!dist.has(home)){
    dist = distances(state, seeds, null);
  }
  const d = dist.get(home);
  return d === undefined ? Infinity : d;
}

// The strategic plan: which goal to chase and the move toward it.
function plan(state) {
  // 1. Open levels get shipped: head for the exit.
  if (state.open) {
    const exits = cellsOf(state, 'X');
    return { move: steer(state, exits), seeds: exits };
  }
  const carried = state.carried.length;
  const merges = cellsOf(state, 'M');
  // 2. Full hands, or a merge that would land the quorum now, go to a pad.
  //    Only break off for a patch that is a single step away.
  if (carried > 0 && (carried >= CARRY_MAX || state.merges + carried >= state.level.quorum)) {
    const patches = state.patches.map((p) => [p.x, p.y]);
    if (carried < CARRY_MAX && patches.length > 0) {
      const nextTo = distances(state, patches, conflictCells(state)).get(keyOf(state.player.x, state.player.y));
      if (nextTo === 1) return { move: steer(state, patches), seeds: patches };
    }
    return { move: steer(state, merges), seeds: merges };
  }
  // 3. Otherwise fetch the nearest reachable patch.
  const patches = state.patches.map((p) => [p.x, p.y]);
  if (patches.length > 0) {
    const dist = distances(state, patches, conflictCells(state));
    if (dist.has(keyOf(state.player.x, state.player.y))) {
      return { move: stepToward(state, dist, conflictCells(state)), seeds: patches };
    }
    if (carried > 0) return { move: steer(state, merges), seeds: merges };
    // Empty handed with only out-of-reach patches: push toward them and
    // let the conflicts blocking the way age out.
    return { move: steer(state, patches), seeds: patches };
  }
  // 4. No patches on the grid: bank what we carry on a pad.
  if (carried > 0) return { move: steer(state, merges), seeds: merges };
  // 5. Or wait for the next spawn near a spawn point — but never camp on
  //    one, because a spawn needs its cell free.
  const spawns = state.level.spawns.map((s) => [s.x, s.y]);
  if (spawns.length === 0) return { move: null, seeds: [] };
  const conf = conflictCells(state);
  let dist = distances(state, spawns, conf);
  if (!dist.has(keyOf(state.player.x, state.player.y))) {
    dist = distances(state, spawns, null);
  }
  const move = stepToward(state, dist, conf);
  if (move !== null) return { move, seeds: spawns };
  // Standing on a spawn: step off onto plain ground so a patch may drop.
  const spawnKeys = new Set(spawns.map((s) => keyOf(s[0], s[1])));
  for (const dir of ORDER) {
    const nx = state.player.x + DIRS[dir][0];
    const ny = state.player.y + DIRS[dir][1];
    if (passableAt(state, nx, ny, conf) && !spawnKeys.has(keyOf(nx, ny))) return { move: dir, seeds: spawns };
  }
  return { move: null, seeds: spawns };
}

// How a simulated move turned out: 3 safe, 2 cargo lost, 1 a hit, 0 lost.
function outcomeRank(next) {
  if (next.events.includes('lost')) return 0;
  if (next.events.includes('hit')) return 1;
  if (next.events.includes('drop')) return 2;
  return 3;
}

function nearDrift(state) {
  for (const d of state.drifts) {
    if (Math.abs(d.x - state.player.x) <= 3 && Math.abs(d.y - state.player.y) <= 3) return true;
  }
  return false;
}

// One step of the real rules decides what each move would cause. Among
// the outcomes that avoid a hit at all, prefer the planned move, then
// the ones that still make progress toward the goal.
function guarded(state, planned, seeds) {
  let bestMove = null;
  let bestRank = -1;
  let bestDist = Infinity;
  let bestPlanned = false;
  for (let i = 0; i < ALL_MOVES.length; i++) {
    const move = ALL_MOVES[i];
    let next;
    try {
      next = step(state, { move, pause: false });
    } catch {
      continue;
    }
    if (next === null || next === undefined) continue;
    const rank = outcomeRank(next);
    if (rank === 0) continue;
    const dist = rank === 3 ? progressDistance(next, seeds) : Infinity;
    const isPlanned = move === planned;
    if (
      rank > bestRank ||
      (rank === bestRank && isPlanned && !bestPlanned) ||
      (rank === bestRank && isPlanned === bestPlanned && dist < bestDist)
    ) {
      bestMove = move;
      bestRank = rank;
      bestDist = dist;
      bestPlanned = isPlanned;
    }
  }
  return bestMove;
}

export function botInput(state) {
  if (!state || state.status !== 'playing' || state.paused) {
    return { move: null, pause: false };
  }
  const goal = plan(state);
  let move = goal.move;
  if (state.drifts.length > 0 && nearDrift(state)) {
    move = guarded(state, move, goal.seeds);
  }
  return { move: move === undefined ? null : move, pause: false };
}
