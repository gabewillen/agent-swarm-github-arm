// Quorum Run — the autopilot (DESIGN.md §9).
//
// botInput(state) returns an input { move, pause: false } for the state:
// pure, deterministic, a function of the state alone.
//
// How it plays: drifts and conflicts never depend on the player, so it
// replays §6 steps 5, 10 and 11 forward to know exactly where every drift
// will be, then plans over a time-expanded grid — every move it takes is
// timed so no drift lands on the player or swaps cells with it. It picks a
// target by the game's needs (a reachable patch, then a merge pad when the
// hands are full or the quorum is satisfied, the exit once it is open, and
// a spawn point to camp when the board is dry), walks there, and falls
// back to a short-horizon dodge that never walks into an immediate hit.

import { DIRS, CLOCKWISE, CARRY_MAX, CONFLICT_TICKS } from './constants.js';

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const DIRS4 = CLOCKWISE; // ['up', 'right', 'down', 'left'] — the turn order
const HORIZON = 40; // forecast and plan that many ticks ahead

// Where a drift can go (§6 step 10): no walls, holds or exits, ever, and
// no conflict cell this tick.
function driftBlocked(rows, W, H, x, y, conflicts) {
  if (x < 0 || x >= W || y < 0 || y >= H) return true;
  const ch = rows[y][x];
  if (ch === '#' || ch === 'H' || ch === 'X') return true;
  return conflicts[y * W + x] === 1;
}

// Replays §6 steps 5, 10 and 11 for `horizon` ticks. With player moves the
// only feedback loop into conflicts is drift-vs-drift, which nothing the
// player does changes, so the forecast matches the real game tick for tick.
// Returns { D, C }:
//   D[t] — Int32Array of drift cells after tick t's movement (D[0] is now);
//   C[t] — Uint8Array of conflict cells during tick t's player phase.
function forecast(rows, W, H, drifts, conflicts, tick, period, horizon) {
  const n = W * H;
  const dr = drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  let conf = conflicts.map((c) => ({ x: c.x, y: c.y, ttl: c.ttl }));
  if (!(period > 0)) period = 1;
  const D = [new Int32Array(dr.length)];
  for (let i = 0; i < dr.length; i++) D[0][i] = dr[i].y * W + dr[i].x;
  const C = [null];
  for (let t = 1; t <= horizon; t++) {
    if (conf.length) {
      conf = conf
        .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }))
        .filter((c) => c.ttl > 0);
    }
    const cmark = new Uint8Array(n);
    for (const c of conf) cmark[c.y * W + c.x] = 1;
    C.push(cmark);
    if ((tick + t) % period === 0) {
      for (const d of dr) {
        let from = CLOCKWISE.indexOf(d.dir);
        if (from < 0) from = 0;
        for (let k = 0; k < 4; k++) {
          const dir = CLOCKWISE[(from + k) & 3];
          const nx = d.x + DIRS[dir][0];
          const ny = d.y + DIRS[dir][1];
          if (driftBlocked(rows, W, H, nx, ny, cmark)) continue;
          d.x = nx;
          d.y = ny;
          d.dir = dir;
          break;
        }
      }
      const at = new Map();
      for (const d of dr) {
        const k = d.y * W + d.x;
        let list = at.get(k);
        if (!list) {
          list = [];
          at.set(k, list);
        }
        list.push(d);
      }
      if (at.size < dr.length) {
        for (const k of [...at.keys()].sort((a, b) => a - b)) {
          const ds = at.get(k);
          if (ds.length >= 2) {
            for (const d of ds) {
              const o = OPPOSITE[d.dir];
              if (o) d.dir = o;
            }
            if (!cmark[k]) {
              conf.push({ x: k % W, y: (k / W) | 0, ttl: CONFLICT_TICKS });
            }
          }
        }
      }
    }
    const dd = new Int32Array(dr.length);
    for (let i = 0; i < dr.length; i++) dd[i] = dr[i].y * W + dr[i].x;
    D.push(dd);
  }
  return { D, C };
}

// Whether moving from `from` to `to` this tick ends in a hit (§6 step 12):
// a drift on the player's cell after drifts moved, or a drift swapping
// cells with the player during the same tick.
function deadly(Dprev, Dcur, from, to) {
  for (let j = 0; j < Dcur.length; j++) {
    if (Dcur[j] === to) return true;
    if (Dprev[j] === to && Dcur[j] === from) return true;
  }
  return false;
}

// Time-expanded BFS for the earliest safe arrival at `target`. Every step
// must be into terrain passable to the player, off all conflict cells of
// that tick, and — once invulnerability has run out — clear of this tick's
// drift positions and drift swaps. Returns the first action of the route,
// holding (`move: null`) included, or null when no safe route fits `span`.
// Every route slot remembers the action its whole path began with, so the
// goal layer hands back that first action directly.
function plan(C, pass, W, H, start, target, D, invuln, span) {
  let PT0 = 0;
  const n = W * H;
  const seen = new Uint8Array(n * (span + 1));
  const first = new Uint8Array(n * (span + 1));
  let layer = [start];
  seen[start] = 1;
  for (let t = 1; t <= span; t++) {
    const Dp = D[t - 1];
    const Dc = D[t];
    const Ct = C[t];
    const dangerous = t > invuln; // hits still impossible while invulnerable
    const next = [];
    for (let i = 0; i < layer.length; i++) {
      const c = layer[i];
      for (let a = 0; a < 5; a++) {
        let c2;
        if (a === 4) {
          c2 = c;
        } else {
          const st = DIRS[DIRS4[a]];
          const nx = (c % W) + st[0];
          const ny = ((c / W) | 0) + st[1];
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          c2 = ny * W + nx;
        }
        if (!pass[c2] || Ct[c2]) continue;
        const slot = t * n + c2;
        if (seen[slot]) continue;
        if (dangerous && deadly(Dp, Dc, c, c2)) continue;
        seen[slot] = 1;
        first[slot] = t === 1 ? a : first[(t - 1) * n + c];
        if (c2 === target) {
          const act = first[slot];
          return { move: act === 4 ? null : DIRS4[act], pause: false };
        }
        next.push(c2);
      }
    }
    layer = next;
    if (layer.length === 0) return null;
  }
  return null;
}

// Short-horizon fallback when no safe route to the target fits: among the
// four moves and a hold, never take an immediate hit, refuse cells with no
// escape next tick, and otherwise close on the target by terrain distance.
function dodge(C, pass, W, H, start, dist, D, invuln) {
  let bestMove = null;
  let bestScore = Infinity;
  for (let a = 0; a < 5; a++) {
    let c2;
    if (a === 4) {
      c2 = start;
    } else {
      const st = DIRS[DIRS4[a]];
      const nx = (start % W) + st[0];
      const ny = ((start / W) | 0) + st[1];
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      c2 = ny * W + nx;
    }
    if (!pass[c2] || C[1][c2]) continue;
    let score = 0;
    if (invuln < 1 && deadly(D[0], D[1], start, c2)) {
      score += 1e6;
    } else {
      let escaped = false;
      const C2 = C[2];
      for (let b = 0; b < 5 && !escaped; b++) {
        let c3;
        if (b === 4) {
          c3 = c2;
        } else {
          const st = DIRS[DIRS4[b]];
          const nx = (c2 % W) + st[0];
          const ny = ((c2 / W) | 0) + st[1];
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          c3 = ny * W + nx;
        }
        if (!pass[c3] || C2[c3]) continue;
        if (!(invuln < 2 && deadly(D[1], D[2], c2, c3))) escaped = true;
      }
      if (!escaped) score += 1e5;
    }
    const d = dist[c2];
    score += d < 0 ? 50000 : d;
    score += a * 0.25; // deterministic tie-break, in turn order
    if (score < bestScore) {
      bestScore = score;
      bestMove = a === 4 ? null : DIRS4[a];
    }
  }
  return { move: bestMove, pause: false };
}

export function botInput(state) {
  const nothing = { move: null, pause: false };
  if (!state || typeof state !== 'object') return nothing;
  const level = state.level;
  if (!level || !Array.isArray(level.tiles)) return nothing;
  if (state.status !== 'playing' || state.paused) return nothing;
  const W = level.width | 0;
  const H = level.height | 0;
  const rows = level.tiles;
  if (W <= 0 || H <= 0) return nothing;
  const open = !!state.open;
  const drifts = Array.isArray(state.drifts) ? state.drifts : [];
  const conflicts = Array.isArray(state.conflicts) ? state.conflicts : [];
  const patches = Array.isArray(state.patches) ? state.patches : [];
  const carried = Array.isArray(state.carried) ? state.carried : [];
  const player = state.player || { x: 0, y: 0 };
  const px = player.x | 0;
  const py = player.y | 0;
  if (px < 0 || px >= W || py < 0 || py >= H) return nothing;
  const n = W * H;
  const start = py * W + px;

  // Terrain passability for the player: §6 step 6 without the conflicts,
  // which the live planner handles per tick.
  const pass = new Uint8Array(n);
  for (let y = 0; y < H; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < W; x++) {
      const ch = row[x] || '#';
      if (ch !== '#' && !(ch === 'H' && !open) && !(ch === 'X' && !open)) {
        pass[y * W + x] = 1;
      }
    }
  }

  // Terrain BFS distance field from the given cells.
  const fieldOf = (sources) => {
    const dist = new Int32Array(n).fill(-1);
    const queue = [];
    for (const s of sources) {
      dist[s] = 0;
      queue.push(s);
    }
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head];
      const x = c % W;
      const y = (c / W) | 0;
      const nd = dist[c] + 1;
      for (let a = 0; a < 4; a++) {
        const st = DIRS[DIRS4[a]];
        const nx = x + st[0];
        const ny = y + st[1];
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const k = ny * W + nx;
        if (pass[k] && dist[k] < 0) {
          dist[k] = nd;
          queue.push(k);
        }
      }
    }
    return dist;
  };

  const fromPlayer = fieldOf([start]);
  const mergeCells = [];
  const spawnCells = [];
  let exitCell = -1;
  for (let y = 0; y < H; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < W; x++) {
      const ch = row[x];
      if (ch === 'M') mergeCells.push(y * W + x);
      else if (ch === 'P') spawnCells.push(y * W + x);
      else if (ch === 'X' && exitCell < 0) exitCell = y * W + x;
    }
  }

  // Pick a target: what the game needs right now.
  const need = Math.max(0, (level.quorum | 0) - (state.merges | 0));
  const carryN = carried.length;
  const reach = (k) => k >= 0 && fromPlayer[k] >= 0;
  const pickable = patches.filter((p) => {
    if (!p) return false;
    const x = p.x | 0;
    const y = p.y | 0;
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    return fromPlayer[y * W + x] >= 0;
  });
  let target = -1;
  if (open && exitCell >= 0) {
    target = exitCell; // shipped: straight to the exit, patches in hand are fine
  } else {
    let mergeCell = -1;
    let mergeDist = -1;
    for (const m of mergeCells) {
      const d = fromPlayer[m];
      if (d >= 0 && (mergeCell < 0 || d < mergeDist)) {
        mergeCell = m;
        mergeDist = d;
      }
    }
    if (carryN >= need || carryN >= CARRY_MAX || (carryN > 0 && pickable.length === 0)) {
      target = mergeCell;
    }
    if (target < 0) {
      for (const p of pickable) {
        const k = (p.y | 0) * W + (p.x | 0);
        const d = fromPlayer[k];
        if (target < 0 || d < fromPlayer[target]) target = k;
      }
    }
    if (target < 0) {
      // Board is dry and hands are empty: camp at the spawn point nearest
      // the player and wait for the next patch to land.
      for (const k of spawnCells) {
        const d = fromPlayer[k];
        if (d >= 0 && (target < 0 || d < fromPlayer[target])) target = k;
      }
    }
    if (target < 0 && reach(mergeCell)) target = mergeCell;
  }
  if (target < 0) return nothing;

  // Long hauls overrun the planner's horizon, so the bot would fall back
  // to tick-by-tick dodging exactly where it matters most (long corridors
  // swept by patrolling drifts). Instead, when the target lies beyond the
  // horizon, aim at a waypoint partway down the plain route and plan for
  // that; it slides nearer each tick until it lands inside the horizon.
  const base = fieldOf([target]);
  let aim = target;
  if (base[start] > HORIZON) {
    let k = start;
    let hops = HORIZON - 4;
    while (hops > 0) {
      const kx = k % W;
      const ky = (k / W) | 0;
      let next = -1;
      for (let a = 0; a < 4; a++) {
        const st = DIRS[DIRS4[a]];
        const nx = kx + st[0];
        const ny = ky + st[1];
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const cand = ny * W + nx;
        if (pass[cand] && base[cand] === base[k] - 1) {
          next = cand;
          break;
        }
      }
      if (next < 0) break;
      k = next;
      hops--;
    }
    if (k !== start) aim = k;
  }
  const distToTarget = base;
  const here = base[start];
  let got = null; // first safe action toward the target, if any

  // No drifts and no conflicts anywhere: walk straight down the field.
  if (drifts.length === 0 && conflicts.length === 0) {
    if (here > 0) {
      for (let a = 0; a < 4; a++) {
        const st = DIRS[DIRS4[a]];
        const nx = px + st[0];
        const ny = py + st[1];
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const k = ny * W + nx;
        if (pass[k] && distToTarget[k] === here - 1) {
          return { move: DIRS4[a], pause: false };
        }
      }
    }
  } else {
    const F = forecast(
      rows, W, H,
      drifts, conflicts,
      state.tick | 0,
      level.driftPeriod | 0,
      HORIZON
    );

    // Plan when the target is close enough to reach inside the horizon;
    // otherwise (and when the plan finds nothing) dodge tick by tick. The
    // route may need a few waits beyond the bare distance, so the span
    // stretches a little past it.
    if (here >= 0 && here <= HORIZON + 2) {
      const span = HORIZON; // cover the full conflict/drift cadence
      got = plan(F.C, pass, W, H, start, aim, F.D, state.invuln | 0, span);
    }
    if (!got && here !== 0) return dodge(F.C, pass, W, H, start, distToTarget, F.D, state.invuln | 0);
    if (!got && here > 0) return nothing; // boxed in: hold the line

    // Standing on the target with an empty board: hovering one cell off
    // lets a camped spawn point receive its patch again.
    if (got === null && here === 0) {
      for (let a = 0; a < 4; a++) {
        const st = DIRS[DIRS4[a]];
        const nx = px + st[0];
        const ny = py + st[1];
        if (nx < 0 || nx >= W || ny < 0 || ny >= H || pass[ny * W + nx] !== 1) continue;
        const step = plan(F.C, pass, W, H, start, ny * W + nx, F.D, state.invuln | 0, 1);
        if (step) return step;
      }
      return nothing;
    }
  }
  if (got) return got;
  if (here === 0) {
    // Drift-free hover: leaving a camped spawn point so it can receive.
    for (let a = 0; a < 4; a++) {
      const st = DIRS[DIRS4[a]];
      const nx = px + st[0];
      const ny = py + st[1];
      if (nx < 0 || nx >= W || ny < 0 || ny >= H || !pass[ny * W + nx]) continue;
      return { move: DIRS4[a], pause: false };
    }
  }
  return nothing;
}
