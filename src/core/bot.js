// The autopilot (DESIGN.md §9): a pure, deterministic botInput(state) that
// fetches patches, merges them on the pad, avoids drifts, and takes the
// exit once the quorum is reached. Path-finding is a breadth-first search
// over the grid; drifts, conflicts, and the cells a drift could reach in
// one move are impassable, so found paths are provably hit-free for the
// step they start. A boxed-in bot dodges with the exact one-step drift
// simulation of §6, or stands its ground when nothing is safe.

import { CARRY_MAX, CLOCKWISE, DIRS } from './constants.js';

// §6 step 10 as the rules run it: a drift tries its own direction first,
// then each next direction clockwise, and moves one cell in the first
// whose target is passable to a drift: not a wall, not a hold, not the
// exit (open or not), and no conflict on it; with no passable direction
// it stays. `conflicts` holds the conflicts as they are during the move.
function oneDriftMove(drift, tiles, conflicts) {
  const at = CLOCKWISE.indexOf(drift.dir);
  for (let k = 0; k < 4; k++) {
    const dir = CLOCKWISE[(at + k) % 4];
    const [dx, dy] = DIRS[dir];
    const x = drift.x + dx;
    const y = drift.y + dy;
    const row = tiles[y];
    const t = row === undefined || x < 0 || x >= row.length ? '#' : row[x];
    if (t === '#' || t === 'H' || t === 'X') continue;
    if (conflicts.some((c) => c.x === x && c.y === y)) continue;
    return { x, y, dir };
  }
  return { x: drift.x, y: drift.y, dir: drift.dir };
}

// Where every drift will be after this step's drift phase given the
// state (drifts only move on ticks the level's period allows): each
// entry pairs the cell a drift came from with the cell it reaches.
function driftsNext(state) {
  const now = state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  if ((state.tick + 1) % state.level.driftPeriod !== 0) {
    return now.map((d) => ({ from: { x: d.x, y: d.y }, to: { x: d.x, y: d.y } }));
  }
  // Conflicts age by one before drifts move, so only conflicts with two
  // or more ticks of life remain and they pass with one less.
  const alive = state.conflicts
    .filter((c) => c.ttl >= 2)
    .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }));
  return state.drifts.map((d) => {
    const to = oneDriftMove(d, state.level.tiles, alive);
    return { from: { x: d.x, y: d.y }, to };
  });
}

// Is the move onto (x, y) safe to make from the player's cell right now?
// The landing cell must hold no wall or closed hold or exit, no blocking
// conflict, and no drift after this step's drift phase; and when a drift
// sat there and moved, it must not also land on the player's cell (a
// swap is a hit too). Walking onto the cell a drift is vacating is fine.
function safeMove(state, x, y, from, next) {
  const row = state.level.tiles[y];
  const t = row === undefined || x < 0 || x >= row.length ? '#' : row[x];
  if (t === '#' || ((t === 'H' || t === 'X') && !state.open)) return false;
  if (state.conflicts.some((c) => c.x === x && c.y === y && c.ttl >= 2)) return false;
  for (const m of next) {
    if (m.to.x === x && m.to.y === y) return false; // a drift will be there
  }
  for (const m of next) {
    if (m.to.x === from.x && m.to.y === from.y && m.from.x === x && m.from.y === y) {
      return false; // swapping cells with a drifting
    }
  }
  return true;
}

// The bot's chosen cell: the index in the distance grid, or -1 when
// nothing fits the plan.
function chooseTarget(state, dist, W, H, start) {
  const tiles = state.level.tiles;
  const idx = (x, y) => y * W + x;

  // Candidate cells in reading order; a tie picks the first found.
  const patches = state.patches.map((p) => idx(p.x, p.y));
  const pads = [];
  let exit = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = tiles[y][x];
      if (t === 'M') pads.push(idx(x, y));
      if (t === 'X') exit = idx(x, y);
    }
  }

  const pick = (cells) => {
    let best = -1;
    let bestDist = Infinity;
    for (const c of cells) {
      if (dist[c] !== -1 && dist[c] < bestDist) {
        bestDist = dist[c];
        best = c;
      }
    }
    return best;
  };

  // Open: ship the level at the exit.
  if (state.open) return pick([exit]);

  if (state.carried.length >= CARRY_MAX) return pick(pads);

  // Carrying enough to reach the quorum, or nothing left to fetch:
  // merge what is in hand.
  if (state.carried.length > 0
    && (state.merges + state.carried.length >= state.level.quorum
      || patches.length === 0
      || pick(patches) === -1)) {
    return pick(pads);
  }

  // Carrying some or none: fetch the nearest reachable patch, unless the
  // pad is closer and dumping what is in hand first is the shorter trip.
  const patch = pick(patches);
  const pad = pick(pads);
  if (state.carried.length > 0 && pad !== -1 && (patch === -1 || dist[pad] <= dist[patch])) {
    return pad;
  }
  if (patch !== -1) return patch;
  if (pad !== -1) return pick(pads);
  return -1;
}

export function botInput(state) {
  const W = state.level.width;
  const H = state.level.height;
  const N = W * H;
  const start = state.player.y * W + state.player.x;
  const next = driftsNext(state);

  // Impassable for path-finding: each drift's cell and ring, each
  // conflict that survives this step's ageing. Proving a path stay clear
  // of these guarantees every step along it is hit-free.
  const danger = new Uint8Array(N);
  for (const c of state.conflicts) if (c.ttl >= 2) danger[c.y * W + c.x] = 1;
  for (const d of state.drifts) {
    danger[d.y * W + d.x] = 1;
    for (const dir of CLOCKWISE) {
      const [dx, dy] = DIRS[dir];
      const x = d.x + dx;
      const y = d.y + dy;
      if (x >= 0 && x < W && y >= 0 && y < H) danger[y * W + x] = 1;
    }
  }

  const tiles = state.level.tiles;
  const enterable = (x, y) => {
    if (x < 0 || y < 0 || y >= H || x >= W) return false;
    const row = tiles[y];
    const t = row === undefined || x < 0 || x >= row.length ? '#' : row[x];
    if (t === '#' || ((t === 'H' || t === 'X') && !state.open)) return false;
    return !danger[y * W + x];
  };

  // Breadth-first over the whole grid, in a fixed clockwise order, so
  // distances and first moves are deterministic.
  const dist = new Int32Array(N).fill(-1);
  const from = new Int32Array(N).fill(-1);
  dist[start] = 0;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    for (const dir of CLOCKWISE) {
      const [dx, dy] = DIRS[dir];
      const nx = cx + dx;
      const ny = cy + dy;
      if (!enterable(nx, ny)) continue;
      const ni = ny * W + nx;
      if (dist[ni] !== -1) continue;
      dist[ni] = dist[cur] + 1;
      from[ni] = cur;
      queue.push(ni);
    }
  }

  // A safe target exists: step along its path.
  const target = chooseTarget(state, dist, W, H, start);
  if (target !== -1 && target !== start) {
    let cur = target;
    while (cur !== start && from[cur] !== start) cur = from[cur];
    const dx = (cur % W) - (start % W);
    const dy = Math.floor(cur / W) - Math.floor(start / W);
    for (const dir of CLOCKWISE) {
      if (DIRS[dir][0] === dx && DIRS[dir][1] === dy) return { move: dir, pause: false };
    }
  }

  // No safe target (boxed in, or everything is sealed): dodge the drift
  // that is about to arrive with the exact one-step simulation, else
  // stand. A found dodge is a legal move; standing is always legal.
  for (const dir of CLOCKWISE) {
    const [dx, dy] = DIRS[dir];
    if (safeMove(state, state.player.x + dx, state.player.y + dy, state.player, next)) {
      return { move: dir, pause: false };
    }
  }
  return { move: null, pause: false };
}
