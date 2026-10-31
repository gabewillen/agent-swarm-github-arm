// Quorum Run — the autopilot (DESIGN §9).
//
// botInput(state) is pure and deterministic: it reads a game state (§5) and
// returns the next input { move, pause: false }. It picks a target — a patch,
// a merge pad, or the open exit — routes to it with a breadth-first search
// over the grid, and checks the route against a look-ahead simulation of the
// drifts and conflicts (§6 steps 10 to 12), so it fetches patches, merges
// them, dodges drifts, and takes the exit once it is open.
//
// This module imports nothing. It reads only the given state and keeps its
// own copy of the §2 constants, so it stays loadable on its own and is
// pure: no DOM, no clock, and no randomness outside the state's seed (§3).

const CARRY_MAX = 3;          // patches the player can carry (§2)
const CONFLICT_TICKS = 10;    // a conflict's life in ticks (§2)
const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }; // §2
const CLOCKWISE = ['up', 'right', 'down', 'left'];   // turn order (§2)
const DIR_INDEX = { up: 0, right: 1, down: 2, left: 3 };
const DDX = [0, 1, 0, -1];    // per CLOCKWISE: up, right, down, left
const DDY = [-1, 0, 1, 0];
const HORIZON = 12;           // steps of drift look-ahead when planning
const NO_INPUT = { move: null, pause: false };

// Current game state in, next input out.
export function botInput(state) {
  if (!state || state.status !== 'playing' || state.paused) return NO_INPUT;
  const level = state.level;
  const rows = level && level.tiles;
  if (!rows || rows.length === 0) return NO_INPUT;
  const H = Number.isFinite(level.height) && level.height >= 1 ? level.height : rows.length;
  let W = Number.isFinite(level.width) && level.width >= 1 ? level.width : 0;
  if (W < 1) W = rows[0] ? rows[0].length : 0;
  if (W < 1 || H < 1) return NO_INPUT;
  const pl = state.player;
  if (!pl || !Number.isInteger(pl.x) || !Number.isInteger(pl.y) ||
      pl.x < 0 || pl.y < 0 || pl.x >= W || pl.y >= H) return NO_INPUT;
  const N = W * H;
  const p0 = pl.y * W + pl.x;
  const p0x = pl.x;
  const p0y = pl.y;
  const open = !!state.open;

  // Terrain (§4). parseLevel already normalised '@', 'P', and the drift
  // chars to '.', so only '#', 'M', 'X', 'H' and '.' remain.
  const passTile = new Uint8Array(N);   // passable to the player (§6 step 6)
  const driftPass = new Uint8Array(N);  // passable to a drift (§6 step 10)
  const Ms = [];
  const Xs = [];
  for (let y = 0; y < H; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < W; x++) {
      const ch = x < row.length ? row[x] : '#';
      const i = y * W + x;
      if (ch === '#') continue;
      if (ch === 'M') Ms.push(i);
      else if (ch === 'X') Xs.push(i);
      if (ch === '.' || ch === 'M' || (open && (ch === 'H' || ch === 'X'))) passTile[i] = 1;
      if (ch !== 'H' && ch !== 'X') driftPass[i] = 1;
    }
  }
  const exitIdx = Xs.length > 0 ? Xs[0] : -1;

  const spawnSet = new Uint8Array(N);
  const spawnsArr = level.spawns;
  if (Array.isArray(spawnsArr)) {
    for (const sp of spawnsArr) {
      if (sp && Number.isInteger(sp.x) && Number.isInteger(sp.y) &&
          sp.x >= 0 && sp.y >= 0 && sp.x < W && sp.y < H) spawnSet[sp.y * W + sp.x] = 1;
    }
  }

  const patchCells = [];
  const patchesArr = state.patches;
  if (Array.isArray(patchesArr)) {
    for (const pc of patchesArr) {
      if (pc && Number.isInteger(pc.x) && Number.isInteger(pc.y) &&
          pc.x >= 0 && pc.y >= 0 && pc.x < W && pc.y < H) patchCells.push(pc.y * W + pc.x);
    }
  }

  // ---- Look-ahead simulation of the drifts (§6 steps 5, 10, 11).
  //
  // Drifts ignore the player, so their gauntlet is a function of time alone.
  // For each of the next K steps k = 1..K this records:
  //   confG[k] — cells with a live conflict when that step begins (§6 step 5),
  //   daG[k]   — cells with a drift on them when that step ends (§6 step 12),
  //   pairArr[k] — [before, after] pairs of drifts that moved during it, for
  //                the cell-swap hit test (§6 step 12).
  const simDrifts = Array.isArray(state.drifts) ? state.drifts : [];
  const simConflicts = Array.isArray(state.conflicts) ? state.conflicts : [];
  const needsSim = simDrifts.length > 0 || simConflicts.length > 0;
  const K = HORIZON;
  const confG = new Array(K + 1).fill(null);
  const daG = new Array(K + 1).fill(null);
  const pairArr = new Array(K + 1).fill(null);

  if (needsSim) {
    const period = Number.isInteger(level.driftPeriod) && level.driftPeriod >= 1
      ? level.driftPeriod : 1;
    const baseTick = Number.isInteger(state.tick) ? state.tick : 0;
    let ds = [];
    for (const d of simDrifts) {
      if (d && Number.isInteger(d.x) && Number.isInteger(d.y) &&
          d.x >= 0 && d.y >= 0 && d.x < W && d.y < H) {
        ds.push({ x: d.x, y: d.y, dir: DIR_INDEX[d.dir] || 0 });
      }
    }
    let cs = [];
    for (const cf of simConflicts) {
      if (cf && Number.isInteger(cf.x) && Number.isInteger(cf.y) &&
          cf.x >= 0 && cf.y >= 0 && cf.x < W && cf.y < H) {
        cs.push({ x: cf.x, y: cf.y, ttl: cf.ttl | 0 });
      }
    }
    for (let k = 1; k <= K; k++) {
      // Conflicts age before anyone moves (§6 step 5).
      if (cs.length > 0) {
        const alive = [];
        for (const cf of cs) {
          const t = cf.ttl - 1;
          if (t > 0) alive.push({ x: cf.x, y: cf.y, ttl: t });
        }
        cs = alive;
      }
      const cg = new Uint8Array(N);
      for (const cf of cs) cg[cf.y * W + cf.x] = 1;
      confG[k] = cg;

      const da = new Uint8Array(N);
      const pr = [];
      if ((baseTick + k) % period === 0) {
        // Drifts move (§6 step 10): own direction first, then clockwise.
        const before = new Int32Array(ds.length);
        for (let j = 0; j < ds.length; j++) before[j] = ds[j].y * W + ds[j].x;
        for (let j = 0; j < ds.length; j++) {
          const d = ds[j];
          let moved = false;
          for (let t = 0; t < 4; t++) {
            const di = (d.dir + t) % 4;
            const tx = d.x + DDX[di];
            const ty = d.y + DDY[di];
            if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
            const ti = ty * W + tx;
            if (driftPass[ti] && !cg[ti]) {
              d.x = tx;
              d.y = ty;
              d.dir = di;
              moved = true;
              break;
            }
          }
          const aIdx = d.y * W + d.x;
          da[aIdx] = 1;
          if (moved) pr.push(before[j], aIdx);
        }
        // Drift collisions (§6 step 11), only on a tick when drifts moved.
        const spots = new Uint8Array(N);
        for (const d of ds) spots[d.y * W + d.x] += 1;
        for (let i = 0; i < N; i++) {
          if (spots[i] >= 2 && !cg[i]) {
            cs.push({ x: i % W, y: (i / W) | 0, ttl: CONFLICT_TICKS });
          }
        }
        for (const d of ds) {
          if (spots[d.y * W + d.x] >= 2) d.dir = (d.dir + 2) % 4;
        }
      } else {
        // Drifts hold this tick.
        for (const d of ds) da[d.y * W + d.x] = 1;
      }
      daG[k] = da;
      pairArr[k] = pr;
    }
  }

  // ---- Distances from the player, over tiles the player may enter and
  // around conflicts as they will stand next step (§6 step 5).
  const conf1 = confG[1];
  const pDist = bfs(p0, N, W, H, DDX, DDY, passTile, conf1);

  // ---- Pick the target (§9: patches, then the pad, then the exit).
  const carried = Array.isArray(state.carried) ? state.carried.length : 0;
  const quorum = Number.isInteger(level.quorum) ? level.quorum : 1;
  const merges = Number.isInteger(state.merges) ? state.merges : 0;
  const need = Math.max(0, quorum - merges);

  let goal = -1;
  if (open) {
    // Quorum lands, exit open: ship (§6 step 9). Arrival on the exit ends
    // the step before drifts move, so it is always safe to take.
    goal = nearest(Xs, pDist);
  } else if (carried >= CARRY_MAX || (carried > 0 && carried >= need)) {
    // Hands full, or this batch completes the quorum: find the pad.
    goal = nearest(Ms, pDist);
    if (goal < 0 && patchCells.length > 0) goal = nearest(patchCells, pDist);
  } else if (patchCells.length > 0) {
    // Fetch the closest patch; if every one is cut off and the hands are
    // not empty, merge what they hold instead.
    let blockedAll = true;
    for (let i = 0; i < patchCells.length; i++) {
      if (pDist[patchCells[i]] >= 0) { blockedAll = false; break; }
    }
    if (blockedAll && carried > 0 && Ms.length > 0) goal = nearest(Ms, pDist);
    else goal = nearest(patchCells, pDist);
  } else if (carried > 0) {
    goal = nearest(Ms, pDist);
  } else {
    // Nothing to fetch or merge: wait for the next spawn (§6 step 13).
    // A patch never appears on the player's cell, so never block a pad cell.
    if (spawnSet[p0]) {
      let bi = -1;
      let bkv = Infinity;
      for (let i = 0; i < N; i++) {
        if (spawnSet[i] || !passTile[i]) continue;
        const d = pDist[i];
        if (d >= 0 && d < bkv) { bkv = d; bi = i; }
      }
      goal = bi;
    }
  }
  if (goal < 0) return NO_INPUT;

  // ---- Distances to the target for the same legality rules.
  const dGoal = bfs(goal, N, W, H, DDX, DDY, passTile, conf1);

  // No drifts, no conflicts: plain routing is safe.
  if (!needsSim) {
    if (goal === p0) return NO_INPUT;
    const dg0 = dGoal[p0];
    if (dg0 < 0) return NO_INPUT;
    let bv = dg0;
    let bdi = -1;
    for (let di = 0; di < 4; di++) {
      const nx = p0x + DDX[di];
      const ny = p0y + DDY[di];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (!passTile[q]) continue;
      const dq = dGoal[q];
      if (dq >= 0 && dq < bv) { bv = dq; bdi = di; }
    }
    if (bdi < 0) return NO_INPUT;
    return { move: CLOCKWISE[bdi], pause: false };
  }

  // ---- Time-expanded search (§9: "path-finding over the grid").
  //
  // Breadth-first over (step k, cell) under the drift look-ahead: layer k
  // holds every cell the player can hold safely at that step, each transition
  // c -> q passing the drift check of that simulated step. Layer 1 gives the
  // safe first steps; each candidate is then scored by how long a safe plan
  // can follow it (its own fork of the same search), so picks stay alive and
  // make progress instead of waiting out a route that dies a step later.
  const un = (c, q, k) => {
    const cg = confG[k];
    if (cg && q !== c && cg[q]) return true;
    if (open && q === exitIdx) return false;   // shipping ends the step (§6 step 9)
    const dg = daG[k];
    if (dg && dg[q]) return true;              // a drift lands on the player
    const pr = pairArr[k];
    if (pr) {
      for (let i = 0; i < pr.length; i += 2) {
        if (pr[i] === q && pr[i + 1] === c) return true;   // cell swap
      }
    }
    return false;
  };

  const stepFrom = (c, di) => {
    // Cell reached from c by direction di (0..3), or c itself for di = 4
    // (stay). Returns -1 for out of bounds or a wall.
    if (di === 4) return c;
    const nx = (c % W) + DDX[di];
    const ny = ((c / W) | 0) + DDY[di];
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return -1;
    const q = ny * W + nx;
    return passTile[q] ? q : -1;
  };

  // Layer 1: every first step that is safe on its own.
  const layer1 = new Uint8Array(N);
  for (let di = 0; di < 5; di++) {
    const q = stepFrom(p0, di);
    if (q >= 0 && !un(p0, q, 1)) layer1[q] = 1;
  }

  // Candidate first steps. For each direction, if its arrival cell is a safe
  // layer-1 member, measure how far a safe plan can follow it: a dedicated
  // BFS from that cell alone over the sim steps k = 2..K, tracking the
  // deepest layer that still has a choice. Survival first, then progress
  // toward the goal, then order (moves before waiting on full ties).
  const forkDepth = (c1) => {
    let cur = new Uint8Array(N);
    cur[c1] = 1;
    let nxt = new Uint8Array(N);
    let d = 1;
    for (let k = 2; k <= K; k++) {
      nxt.fill(0);
      let any = false;
      for (let c = 0; c < N; c++) {
        if (!cur[c]) continue;
        for (let di = 0; di < 5; di++) {   // four moves, then stay
          const q = stepFrom(c, di);
          if (q < 0) continue;
          if (un(c, q, k)) continue;
          nxt[q] = 1;
          any = true;
        }
      }
      if (!any) break;
      d = k;
      const t = cur; cur = nxt; nxt = t;
    }
    return d;
  };

  let bi = -1;       // best arrival cell so far
  let bDepth = -1;   // its survival depth
  let bDg = 0;       // its goal distance
  for (let ci = 0; ci < 5; ci++) {
    const q = stepFrom(p0, ci);
    if (q < 0) continue;
    if (!layer1[q]) continue;   // not a safe arrival at step 1
    const dep = forkDepth(q);
    const dv = dGoal[q] >= 0 ? dGoal[q] : 10000;
    if (dep > bDepth || (dep === bDepth && dv < bDg)) {
      bDepth = dep;
      bDg = dv;
      bi = q;
    }
  }
  if (bi < 0) return NO_INPUT;   // no safe first step at all
  if (bi === p0) return NO_INPUT;   // waiting is at least as good: hold
  const dx = (bi % W) - p0x;
  const dy = ((bi / W) | 0) - p0y;
  for (let di = 0; di < 4; di++) {
    if (DDX[di] === dx && DDY[di] === dy) return { move: CLOCKWISE[di], pause: false };
  }
  return NO_INPUT;
}

// Breadth-first distances over the grid cells a player may enter, with
// conflict cells blocked. Returns an Int16Array where -1 means unreachable.
function bfs(from, N, W, H, DDX, DDY, passTile, conf) {
  const dist = new Int16Array(N).fill(-1);
  const queue = new Int32Array(N);
  queue[0] = from;
  dist[from] = 0;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const c = queue[head++];
    const cx = c % W;
    const cy = (c / W) | 0;
    const dHere = dist[c];
    for (let di = 0; di < 4; di++) {
      const nx = cx + DDX[di];
      const ny = cy + DDY[di];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (dist[q] >= 0 || !passTile[q]) continue;
      if (conf && conf[q]) continue;
      dist[q] = dHere + 1;
      queue[tail++] = q;
    }
  }
  return dist;
}

// The "closest" candidate cell: reachable ones first, then by distance from
// the player, then in reading order. Returns -1 for an empty list.
function nearest(cells, pDist) {
  if (cells.length === 0) return -1;
  let bi = cells[0];
  let bk = rank(pDist[cells[0]], cells[0]);
  for (let i = 1; i < cells.length; i++) {
    const k = rank(pDist[cells[i]], cells[i]);
    if (k < bk) { bk = k; bi = cells[i]; }
  }
  return bi;
}

function rank(dist, idx) {
  return dist >= 0 ? dist : 100000 + idx;
}
