// Quorum Run: the autopilot bot (DESIGN.md §9).
//
// botInput(state) returns an input { move, pause: false } for the state:
// pure and deterministic. It reads the state and changes nothing — no DOM,
// no Math.random, no clocks, no imports — so it loads on its own and gives
// the same input for the same state every time. The move names of §2 are
// re-declared here for that self-containment.
//
// How it plays. The drift and conflict rules (§6 steps 10 and 11) do not
// depend on the player, so botInput simulates them ahead on the grid and
// then searches for a safe path over (cell, tick) pairs:
//
//   - while gathering, to the nearest lying patch its hands can still take;
//   - to the merge pad once the hands are full or the level's quorum is
//     within reach of what is carried;
//   - and to the exit once the level is open, walking straight through
//     drifts while the invulnerability of §6 step 12 lasts.
//
// A path waits out conflicts (§6 step 5) and ducks drifts and crossing
// swaps (§6 step 12); waiting is a legal step, and ends of paths are safe
// because every transition is checked. When no safe path exists it falls
// back to the one-step move that gets closest to the target, and illegal
// moves are harmless anyway (§6 step 6 makes the player stay).

const CARRY_MAX = 3; // §2
const CONFLICT_TICKS = 10; // §2
const DIR_NAMES = ['up', 'right', 'down', 'left']; // CLOCKWISE, §2
const DIR_VECTORS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

// Terrain characters of a parsed level (§4); '@', 'P' and drift starts are
// floors there, while 'M', 'X' and 'H' keep their meaning.
const WALL = 35; // '#'
const HOLD = 72; // 'H'
const EXIT = 88; // 'X'
const MERGE = 77; // 'M'

const MAX_CELLS = 32 * 24; // §4 caps a level's size
const MAX_HORIZON = 96; // how far ahead the bot plans
const WAIT_MOVE = 0; // plan marker: the first planned step is a wait

// Scratch buffers shared by every call: reset before use and written before
// read, so they carry nothing between calls and purity is kept.
const visitedBuf = new Uint8Array((MAX_HORIZON + 1) * MAX_CELLS);
const parentBuf = new Int32Array((MAX_HORIZON + 1) * MAX_CELLS);
const fBuf = new Int32Array((MAX_HORIZON + 1) * MAX_CELLS);
const heapBuf = [];
const distBuf = new Int16Array(MAX_CELLS);
const queueBuf = new Int32Array(MAX_CELLS);

const NO_SET = new Set();

function charAt(tiles, w, cell) {
  const y = (cell / w) | 0;
  const x = cell - y * w;
  const row = tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return WALL;
  const code = row.charCodeAt(x);
  return code === 0 ? WALL : code;
}

function manhattan(w, cell, tx, ty) {
  const y = (cell / w) | 0;
  return Math.abs((cell - y * w) - tx) + Math.abs(y - ty);
}

// Plain distance map over the terrain (§6 step 6 passability for the
// player; conflicts and drifts are ignored because they never bind the
// terrain): -1 marks a cell the player can never reach this tick.
// NOTE: the returned array is the shared distBuf.
function bfsDistances(tiles, w, h, fromCell, open) {
  const dist = distBuf;
  dist.fill(-1, 0, w * h);
  const queue = queueBuf;
  let head = 0;
  let tail = 0;
  dist[fromCell] = 0;
  queue[tail++] = fromCell;
  while (head < tail) {
    const cell = queue[head++];
    const y = (cell / w) | 0;
    const x = cell - y * w;
    const d = dist[cell] + 1;
    for (let k = 0; k < 4; k++) {
      const v = DIR_VECTORS[DIR_NAMES[k]];
      const nx = x + v[0];
      const ny = y + v[1];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const ncell = ny * w + nx;
      if (dist[ncell] !== -1) continue;
      const ch = charAt(tiles, w, ncell);
      if (ch === WALL) continue;
      if ((ch === HOLD || ch === EXIT) && !open) continue;
      dist[ncell] = d;
      queue[tail++] = ncell;
    }
  }
  return dist;
}

function nearestCell(cells, dist) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (cell < 0) continue;
    const d = dist[cell];
    if (d !== -1 && d < bestD) {
      bestD = d;
      best = cell;
    }
  }
  return best;
}

// Simulates §6 steps 5, 10 and 11 for horizon steps: for each step the
// conflict cells after their ageing, the drift cells after their move, and
// the (from, to) cell pairs of the drifts that moved that step. All of it
// is player-independent, so it is exact for the horizon of the plan.
function simulate(state, w, h, horizon) {
  const tiles = state.level.tiles;
  const period = Math.max(1, state.level.driftPeriod | 0);
  const tick0 = state.tick | 0;
  const driftList = Array.isArray(state.drifts) ? state.drifts : [];
  const n = driftList.length;
  const dx = new Int16Array(n);
  const dy = new Int16Array(n);
  const dd = new Int8Array(n);
  const dirIndex = new Map(DIR_NAMES.map((name, k) => [name, k]));
  for (let i = 0; i < n; i++) {
    const d = driftList[i] || {};
    dx[i] = Number.isInteger(d.x) ? d.x : 0;
    dy[i] = Number.isInteger(d.y) ? d.y : 0;
    dd[i] = dirIndex.has(d.dir) ? dirIndex.get(d.dir) : 0;
  }
  const conflicts = new Map(); // cell -> ttl, as of the end of the last step
  const confList = Array.isArray(state.conflicts) ? state.conflicts : [];
  for (let i = 0; i < confList.length; i++) {
    const c = confList[i] || {};
    if (!Number.isInteger(c.x) || !Number.isInteger(c.y)) continue;
    if (c.x < 0 || c.x >= w || c.y < 0 || c.y >= h) continue;
    const ttl = c.ttl | 0;
    const cell = c.y * w + c.x;
    if (ttl > (conflicts.get(cell) || 0)) conflicts.set(cell, ttl);
  }
  const reverse = [2, 3, 0, 1]; // up<->down, right<->left
  const blockedByStep = new Array(horizon + 1);
  const driftsByStep = new Array(horizon + 1);
  const swapsByStep = new Array(horizon + 1);

  for (let t = 1; t <= horizon; t++) {
    // §6 step 5: conflicts age; a conflict blocks while its ttl is above 0.
    const blocked = new Set();
    for (const [cell, ttl] of conflicts) if (ttl > 1) blocked.add(cell);
    for (const [cell, ttl] of conflicts) {
      if (ttl > 1) conflicts.set(cell, ttl - 1);
      else conflicts.delete(cell);
    }
    blockedByStep[t] = blocked;

    const moved = (tick0 + t) % period === 0; // §6 step 10's condition
    const pre = new Int16Array(n);
    for (let i = 0; i < n; i++) pre[i] = dy[i] * w + dx[i];
    const post = new Int16Array(n);
    for (let i = 0; i < n; i++) post[i] = pre[i];

    if (moved) {
      // §6 step 10: each drift in array order turns clockwise to the first
      // passable target and moves; with none passable it stays and keeps
      // its direction. Drifts ignore the player, patches, and each other.
      for (let i = 0; i < n; i++) {
        const dir = dd[i];
        let placed = false;
        for (let s = 0; s < 4; s++) {
          const nd = (dir + s) & 3;
          const v = DIR_VECTORS[DIR_NAMES[nd]];
          const nx = dx[i] + v[0];
          const ny = dy[i] + v[1];
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ncell = ny * w + nx;
          if (blocked.has(ncell)) continue;
          const row = tiles[ny];
          if (row === undefined) continue;
          if (nx >= row.length) continue;
          const ch = row.charCodeAt(nx);
          if (ch === WALL || ch === HOLD || ch === EXIT) continue;
          dx[i] = nx;
          dy[i] = ny;
          dd[i] = nd;
          post[i] = ncell;
          placed = true;
          break;
        }
        if (!placed) post[i] = pre[i];
      }
      // §6 step 11: cells holding two or more drifts reverse everyone
      // there (up<->down, left<->right) and gain one conflict, unless
      // there already is one on the cell.
      const counts = new Map();
      for (let i = 0; i < n; i++) counts.set(post[i], (counts.get(post[i]) || 0) + 1);
      for (const [cell, count] of counts) {
        if (count < 2) continue;
        for (let i = 0; i < n; i++) {
          if (post[i] === cell) dd[i] = reverse[dd[i]];
        }
        if (!conflicts.has(cell)) conflicts.set(cell, CONFLICT_TICKS);
      }
    }

    const driftSet = new Set();
    for (let i = 0; i < n; i++) driftSet.add(post[i]);
    driftsByStep[t] = driftSet;

    // §6 step 12's swap rule: a drift that moved where the player is from,
    // is a hit; pairs are (from, to) of every drift that moved this step.
    const swaps = NO_SET;
    if (moved) {
      const sw = new Set();
      for (let i = 0; i < n; i++) {
        if (post[i] !== pre[i]) sw.add(pre[i] * 1024 + post[i]);
      }
      swapsByStep[t] = sw;
    } else {
      swapsByStep[t] = swaps;
    }
  }

  return {
    blocked: blockedByStep,
    drifts: driftsByStep,
    swaps: swapsByStep,
    // Invulnerability left when step t's hit check runs (§6 step 12 drops
    // it by one every step and nothing hits while it lasts).
    invulnAt(t) {
      const v = (state.invuln | 0) - (t - 1);
      return v > 0 ? v : 0;
    },
  };
}

function packSwap(from, to) {
  return from * 1024 + to;
}

// A* over (cell, tick). Returns the first move of a safe path to the target
// ('up'... 'left'), WAIT_MOVE for a plan whose first step is a wait, or
// null when no safe path exists within the horizon. Transitions follow §6:
// terrain and conflicts gate every move, every step must end off every
// drift and off every crossing swap unless invulnerability covers it, and
// a wait is an ordinary step. The exit may only be a goal, never a passage.
function planMove(sim, w, h, tiles, open, exitCell, target, start) {
  const cells = w * h;
  const horizon = sim.blocked.length - 1;
  const size = (horizon + 1) * cells;
  let visited;
  let parent;
  let f;
  let heap;
  let scratch = true;
  if (size <= visitedBuf.length) {
    visited = visitedBuf;
    visited.fill(0, 0, size);
    parent = parentBuf;
    f = fBuf;
    heap = heapBuf;
    heap.length = 0;
  } else {
    scratch = false;
    visited = new Uint8Array(size);
    parent = new Int32Array(size);
    f = new Int32Array(size);
    heap = [];
  }
  const tx = target % w;
  const ty = (target / w) | 0;
  const hOf = (cell) => manhattan(w, cell, tx, ty);
  const less = (a, b) => {
    const fa = f[a];
    const fb = f[b];
    return fa < fb || (fa === fb && a < b);
  };
  const push = (node) => {
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const pn = heap[p];
      if (less(pn, node)) break;
      heap[i] = pn;
      i = p;
    }
    heap[i] = node;
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    const count = heap.length;
    if (count > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= count) break;
        if (c + 1 < count && less(heap[c + 1], heap[c])) c += 1;
        if (less(heap[c], last)) {
          heap[i] = heap[c];
          i = c;
        } else break;
      }
      heap[i] = last;
    }
    return top;
  };

  const startNode = start; // node at tick 0 is just the cell index
  f[startNode] = hOf(start);
  push(startNode);

  while (heap.length > 0) {
    const node = pop();
    if (visited[node]) continue;
    visited[node] = 1;
    const t = (node / cells) | 0;
    const cell = node - t * cells;
    if (cell === target && t > 0) {
      // Walk the parents back to the start; the child of the start names
      // the first move, and here it is always at tick 1.
      let cur = node;
      let prev = cur;
      while (cur !== startNode) {
        prev = cur;
        cur = parent[cur];
      }
      const firstCell = prev - cells; // t = 1
      if (firstCell === start) return WAIT_MOVE;
      const fy = (firstCell / w) | 0;
      const fx = firstCell - fy * w;
      const sy = (start / w) | 0;
      const sx = start - sy * w;
      if (fy === sy - 1 && fx === sx) return 'up';
      if (fy === sy && fx === sx + 1) return 'right';
      if (fy === sy + 1 && fx === sx) return 'down';
      return 'left';
    }
    if (t >= horizon) continue;
    const nt = t + 1;
    const inv = sim.invulnAt(nt);
    const blocked = sim.blocked[nt];
    const drifts = sim.drifts[nt];
    const swaps = sim.swaps[nt];
    const cy = (cell / w) | 0;
    const cx = cell - cy * w;
    for (let opt = 0; opt <= 4; opt++) {
      let np;
      if (opt === 0) {
        np = cell; // wait in place; the terrain is the player's own cell
      } else {
        const v = DIR_VECTORS[DIR_NAMES[opt - 1]];
        const nx = cx + v[0];
        const ny = cy + v[1];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        np = ny * w + nx;
        const ch = charAt(tiles, w, np);
        if (ch === WALL) continue;
        if ((ch === HOLD || ch === EXIT) && !open) continue;
        // While open the exit ends the level (§6 step 9), so no plan may
        // pass through it: only the exit as the goal itself may be stepped
        // on, and that ends the search at the goal check.
        if (open && np === exitCell && np !== target) continue;
      }
      if (blocked.has(np)) continue; // §6 step 6: no conflict on the target
      if (inv === 0) {
        if (drifts.has(np)) continue; // §6 step 12: a drift on the cell
        if (opt !== 0 && swaps.has(packSwap(np, cell))) continue;
      }
      const nf = nt + hOf(np);
      if (nf > horizon) continue;
      const nn = nt * cells + np;
      if (visited[nn]) continue;
      parent[nn] = node;
      f[nn] = nf;
      push(nn);
    }
  }
  return null; // no safe path within the horizon
}

// One-step chooser when the A* found nothing safe: prefer safe and legal
// steps over merely legal ones, both ranked by the distance left to the
// target. A drift hit is legal, just bad, so it still makes way.
function greedyMove(sim, w, h, tiles, open, exitCell, target, start, distTo) {
  const blocked = sim.blocked[1];
  const drifts = sim.drifts[1];
  const swaps = sim.swaps[1];
  const inv = sim.invulnAt(1);
  const sy = (start / w) | 0;
  const sx = start - sy * w;
  let bestSafe = null;
  let bestAny = null;
  const consider = (opt, np, safeWhenInv) => {
    let safe;
    if (safeWhenInv) {
      // waits only collide with a drift standing on the cell
      safe = inv > 0 || !drifts.has(np);
    } else {
      safe = inv > 0 || (!drifts.has(np) && !swaps.has(packSwap(np, start)));
    }
    const d = distTo[np];
    const rank = (d === -1 ? 9999 : d) * 8 + (opt === 0 ? 4 : opt - 1);
    if (safe && (bestSafe === null || rank < bestSafe.rank)) bestSafe = { rank, opt };
    if (bestAny === null || rank < bestAny.rank) bestAny = { rank, opt };
  };
  for (let opt = 1; opt <= 4; opt++) {
    const v = DIR_VECTORS[DIR_NAMES[opt - 1]];
    const x = sx + v[0];
    const y = sy + v[1];
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const np = y * w + x;
    const ch = charAt(tiles, w, np);
    if (ch === WALL) continue;
    if ((ch === HOLD || ch === EXIT) && !open) continue;
    if (open && np === exitCell && np !== target) continue;
    if (blocked.has(np)) continue;
    consider(opt, np, false);
  }
  consider(0, start, true); // waiting is always legal
  const pick = bestSafe !== null ? bestSafe : bestAny;
  if (pick === null) return null;
  return pick.opt === 0 ? null : DIR_NAMES[pick.opt - 1];
}

// Steps off a spawn point the bot stands on, so §6 step 13 can spawn on it
// again (it skips the player's cell): the first of up/right/down/left that
// is legal and safe, else merely legal, else a wait.
function asideMove(sim, w, h, tiles, start) {
  const blocked = sim.blocked[1];
  const drifts = sim.drifts[1];
  const swaps = sim.swaps[1];
  const inv = sim.invulnAt(1);
  const sy = (start / w) | 0;
  const sx = start - sy * w;
  let any = null;
  for (let opt = 1; opt <= 4; opt++) {
    const v = DIR_VECTORS[DIR_NAMES[opt - 1]];
    const x = sx + v[0];
    const y = sy + v[1];
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const np = y * w + x;
    const ch = charAt(tiles, w, np);
    if (ch === WALL || ch === HOLD || ch === EXIT) continue;
    if (blocked.has(np)) continue;
    if (inv > 0 || (!drifts.has(np) && !swaps.has(packSwap(np, start)))) {
      return DIR_NAMES[opt - 1];
    }
    if (any === null) any = DIR_NAMES[opt - 1];
  }
  return any;
}

// The bot (§9): an input for the state, pure and deterministic.
export function botInput(state) {
  const IDLE = { move: null, pause: false };
  if (state === null || state === undefined || typeof state !== 'object') return IDLE;
  if (state.status !== 'playing') return IDLE;
  const level = state.level;
  if (level === null || level === undefined || typeof level !== 'object') return IDLE;
  const tiles = level.tiles;
  if (!Array.isArray(tiles) || tiles.length === 0) return IDLE;
  const w = level.width | 0;
  const h = level.height | 0;
  if (w <= 0 || h <= 0 || tiles.length !== h) return IDLE;
  const p = state.player;
  if (p === null || p === undefined || typeof p !== 'object') return IDLE;
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) return IDLE;
  if (p.x < 0 || p.x >= w || p.y < 0 || p.y >= h) return IDLE;

  const open = state.open === true;
  const start = p.y * w + p.x;

  // Merge pads and the exit (§4 keeps 'M' and 'X' in the tiles), reading
  // order.
  let exitCell = -1;
  const merges = [];
  for (let y = 0; y < h; y++) {
    const row = tiles[y];
    if (row === undefined) continue;
    const count = Math.min(w, row.length);
    for (let x = 0; x < count; x++) {
      const ch = row.charCodeAt(x);
      if (ch === MERGE) merges.push(y * w + x);
      else if (ch === EXIT) exitCell = y * w + x;
    }
  }
  const spawnDefs = Array.isArray(level.spawns) ? level.spawns : [];
  const spawnCells = [];
  for (let i = 0; i < spawnDefs.length; i++) {
    const s = spawnDefs[i] || {};
    if (Number.isInteger(s.x) && Number.isInteger(s.y) && s.x >= 0 && s.x < w && s.y >= 0 && s.y < h) {
      spawnCells.push(s.y * w + s.x);
    }
  }

  // Distances over the terrain from the player (they still reach a target
  // lost behind a conflict that ages away, so conflicts are ignored here).
  const dist = bfsDistances(tiles, w, h, start, open);

  const carried = Array.isArray(state.carried) ? state.carried.length : 0;
  const patches = Array.isArray(state.patches) ? state.patches : [];
  const mergesDone = Number.isInteger(state.merges) ? state.merges : 0;
  const quorum = Number.isInteger(level.quorum) ? Math.max(1, level.quorum) : 1;

  let target = -1;
  let campCell = -1;
  if (open) {
    target = exitCell; // ship the level now
  } else {
    const need = quorum > mergesDone ? quorum - mergesDone : 1;
    if (carried >= CARRY_MAX || (carried > 0 && carried >= need)) {
      // Full hands, or a merge would land the quorum: get it merged. The
      // merge pad empties the hands and raises merges toward the quorum.
      target = nearestCell(merges, dist);
    } else {
      // Gather: the nearest lying patch in reading order.
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < patches.length; i++) {
        const q = patches[i] || {};
        if (!Number.isInteger(q.x) || !Number.isInteger(q.y)) continue;
        if (q.x < 0 || q.x >= w || q.y < 0 || q.y >= h) continue;
        const cell = q.y * w + q.x;
        if (cell === start) continue;
        const d = dist[cell];
        if (d !== -1 && d < bestD) {
          bestD = d;
          best = cell;
        }
      }
      target = best;
      if (target < 0 && carried > 0) target = nearestCell(merges, dist);
      if (target < 0) {
        // Nothing to fetch: wait for spawns by their points, but keep off
        // the point itself (it has to be free for a spawn to land there).
        const sp = nearestCell(spawnCells, dist);
        if (sp >= 0 && sp !== start) target = sp;
        else if (sp === start) campCell = sp;
      }
    }
  }

  if (campCell >= 0) {
    return { move: asideMove(simulate(state, w, h, 4), w, h, tiles, start), pause: false };
  }
  if (target < 0 || target === start) return IDLE;

  const d0 = dist[target] === -1 ? 64 : dist[target];
  const horizon = Math.min(MAX_HORIZON, Math.max(24, d0 * 3 + 24));
  const plan = planMove(simulate(state, w, h, horizon), w, h, tiles, open, exitCell, target, start);
  if (plan !== null) return { move: plan === WAIT_MOVE ? null : plan, pause: false };

  // No safe path within the horizon: choose one sane step toward the target
  // instead. NOTE: bfsDistances reuses its buffer, so dist is dead from here
  // on and the distance-to-target map takes its place.
  const sim = simulate(state, w, h, 1);
  const distTo = bfsDistances(tiles, w, h, target, open);
  return { move: greedyMove(sim, w, h, tiles, open, exitCell, target, start, distTo), pause: false };
}
