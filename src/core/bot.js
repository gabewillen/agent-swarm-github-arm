// The autopilot (DESIGN.md §9): a pure function from one game state to the
// input for the next step. It never keeps memory between calls and never
// draws outside the state, so the same state always yields the same input.
//
// The plan layer is a fixed priority, read straight off the state:
//   - an open exit before all else (with empty hands),
//   - otherwise a full hand heads for the nearest merge pad,
//   - otherwise the nearest patch the player can reach,
//   - otherwise park on a merge pad and wait for the spawns.
// The judgement layer keeps it out of trouble: both a BFS over the tiles
// (today's conflicts are blocked; holds and a closed exit too) and a short
// simulation of the drift world, which vetoes any move that ends with a
// drift on the player. The simulation runs only while some drift is close
// enough to matter within the horizon, and the horizon keeps the bot
// deterministic — the same futures every call.

import { CARRY_MAX, CLOCKWISE, CONFLICT_TICKS, DIRS } from './constants.js';

const OPPOSITE = { up: 'down', right: 'left', down: 'up', left: 'right' };

// A distance that means "no path": any real distance beats this.
const FAR = 0x4000;

function tileOf(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined) return '#';
  return row[x] !== undefined ? row[x] : '#';
}

// A cell the player may enter: no wall, and holds plus the exit only once
// the quorum is met.
function walkable(level, x, y, open) {
  const t = tileOf(level, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !open) return false;
  return true;
}

// A drift may not enter a wall, a hold, the exit, or a live conflict.
function driftEnterable(level, x, y) {
  const t = tileOf(level, x, y);
  return t !== '#' && t !== 'H' && t !== 'X';
}

// Breadth-first walking distances over the whole map, ground zero at
// (sx, sy). Conflicts (and, while closed, holds and the exit) block the
// expansion; everything else spreads in clockwise order, so ties break
// the same way every call.
function distanceField(level, open, blocked, sx, sy) {
  const W = level.width;
  const dist = new Int16Array(W * level.height).fill(-1);
  if (sx < 0 || sx >= W || sy < 0 || sy >= level.height) return dist;
  const tiles = level.tiles;
  dist[sy * W + sx] = 0;
  const queue = [sy * W + sx];
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head];
    const x = k % W;
    const y = (k - x) / W;
    for (let i = 0; i < 4; i++) {
      const nx = x + DIRS[CLOCKWISE[i]][0];
      const ny = y + DIRS[CLOCKWISE[i]][1];
      if (nx < 0 || nx >= W || ny < 0 || ny >= level.height) continue;
      const nk = ny * W + nx;
      if (dist[nk] !== -1 || blocked.has(nk)) continue;
      const t = tiles[ny][nx];
      if (t === '#' || ((t === 'H' || t === 'X') && !open)) continue;
      dist[nk] = dist[k] + 1;
      queue.push(nk);
    }
  }
  return dist;
}

// The drift world, one layer ahead: for each of the next few ticks, where
// every drift sits before and after its move that tick (indexes run
// together across the two), and which cells hold a conflict during the
// player's move that tick. Mirrors §6 steps 5, 10 and 11 exactly.
function driftFrames(state, horizon) {
  const level = state.level;
  const W = level.width;
  const tiles = level.tiles;
  let drifts = state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  let conflicts = state.conflicts.map((c) => ({ x: c.x, y: c.y, ttl: c.ttl }));
  const frames = [];
  let t = state.tick;
  for (let i = 0; i < horizon; i++) {
    t += 1;
    const aged = [];
    for (const c of conflicts) if (c.ttl - 1 > 0) aged.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
    conflicts = aged;
    const blocked = new Set();
    for (const c of conflicts) blocked.add(c.y * W + c.x);
    const moved = t % level.driftPeriod === 0;
    const before = moved ? drifts.map((d) => ({ x: d.x, y: d.y })) : null;
    if (moved) {
      for (let k = 0; k < drifts.length; k++) {
        const d = drifts[k];
        const start = Math.max(0, CLOCKWISE.indexOf(d.dir));
        for (let turn = 0; turn < CLOCKWISE.length; turn++) {
          const dir = CLOCKWISE[(start + turn) % CLOCKWISE.length];
          const nx = d.x + DIRS[dir][0];
          const ny = d.y + DIRS[dir][1];
          if (!driftEnterable(level, nx, ny) || blocked.has(ny * W + nx)) continue;
          drifts[k] = { x: nx, y: ny, dir };
          break;
        }
      }
      // Two or more drifts on one cell reverse every drift there and leave
      // a conflict behind, which joins the blockades for later ticks.
      const groups = new Map();
      drifts.forEach((d, k) => {
        const key = d.y * W + d.x;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(k);
      });
      for (const [key, idxs] of groups) {
        if (idxs.length < 2) continue;
        const x = key % W;
        const y = (key - x) / W;
        for (const k of idxs) drifts[k].dir = OPPOSITE[drifts[k].dir] ?? drifts[k].dir;
        if (!blocked.has(key)) {
          conflicts.push({ x, y, ttl: CONFLICT_TICKS });
          blocked.add(key);
        }
      }
    }
    frames.push({
      before,
      after: drifts.map((d) => ({ x: d.x, y: d.y })),
      moved,
      blocked,
    });
  }
  return frames;
}

// How far into the future the candidate path stays unhit: Infinity when no
// drift reaches it within the horizon, otherwise the tick of the first
// hit. The path walks the planned move first, then keeps taking the
// shortest remaining way to the goal, stalling when a conflict or the map
// closes the way. A hit means a drift ends this tick on the player's cell,
// or swapped cells with the player as §6 step 12 says.
function pathDanger(cell, fromX, fromY, frames, moveField, W, level, open, invuln) {
  const horizon = frames.length;
  let x = cell.x;
  let y = cell.y;
  let px = fromX;
  let py = fromY;
  for (let t = 1; t <= horizon; t++) {
    const fr = frames[t - 1];
    if (t > invuln) {
      const after = fr.after;
      for (let i = 0; i < after.length; i++) {
        if (after[i].x === x && after[i].y === y) return t;
      }
      if (fr.moved) {
        const before = fr.before;
        for (let i = 0; i < before.length; i++) {
          if (before[i].x === x && before[i].y === y && after[i].x === px && after[i].y === py) return t;
        }
      }
    }
    if (t === horizon) break;
    // Plan the next cell: keep descending the distance field; stall when
    // the way is blocked.
    let best = moveField === null ? -1 : moveField[y * W + x];
    let bx = x;
    let by = y;
    if (best > 0) {
      for (let i = 0; i < 4; i++) {
        const nx = x + DIRS[CLOCKWISE[i]][0];
        const ny = y + DIRS[CLOCKWISE[i]][1];
        if (!walkable(level, nx, ny, open)) continue;
        const nk = ny * W + nx;
        const nd = moveField[nk];
        if (nd < 0 || nd >= best) continue;
        if (frames[t].blocked.has(nk)) continue;
        best = nd;
        bx = nx;
        by = ny;
      }
    }
    px = x;
    py = y;
    x = bx;
    y = by;
  }
  return Infinity;
}

export function botInput(state) {
  // A finished or paused game wants nothing from the autopilot.
  if (state.status !== 'playing' || state.paused) return { move: null, pause: false };

  const level = state.level;
  const W = level.width;
  const open = state.open;
  const player = state.player;
  const curBlocked = new Set();
  for (const c of state.conflicts) curBlocked.add(c.y * W + c.x);

  // Distances from the player: how far every patch, pad and the exit lie.
  const d1 = distanceField(level, open, curBlocked, player.x, player.y);
  let exit = null;
  const merges = [];
  for (let y = 0; y < level.height; y++) {
    const row = level.tiles[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === 'X') exit = { x, y };
      else if (ch === 'M') merges.push({ x, y });
    }
  }
  const exitD = exit === null ? -1 : d1[exit.y * W + exit.x];
  let merge = null;
  let mergeBest = FAR;
  let mergeKey = -1;
  for (const m of merges) {
    const d = d1[m.y * W + m.x];
    const key = m.y * W + m.x;
    if (d < 0 || d > mergeBest || (d === mergeBest && key >= mergeKey)) continue;
    mergeBest = d;
    mergeKey = key;
    merge = m;
  }

  // 1. The plan: hands full or an open exit first, then nearest patch.
  let goal = null;
  const carried = state.carried.length;
  if (open) {
    if (carried === 0) goal = exitD >= 0 ? exit : merge;
    else goal = merge !== null ? merge : (exitD >= 0 ? exit : null);
  } else if (carried >= CARRY_MAX) {
    goal = merge;
  } else {
    let patch = null;
    let patchD = FAR;
    let patchKey = -1;
    for (const p of state.patches) {
      const d = d1[p.y * W + p.x];
      const key = p.y * W + p.x;
      if (d < 0) continue;
      if (patch === null || d < patchD || (d === patchD && key < patchKey)) {
        patchD = d;
        patchKey = key;
        patch = p;
      }
    }
    goal = patch !== null ? patch : merge;
  }

  // 2. Distances from the goal: every candidate move wants to descend it.
  let moveField = null;
  if (goal !== null) moveField = distanceField(level, open, curBlocked, goal.x, goal.y);

  // 3. The near future of the drift world — only when a drift could walk
  // into the player's part of the map within the horizon.
  let frames = null;
  if (state.drifts.length > 0) {
    const horizon = level.driftPeriod * 2 + 2;
    let moves = 0;
    for (let t = 1; t <= horizon; t++) {
      if ((state.tick + t) % level.driftPeriod === 0) moves += 1;
    }
    let near = false;
    for (const d of state.drifts) {
      if (Math.abs(d.x - player.x) + Math.abs(d.y - player.y) <= moves + 2) {
        near = true;
        break;
      }
    }
    if (near) frames = driftFrames(state, horizon);
  }

  // 4. The candidates: four neighbours plus standing still, each judged by
  // how long its path stays unhit, then by how much sooner it reaches the
  // goal, then by a fixed order so ties never wobble.
  let best = null;
  let bestDanger = 0;
  let bestDist = 0;
  let fromX = player.x;
  let fromY = player.y;
  for (let oi = 0; oi <= 4; oi++) {
    let x;
    let y;
    if (oi === 4) {
      x = player.x;
      y = player.y;
    } else {
      x = player.x + DIRS[CLOCKWISE[oi]][0];
      y = player.y + DIRS[CLOCKWISE[oi]][1];
      if (!walkable(level, x, y, open) || curBlocked.has(y * W + x)) continue;
    }
    const cell = { x, y };
    const danger = frames === null ? Infinity : pathDanger(cell, fromX, fromY, frames, moveField, W, level, open, state.invuln);
    const dangerKey = danger === Infinity ? -1 : danger;
    const dc = moveField === null ? -1 : moveField[y * W + x];
    const distKey = dc < 0 ? FAR : dc;
    if (best === null || dangerKey < bestDanger || (dangerKey === bestDanger && distKey < bestDist)) {
      best = cell;
      bestDanger = dangerKey;
      bestDist = distKey;
    }
  }

  if (best === null || (best.x === player.x && best.y === player.y)) {
    return { move: null, pause: false };
  }
  const dx = best.x - player.x;
  const dy = best.y - player.y;
  for (const dir of CLOCKWISE) {
    if (DIRS[dir][0] === dx && DIRS[dir][1] === dy) return { move: dir, pause: false };
  }
  return { move: null, pause: false };
}
