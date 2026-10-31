// Quorum Run — the autopilot (DESIGN.md §9).
//
// `botInput(state)` returns `{ move, pause: false }` for a state, pure and
// deterministic: it reads the state, draws no randomness, and touches
// nothing global. Plan of play: a breadth-first field from the player picks
// what to walk to (the exit once it is open, a merge pad with full hands,
// otherwise the nearest patch to keep filling up, or an anchor near a free
// spawn while nothing fetchable is around); a second field from the chosen
// goal gives the descent step; a per-step drift-risk filter keeps the bot
// off cells a drift holds or will hold, with an urgent dodge when a drift
// is about to land on the player.

import { CARRY_MAX, DIRS, CLOCKWISE } from './constants.js';

const NONE = { move: null, pause: false };

// ---- terrain -------------------------------------------------------------

function tileAt(level, x, y) {
  const rows = level.tiles;
  const row = y >= 0 && y < rows.length ? rows[y] : null;
  return row && x >= 0 && x < row.length ? row[x] : '#';
}

// Cells a drift can move on: never walls, holds, or the exit (open or not).
function driftPassable(t) {
  return t !== '#' && t !== 'H' && t !== 'X';
}

// Cells the player may cross: holds and the passable only once open.
function playerPassable(t, open) {
  return t !== '#' && (open || (t !== 'H' && t !== 'X'));
}

// ---- breadth-first fields ------------------------------------------------

// Distances from one source cell over a nav grid; unreachable stays -1.
function fieldFrom(nav, width, height, sx, sy) {
  const dist = new Int16Array(width * height).fill(-1);
  const start = sy * width + sx;
  if (sx < 0 || sx >= width || sy < 0 || sy >= height || !nav[start]) return dist;
  dist[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const here = queue[head];
    const d = dist[here] + 1;
    const x = here % width;
    const y = (here - x) / width;
    for (const dir of CLOCKWISE) {
      const nx = x + DIRS[dir][0];
      const ny = y + DIRS[dir][1];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const ni = ny * width + nx;
      if (nav[ni] && dist[ni] < 0) {
        dist[ni] = d;
        queue.push(ni);
      }
    }
  }
  return dist;
}

// ---- drift prediction ----------------------------------------------------

// Where a drift will stand next tick if drifts move: its direction, then
// clockwise, to the first target passable to a drift (not a wall, hold, or
// exit) with no conflict on it. With no passable direction it stays.
function driftNextCell(level, conflicts, drift) {
  const width = level.width;
  const facing = CLOCKWISE.indexOf(drift.dir);
  for (let i = 0; i < 4; i++) {
    const dir = CLOCKWISE[(facing + i) % 4];
    const nx = drift.x + DIRS[dir][0];
    const ny = drift.y + DIRS[dir][1];
    if (!driftPassable(tileAt(level, nx, ny))) continue;
    if (conflicts.has(ny * width + nx)) continue;
    return ny * width + nx;
  }
  return drift.y * width + drift.x;
}

// ---- goal picking --------------------------------------------------------

function cellsOf(level, ch) {
  const width = level.width;
  const out = [];
  for (let y = 0; y < level.height; y++) {
    const row = level.tiles[y];
    for (let x = 0; x < row.length; x++) if (row[x] === ch) out.push(y * width + x);
  }
  return out;
}

// The reachable target closest to the player (ties: earlier in the list).
function nearestReachable(dist, cells) {
  let best = -1;
  let bestDist = -1;
  for (const cell of cells) {
    const d = dist[cell];
    if (d < 0) continue;
    if (best < 0 || d < bestDist) {
      best = cell;
      bestDist = d;
    }
  }
  return best;
}

// ---- one input -----------------------------------------------------------

export function botInput(state) {
  if (!state || state.status !== 'playing' || state.paused) return NONE;
  const level = state.level;
  if (!level || level.width <= 0 || level.height <= 0) return NONE;
  const width = level.width;
  const height = level.height;
  const open = !!state.open;
  const player = state.player;
  const playerCell = player.y * width + player.x;

  // Live conflicts block everyone.
  const conflicts = new Set();
  for (const c of state.conflicts) conflicts.add(c.y * width + c.x);
  const driftCells = new Set();
  for (const d of state.drifts) driftCells.add(d.y * width + d.x);

  // What the drifts do on the tick after this input: drifts move when the
  // tick that is about to pass divides by driftPeriod (§6 step 10).
  const driftPeriod = level.driftPeriod;
  const willMove = driftPeriod > 0 && (state.tick + 1) % driftPeriod === 0;
  const nextCells = new Set();
  const swaps = new Set(); // drift origins that will swap with the player
  if (willMove) {
    for (const d of state.drifts) {
      const next = driftNextCell(level, conflicts, d);
      nextCells.add(next);
      if (next === playerCell) swaps.add(d.y * width + d.x);
    }
  }

  // Nav grids over the player-passable cells. The planning grid also drops
  // every live conflict and drift, so planned routes never cross them; the
  // raw grid is the fallback for goals a patrol is squatting.
  const navDriftSafe = new Uint8Array(width * height);
  const navRaw = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const t = tileAt(level, x, y);
      if (playerPassable(t, open) && !conflicts.has(i)) navRaw[i] = 1;
      if (navRaw[i] && !driftCells.has(i)) navDriftSafe[i] = 1;
    }
  }

  // Fields for goal picking. Prefer routes that dodge the drifts; falling
  // back to the raw grid still crosses only where nothing blocks this tick.
  let nav = navDriftSafe;
  let dist = fieldFrom(nav, width, height, player.x, player.y);
  let rawUsed = false;

  // Cell lists for the goal priority.
  const pads = cellsOf(level, 'M');
  const exit = cellsOf(level, 'X')[0] ?? -1;
  const patchCells = state.patches.map((p) => p.y * width + p.x);
  const patchOn = new Set(patchCells);
  const freeSpawns = level.spawns
    .map((s) => s.y * width + s.x)
    .filter((c) => !patchOn.has(c) && c !== playerCell);
  const holding = state.carried.length;

  // Pick the goal on the current field; null when nothing is reachable.
  const pick = () => {
    if (open && dist[exit] >= 0) return exit;
    if (holding >= CARRY_MAX) {
      const pad = nearestReachable(dist, pads);
      if (pad >= 0) return pad;
    }
    const patch = nearestReachable(dist, patchCells);
    if (patch >= 0) return patch;
    if (holding > 0) {
      const pad = nearestReachable(dist, pads);
      if (pad >= 0) return pad;
    }
    return nearestReachable(dist, freeSpawns);
  };

  let goal = pick();
  if (goal < 0 && !rawUsed) {
    // Every goal is unreachable on the drift-safe grid: re-plan ignoring
    // drifts (conflicts still block) and take whatever this reaches.
    nav = navRaw;
    dist = fieldFrom(nav, width, height, player.x, player.y);
    rawUsed = true;
    goal = pick();
  }
  if (goal < 0) return { move: null, pause: false };

  // An incoming drift on this cell right now needs a dodge more than a plan.
  if (willMove && nextCells.has(playerCell)) {
    for (const dir of CLOCKWISE) {
      const nx = player.x + DIRS[dir][0];
      const ny = player.y + DIRS[dir][1];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const ni = ny * width + nx;
      if (!nav[ni]) continue;
      if (driftCells.has(ni) || nextCells.has(ni) || conflicts.has(ni)) continue;
      return { move: dir, pause: false };
    }
    return { move: null, pause: false };
  }

  // The descent field from the goal over the nav it was reached through.
  const goalNav = rawUsed ? navRaw : navDriftSafe;
  const toGoal = fieldFrom(goalNav, width, height, goal % width, (goal - (goal % width)) / width);
  const from = toGoal[playerCell];
  if (from <= 0) return { move: null, pause: false };

  // Descent candidates: neighbours closer to the goal, ordered by their
  // field value, then in clockwise order. The closest safe one moves.
  const candidates = [];
  for (let closer = from - 1; closer >= 0; closer--) {
    for (const dir of CLOCKWISE) {
      const nx = player.x + DIRS[dir][0];
      const ny = player.y + DIRS[dir][1];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const ni = ny * width + nx;
      if (goalNav[ni] && toGoal[ni] === closer) candidates.push({ dir, i: ni });
    }
    if (candidates.length) break;
  }
  for (const { dir, i } of candidates) {
    if (!driftCells.has(i) && !nextCells.has(i) && !swaps.has(i) && !conflicts.has(i)) {
      return { move: dir, pause: false };
    }
  }
  // Every descent step is under a drift or a conflict: hold still rather
  // than trade a hit for nothing (waiting also lets patrols move on).
  return { move: null, pause: false };
}
