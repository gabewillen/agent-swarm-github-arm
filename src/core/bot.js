// Quorum Run's autopilot (DESIGN.md §9): pure and deterministic. It
// simulates the rules exactly for a horizon of steps, then searches over
// (cell, arrival step) so a move is only returned when no drift will be
// on the cell it lands on and no conflict blocks it. Strategy: fetch
// patches in as big a batch as is sensible (merging n at once is worth
// PATCH_BASE * n * n), merge at full hands, merge early when that lands
// the quorum, then take the exit. It never pauses.

import { CARRY_MAX, CLOCKWISE, CONFLICT_TICKS, DIRS } from './constants.js';

// How many future steps the planner predicts exactly.
const HORIZON = 48;

// Expansion order, reverse turns, move deltas.
const MOVES = ['up', 'right', 'down', 'left'];
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const DELTAS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// The only input the bot ever gives when there is nothing to do.
const IDLE = Object.freeze({ move: null, pause: false });

export function botInput(state) {
  try {
    if (!state || typeof state !== 'object') return IDLE;
    if (state.status !== 'playing' || state.paused) return IDLE;
    const level = state.level;
    if (!level || !Array.isArray(level.tiles) || level.tiles.length === 0) return IDLE;
    return decide(state, level) || IDLE;
  } catch {
    return IDLE;
  }
}

function decide(state, level) {
  const tiles = level.tiles;
  const height = tiles.length;
  const width = tiles[0].length;
  const cellCount = width * height;
  const tick = state.tick | 0;
  const invuln = state.invuln | 0;
  const open = !!state.open;
  const period = Math.max(1, level.driftPeriod | 0);

  const idx = (x, y) => y * width + x;
  const terrain = (x, y) => {
    if (y < 0 || y >= height) return '#';
    const row = tiles[y];
    if (x < 0 || x >= row.length) return '#';
    return row[x];
  };
  const chOf = (cell) => terrain(cell % width, (cell / width) | 0);

  const player = state.player;
  const startCell = idx(player.x | 0, player.y | 0);

  // A cell the player may not enter: walls, closed holds, and the exit
  // unless it is open and is the goal itself (stepping onto an open exit
  // ships the level, so an open exit is a goal, never a corridor).
  const staticBlocked = (cell, allowExit) => {
    const ch = chOf(cell);
    if (ch === '#' || ch === 'H') return true;
    if (ch === 'X') return !(allowExit && open);
    return false;
  };

  // ---- Terrain scan: merge pads and the exit. ----
  const pads = [];
  let exitCell = -1;
  for (let cell = 0; cell < cellCount; cell++) {
    const ch = chOf(cell);
    if (ch === 'M') pads.push(cell);
    else if (ch === 'X') exitCell = cell;
  }

  // ---- Exact prediction of drifts and conflicts, HORIZON steps on. ----
  // Drifts ignore the player completely, so their motion is a pure
  // function of the starting state and each future step's tick parity.
  const EMPTY = { mask: null, occ: null, pairs: null };
  const steps = predict();
  function predict() {
    const drifts = (state.drifts || []).map((d) => ({ x: d.x | 0, y: d.y | 0, dir: d.dir }));
    const conf = new Int32Array(cellCount);
    for (const c of state.conflicts || []) {
      const cell = idx(c.x | 0, c.y | 0);
      const ttl = c.ttl | 0;
      if (ttl > conf[cell]) conf[cell] = ttl;
    }
    if (drifts.length === 0) {
      // No drifts, but conflicts still age.
      const out = [];
      for (let k = 1; k <= HORIZON; k++) {
        let any = false;
        for (let i = 0; i < cellCount; i++) {
          if (conf[i] > 0) {
            conf[i]--;
            if (conf[i] > 0) any = true;
          }
        }
        let mask = null;
        if (any) {
          mask = new Uint8Array(cellCount);
          for (let i = 0; i < cellCount; i++) if (conf[i] > 0) mask[i] = 1;
        }
        out.push({ mask, occ: null, pairs: null });
      }
      return out;
    }
    const out = [];
    for (let k = 1; k <= HORIZON; k++) {
      // Conflicts age before anything moves this step.
      let any = false;
      for (let i = 0; i < cellCount; i++) {
        if (conf[i] > 0) {
          conf[i]--;
          if (conf[i] > 0) any = true;
        }
      }
      let mask = null;
      if (any) {
        mask = new Uint8Array(cellCount);
        for (let i = 0; i < cellCount; i++) if (conf[i] > 0) mask[i] = 1;
      }
      let pairs = [];
      if ((tick + k) % period === 0) {
        pairs = [];
        for (const d of drifts) {
          const pre = idx(d.x, d.y);
          let at = CLOCKWISE.indexOf(d.dir);
          if (at < 0) at = 0;
          for (let r = 0; r < 4; r++) {
            const dir = CLOCKWISE[(at + r) & 3];
            const dx = DIRS[dir][0];
            const dy = DIRS[dir][1];
            const nx = d.x + dx;
            const ny = d.y + dy;
            const ch = terrain(nx, ny);
            if (ch !== '#' && ch !== 'H' && ch !== 'X' && conf[idx(nx, ny)] === 0) {
              d.x = nx;
              d.y = ny;
              d.dir = dir;
              break;
            }
          }
          pairs.push(pre, idx(d.x, d.y));
        }
        // Two drifts on one cell: both reverse, and a conflict forms.
        const counts = new Int32Array(cellCount);
        for (const d of drifts) counts[idx(d.x, d.y)]++;
        for (let i = 0; i < cellCount; i++) {
          if (counts[i] >= 2) {
            const x = i % width;
            const y = (i / width) | 0;
            for (const d of drifts) if (d.x === x && d.y === y) d.dir = REVERSE[d.dir];
            if (conf[i] === 0) conf[i] = CONFLICT_TICKS;
          }
        }
      }
      const occ = new Uint8Array(cellCount);
      for (const d of drifts) occ[idx(d.x, d.y)] = 1;
      out.push({ mask, occ, pairs: pairs.length > 0 ? pairs : null });
    }
    return out;
  }
  const stepAt = (k) => (steps ? steps[k] : EMPTY); // k: 0-based future step

  // A drift that moved `to` -> `from` while the player moves `from` ->
  // `to` swaps cells with the player: a hit.
  const swapHit = (step, to, from) => {
    const p = step.pairs;
    if (!p || to === from) return false;
    for (let j = 0; j < p.length; j += 2) {
      if (p[j] === to && p[j + 1] === from) return true;
    }
    return false;
  };

  // ---- Optimistic distances: terrain only, no drifts or conflicts. ----
  const field = new Int32Array(cellCount).fill(-1);
  {
    const blockedOptimistic = (cell) => {
      const ch = chOf(cell);
      return ch === '#' || ch === 'H' || (ch === 'X' && !open);
    };
    field[startCell] = 0;
    const queue = [startCell];
    for (let qh = 0; qh < queue.length; qh++) {
      const cell = queue[qh];
      const x = cell % width;
      const y = (cell / width) | 0;
      for (let mi = 0; mi < 4; mi++) {
        const nx = x + DELTAS[mi][0];
        const ny = y + DELTAS[mi][1];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const ncell = idx(nx, ny);
        if (field[ncell] !== -1 || blockedOptimistic(ncell)) continue;
        field[ncell] = field[cell] + 1;
        queue.push(ncell);
      }
    }
  }

  // ---- Goal selection. ----
  const patches = [];
  for (const p of state.patches || []) patches.push(idx(p.x | 0, p.y | 0));
  const patchSet = new Set(patches);
  const nearest = (cells) => {
    let best = Infinity;
    let cell = -1;
    for (const c of cells) {
      const d = field[c];
      if (d >= 0 && d < best) {
        best = d;
        cell = c;
      }
    }
    return { d: best, cell };
  };
  const patchNear = nearest(patches);
  const padNear = nearest(pads);
  const exitDist = exitCell >= 0 ? field[exitCell] : Infinity;
  const freeSpawns = (level.spawns || [])
    .map((s) => idx(s.x | 0, s.y | 0))
    .filter((c) => !patchSet.has(c));
  const stageNear = nearest(freeSpawns);

  const carriedN = Math.min(state.carried === undefined ? 0 : state.carried.length, CARRY_MAX);
  const merges = state.merges | 0;
  const quorum = level.quorum | 0;

  let goalKind = null;
  let allowExit = false;
  if (open) {
    // Head for the exit; while carrying, a near merge pad is worth a
    // detour because batches score much more than lone patches.
    let detour = false;
    if (carriedN > 0 && pads.length > 0 && padNear.d < Infinity) {
      if (carriedN >= CARRY_MAX) detour = true;
      else if (exitDist === Infinity) detour = carriedN >= 2 || patchNear.d === Infinity;
      else if (carriedN >= 2 && padNear.d <= exitDist) detour = true;
      else if (carriedN === 1 && padNear.d + 4 <= exitDist) detour = true;
    }
    goalKind = detour ? 'pad' : 'exit';
    allowExit = goalKind === 'exit';
  } else if (carriedN >= CARRY_MAX) {
    goalKind = pads.length > 0 ? 'pad' : 'patch';
  } else if (carriedN > 0 && merges + carriedN >= quorum && padNear.d <= patchNear.d + 1) {
    // Merging now lands the quorum and opens the doors.
    goalKind = 'pad';
  } else if (carriedN === 0) {
    if (patchNear.d < Infinity) goalKind = 'patch';
    else if (stageNear.d < Infinity) goalKind = 'stage';
    else if (padNear.d < Infinity) goalKind = 'pad';
  } else {
    // Carrying one or two: grab another patch when it is not much out of
    // the way, else bank what is carried on the pad.
    if (patchNear.d < Infinity && patchNear.d <= padNear.d + 2 + 2 * carriedN) goalKind = 'patch';
    else if (padNear.d < Infinity) goalKind = 'pad';
    else if (patchNear.d < Infinity) goalKind = 'patch';
  }

  let goalFn = null;
  let goalCell = -1;
  if (goalKind === 'exit' && exitCell >= 0) {
    goalCell = exitCell;
    goalFn = (c) => c === exitCell;
  } else if (goalKind === 'pad' && pads.length > 0) {
    goalCell = padNear.cell;
    goalFn = (c) => pads.indexOf(c) >= 0;
  } else if (goalKind === 'patch' && patches.length > 0) {
    goalCell = patchNear.cell;
    goalFn = (c) => patchSet.has(c);
  } else if (goalKind === 'stage' && freeSpawns.length > 0) {
    // Stage beside a free spawn point: a patch will appear at a free
    // spawn, and the spawn rule never picks the player's own cell, so
    // stand adjacent, never on it.
    goalCell = stageNear.cell;
    const freeSet = new Set(freeSpawns);
    goalFn = (c) => {
      const x = c % width;
      const y = (c / width) | 0;
      for (let mi = 0; mi < 4; mi++) {
        const nx = x + DELTAS[mi][0];
        const ny = y + DELTAS[mi][1];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (freeSet.has(idx(nx, ny))) return true;
      }
      return false;
    };
  } else {
    goalKind = null;
  }

  // ---- Routing. undefined: no route found; null: it is safe to wait ----
  // ---- for a step; a string: the move to take this tick. -----------

  // Arrival step caches for one decisive path search.
  const layers = HORIZON + 1;
  const visited = new Uint8Array(cellCount * layers);
  const first = new Int8Array(cellCount * layers).fill(-1);
  const queue = new Int32Array(cellCount * layers);

  // Time-expanded BFS: an arrival at future step k is legal only if the
  // exact prediction says no conflict blocks the move, no drift is on
  // the landing cell (past the immunity window), and no drift swaps
  // cells with the player. Waiting is allowed anywhere.
  function routeStrict(goal, allowExit) {
    visited.fill(0);
    first.fill(-1);
    if (goal(startCell)) return null; // already there: waiting achieves it
    let qh = 0;
    let qt = 0;
    queue[qt++] = startCell; // node = cell + k * cellCount, k = 0
    visited[startCell] = 1;
    while (qh < qt) {
      const node = queue[qh++];
      const cell = node % cellCount;
      const k = (node / cellCount) | 0;
      if (k >= HORIZON) continue;
      const step = stepAt(k); // arrival at k + 1 uses future step k
      const arrive = k + 1;
      const protectedStep = arrive <= invuln;
      const x = cell % width;
      const y = (cell / width) | 0;
      for (let mi = 0; mi < 5; mi++) {
        const wait = mi === 4;
        const nx = wait ? x : x + DELTAS[mi][0];
        const ny = wait ? y : y + DELTAS[mi][1];
        const ncell = wait ? cell : idx(nx, ny);
        if (!wait && staticBlocked(ncell, allowExit)) continue;
        if (step.mask && step.mask[ncell]) continue;
        if (!protectedStep) {
          if (step.occ && step.occ[ncell]) continue;
          if (swapHit(step, ncell, cell)) continue;
        }
        const nnode = ncell + arrive * cellCount;
        if (visited[nnode]) continue;
        visited[nnode] = 1;
        first[nnode] = node === startCell ? (wait ? -1 : mi) : first[node];
        if (goal(ncell)) return first[nnode] < 0 ? null : MOVES[first[nnode]];
        queue[qt++] = nnode;
      }
    }
    return undefined;
  }

  // Amenity zones for the static fall-backs.
  const driftDanger = new Uint8Array(cellCount); // a drift cell or beside one
  const driftCell = new Uint8Array(cellCount); // a drift cell right now
  const conflictCell = new Uint8Array(cellCount); // a conflict cell right now
  for (const d of state.drifts || []) {
    const c = idx(d.x | 0, d.y | 0);
    driftCell[c] = 1;
    driftDanger[c] = 1;
    const x = c % width;
    const y = (c / width) | 0;
    for (let mi = 0; mi < 4; mi++) {
      const nx = x + DELTAS[mi][0];
      const ny = y + DELTAS[mi][1];
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) driftDanger[idx(nx, ny)] = 1;
    }
  }
  for (const c of state.conflicts || []) conflictCell[idx(c.x | 0, c.y | 0)] = 1;

  const dangerZone = (cell) => driftDanger[cell] || conflictCell[cell];
  const driftZone = (cell) => driftCell[cell] || conflictCell[cell];

  // Plain BFS over cells with an extra blocking predicate.
  function routeStatic(extra, goal, allowExit) {
    const dist = new Int32Array(cellCount).fill(-1);
    const move = new Int8Array(cellCount).fill(-1);
    if (goal(startCell)) return null;
    dist[startCell] = 0;
    const q = [startCell];
    for (let qh = 0; qh < q.length; qh++) {
      const cell = q[qh];
      const x = cell % width;
      const y = (cell / width) | 0;
      for (let mi = 0; mi < 4; mi++) {
        const nx = x + DELTAS[mi][0];
        const ny = y + DELTAS[mi][1];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const ncell = idx(nx, ny);
        if (dist[ncell] !== -1) continue;
        if (staticBlocked(ncell, allowExit) || (extra && extra(ncell))) continue;
        dist[ncell] = dist[cell] + 1;
        move[ncell] = dist[cell] === 0 ? mi : move[cell];
        if (goal(ncell)) return move[ncell] < 0 ? null : MOVES[move[ncell]];
        q.push(ncell);
      }
    }
    return undefined;
  }

  let routeMove = undefined;
  if (goalFn) {
    routeMove = routeStrict(goalFn, allowExit);
    if (routeMove === undefined) routeMove = routeStatic(dangerZone, goalFn, allowExit);
    if (routeMove === undefined) routeMove = routeStatic(driftZone, goalFn, allowExit);
    if (routeMove === undefined) routeMove = routeStatic(null, goalFn, allowExit);
  }

  if (routeMove !== undefined) return { move: routeMove ?? null, pause: false };

  // ---- Nothing is reachable: pick the least doomed adjacent step ----
  // (or wait) without moving anything into a known hit this step.
  let bestMove = null;
  let bestScore = -Infinity;
  const step1 = stepAt(0);
  const consider = (mi, ncell) => {
    if (staticBlocked(ncell, goalKind === 'exit')) return;
    if (step1.mask && step1.mask[ncell]) return;
    if (invuln < 1) {
      if (step1.occ && step1.occ[ncell]) return;
      if (swapHit(step1, ncell, startCell)) return;
    }
    let score = 0;
    // Safety: distance to the nearest drift, capped.
    let minDist = 8;
    for (const d of state.drifts || []) {
      const dd = Math.abs((ncell % width) - d.x) + Math.abs(((ncell / width) | 0) - d.y);
      if (dd < minDist) minDist = dd;
    }
    score += Math.min(minDist, 8) * 100;
    // Progress toward the goal cell, when one is known.
    if (goalCell >= 0) {
      const gx = goalCell % width;
      const gy = (goalCell / width) | 0;
      score -= Math.abs((ncell % width) - gx) + Math.abs(((ncell / width) | 0) - gy);
    }
    // Deterministic jitter so symmetric situations settle into a scan.
    score += (ncell * 31 + tick * 17) % 7;
    if (score > bestScore) {
      bestScore = score;
      bestMove = mi < 0 ? null : MOVES[mi];
    }
  };
  for (let mi = 0; mi < 4; mi++) {
    const nx = (startCell % width) + DELTAS[mi][0];
    const ny = ((startCell / width) | 0) + DELTAS[mi][1];
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
    consider(mi, idx(nx, ny));
  }
  consider(-1, startCell); // waiting in place
  return { move: bestMove, pause: false };
}
