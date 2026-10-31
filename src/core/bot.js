// src/core/bot.js — §9: an autopilot that plays the game.
//
// botInput(state) is a pure, deterministic function of the state: it plans
// one move at a time. Each call picks a goal — reach the open exit, or
// gather patches until the hands are full, then take a merge pad — and
// finds the earliest safe arrival with a breadth-first search over
// (cell, tick). Drifts and conflicts are simulated forward exactly as §6
// steps them (they evolve independently of the player), so the plan never
// walks into a drift, blocks on a conflict, or swaps cells with a drift,
// which is what a step treats as a hit.

import { CARRY_MAX, CLOCKWISE, CONFLICT_TICKS, DIRS } from './constants.js';

const MOVE_ORDER = ['up', 'right', 'down', 'left'];

// How far ahead one plan looks, and how many searched nodes it may spend
// before it gives up and falls back to a defensive shuffle. A hard level
// stalls the bot a tick, never the game.
const DEPTH_TICKS = 64;
const CAP_NODES = 16384;
const MAX_CELLS = 8192;
const H_CLAMP = 63;

// Search workspaces, shared across calls: botInput is never re-entered,
// and every call resets what it reads (purity is unaffected — the plan is
// still a pure function of the state).
const visitPlan = new Int16Array(MAX_CELLS);
const hMap = new Int16Array(MAX_CELLS);
const bfsQueue = new Int32Array(MAX_CELLS);
const nodeCellA = new Uint16Array(CAP_NODES);
const nodeTickA = new Uint8Array(CAP_NODES);
const nodePrevA = new Int32Array(CAP_NODES);
const nodeMoveA = new Int8Array(CAP_NODES);
const nodeKey = new Uint16Array(CAP_NODES);
const heap = new Int32Array(CAP_NODES + 1);

// The terrain character at a cell, or '#' outside the map (§5).
function terrain(level, x, y) {
  const row = level.tiles[y];
  return row === undefined ? '#' : (row[x] ?? '#');
}

// A drift's passable targets (§6 step 10): not a wall, hold, exit, or
// conflict.
function driftBlocked(level, x, y) {
  const tile = terrain(level, x, y);
  return tile === '#' || tile === 'H' || tile === 'X';
}

// A conflict blocks a cell while it lasts. Frames list the conflict
// cells that exist when the player or a drift tries to move; there are
// only ever a few, so a scan is cheaper than a map per frame.
function blockedAt(frame, idx) {
  return frame.blocked.includes(idx);
}

// The next `depth` ticks of the world (§6 steps 5, 10, 11). Drifts and
// conflicts evolve on their own, so frames are precomputed once.
function timeline(state, depth) {
  const level = state.level;
  const w = level.width;
  let drifts = state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  let conflicts = state.conflicts.map((c) => ({ x: c.x, y: c.y, ttl: c.ttl }));
  const frames = [];
  for (let t = 1; t <= depth; t++) {
    // Step 5: conflicts age every tick, and those at 0 go.
    const aged = [];
    for (const c of conflicts) {
      if (c.ttl - 1 > 0) aged.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
    }
    const moved = (state.tick + t) % level.driftPeriod === 0;
    let post = drifts;
    if (moved) {
      // Step 10: each drift, in array order, tries its direction, then
      // each next direction clockwise, up to four.
      post = drifts.map((d) => {
        const start = Math.max(0, CLOCKWISE.indexOf(d.dir));
        for (let turn = 0; turn < CLOCKWISE.length; turn++) {
          const dir = CLOCKWISE[(start + turn) % CLOCKWISE.length];
          const [dx, dy] = DIRS[dir];
          const nx = d.x + dx;
          const ny = d.y + dy;
          if (!driftBlocked(level, nx, ny) && !aged.some((c) => c.x === nx && c.y === ny)) {
            return { x: nx, y: ny, dir };
          }
        }
        return { x: d.x, y: d.y, dir: d.dir };
      });
      // Step 11: cells with two or more drifts reverse them all and gain
      // a conflict for CONFLICT_TICKS, unless one is already there.
      const counts = new Map();
      for (const d of post) counts.set(d.y * w + d.x, (counts.get(d.y * w + d.x) || 0) + 1);
      const shared = [...counts].filter(([, n]) => n >= 2);
      if (shared.length > 0) {
        const sharedSet = new Set(shared.map(([k]) => k));
        post = post.map((d) => {
          if (!sharedSet.has(d.y * w + d.x)) return d;
          const dir = d.dir;
          const flip = {
            up: 'down', down: 'up', left: 'right', right: 'left',
          }[dir];
          return { x: d.x, y: d.y, dir: flip ?? dir };
        });
        for (const [k] of shared) {
          const x = k % w;
          const y = (k - x) / w;
          if (!aged.some((c) => c.x === x && c.y === y)) {
            aged.push({ x, y, ttl: CONFLICT_TICKS });
          }
        }
      }
    }
    frames.push({
      moved,
      blocked: aged.map((c) => c.y * w + c.x),
      pre: drifts.map((d) => d.y * w + d.x),
      post: post.map((d) => d.y * w + d.x),
    });
    conflicts = aged;
    drifts = post;
  }
  return frames;
}

// Is the move from `from` to `to` finished at tick index `t` (tick
// `state.tick + t`) hit? The step treats it so when a drift ends the tick
// on `to` (§6 step 12), or when the drift and the player exchange cells.
// Ticks the player is immune to are never deadly.
function deadly(state, frames, t, from, to) {
  if (state.invuln > 0 && t <= state.invuln) return false;
  const f = frames[t - 1];
  for (let i = 0; i < f.post.length; i++) {
    if (f.post[i] === to) return true;
  }
  if (f.moved) {
    for (let i = 0; i < f.pre.length; i++) {
      if (f.pre[i] === to && f.post[i] === from) return true;
    }
  }
  return false;
}

// Terrain-only distances from the target cells, in cells: a low bound on
// remaining ticks (movement covers at most one cell per tick). One BFS
// from all targets at once; mutually adjacent moves make the walk the
// same either way, and conflicts are ignored — they are transient. Cells
// that terrain alone cannot reach keep 0, which stays a valid low bound.
function distToTargets(level, targets, cells) {
  const w = level.width;
  hMap.fill(0, 0, cells);
  let head = 0;
  let tail = 0;
  for (const idx of targets) bfsQueue[tail++] = idx;
  while (head < tail) {
    const cell = bfsQueue[head++];
    const x = cell % w;
    const y = (cell - x) / w;
    const d = hMap[cell] + 1;
    for (let mi = 0; mi < 4; mi++) {
      const [dx, dy] = DIRS[MOVE_ORDER[mi]];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= level.height) continue;
      const nb = ny * w + nx;
      if (hMap[nb] !== 0) continue;
      if (terrain(level, nx, ny) === '#') continue;
      hMap[nb] = d;
      bfsQueue[tail++] = nb;
    }
  }
}

// Earliest-arrival search over (cell, tick) in arrival order: goes in
// rising f = tick + distance-to-target, which finds the fewest-ticks
// arrival (including waiting) without walking the whole prism. Every
// move costs one tick, so a node's key is fixed by its cell and tick.
// Returns the first move of the plan — `null` to wait — or undefined
// when no target is reachable within the horizon or the cap is spent.
function plan(state, frames, targets) {
  const level = state.level;
  const w = level.width;
  const cells = w * level.height;
  const depth = frames.length;
  const open = state.open;
  const passable = (idx) => {
    const x = idx % w;
    const y = (idx - x) / w;
    const tile = terrain(level, x, y);
    return tile !== '#' && (open || (tile !== 'H' && tile !== 'X'));
  };
  distToTargets(level, targets, cells);
  visitPlan.fill(-1, 0, cells);
  const me = state.player.y * w + state.player.x;
  visitPlan[me] = 0;
  nodeCellA[0] = me;
  nodeTickA[0] = 0;
  nodePrevA[0] = -1;
  nodeMoveA[0] = -1;
  nodeKey[0] = (Math.min(hMap[me], H_CLAMP) << 8) | 0;
  let n = 1;
  let hn = 0;
  const push = (node) => {
    let i = ++hn;
    heap[i] = node;
    while (i > 1) {
      const p = i >> 1;
      if (nodeKey[heap[p]] <= nodeKey[heap[i]]) break;
      const tmp = heap[p];
      heap[p] = heap[i];
      heap[i] = tmp;
      i = p;
    }
  };
  const pop = () => {
    const top = heap[1];
    const last = heap[hn--];
    if (hn > 0) {
      heap[1] = last;
      let i = 1;
      while (true) {
        const l = i * 2;
        if (l > hn) break;
        const r = l + 1;
        const sm = r <= hn && nodeKey[heap[r]] < nodeKey[heap[l]] ? r : l;
        if (nodeKey[heap[i]] <= nodeKey[heap[sm]]) break;
        const tmp = heap[i];
        heap[i] = heap[sm];
        heap[sm] = tmp;
        i = sm;
      }
    }
    return top;
  };
  push(0);
  while (hn > 0) {
    const head = pop();
    const cell = nodeCellA[head];
    if (targets.has(cell)) {
      // The plan is the chain back to the root; its first edge answers.
      let node = head;
      while (nodePrevA[node] !== 0) node = nodePrevA[node];
      return nodeMoveA[node] < 0 ? null : MOVE_ORDER[nodeMoveA[node]];
    }
    const t = nodeTickA[head];
    if (t >= depth) continue;
    const nt = t + 1;
    const f = frames[nt - 1];
    // Candidates: stay (the wait the plan may insert), then the four
    // moves in reading order.
    for (let mi = 0; mi < 5; mi++) {
      let to = cell;
      let moveIdx = -1;
      if (mi > 0) {
        moveIdx = mi - 1;
        const [dx, dy] = DIRS[MOVE_ORDER[mi - 1]];
        const x = (cell % w) + dx;
        const y = ((cell - (cell % w)) / w) + dy;
        if (x < 0 || y < 0 || x >= w || y >= level.height) continue;
        to = y * w + x;
        if (!passable(to) || blockedAt(f, to)) continue;
      }
      if (deadly(state, frames, nt, cell, to)) continue;
      if (visitPlan[to] === nt) continue;
      if (n >= CAP_NODES) return undefined;
      visitPlan[to] = nt;
      nodeCellA[n] = to;
      nodeTickA[n] = nt;
      nodePrevA[n] = head;
      nodeMoveA[n] = moveIdx;
      nodeKey[n] = (nt + Math.min(hMap[to], H_CLAMP)) * 256 + nt;
      n++;
      push(n - 1);
    }
  }
  return undefined;
}

// Terrain-only distances from the player, in cells: says which goals are
// worth planning for and scores the defensive shuffle. Conflicts are
// ignored (they are transient); closed holds and the exit block.
function reachMap(state) {
  const level = state.level;
  const w = level.width;
  const cells = w * level.height;
  const dist = new Int16Array(cells).fill(-1);
  const open = state.open;
  const start = state.player.y * w + state.player.x;
  dist[start] = 0;
  const queue = new Int32Array(cells);
  let head = 0;
  let tail = 1;
  queue[0] = start;
  while (head < tail) {
    const cell = queue[head++];
    const x = cell % w;
    const y = (cell - x) / w;
    const d = dist[cell] + 1;
    for (let mi = 0; mi < 4; mi++) {
      const [dx, dy] = DIRS[MOVE_ORDER[mi]];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= level.height) continue;
      const n = ny * w + nx;
      if (dist[n] !== -1) continue;
      const tile = terrain(level, nx, ny);
      if (tile === '#' || (!open && (tile === 'H' || tile === 'X'))) continue;
      dist[n] = d;
      queue[tail++] = n;
    }
  }
  return dist;
}

// The fallback when no plan fits the horizon: make one safe move now.
// With a goal, prefer a step closer to it; without one, prefer to stand
// where drifts and conflicts cannot reach for as long as possible. If
// every move ends this tick in danger, stand and take the hit — that is
// cheaper than wandering into worse.
function shuffle(state, frames, dist, hasGoal) {
  const me = state.player.y * state.level.width + state.player.x;
  let best = null;
  let bestKey = null;
  for (let mi = 0; mi < 5; mi++) {
    let to = me;
    if (mi > 0) {
      const [dx, dy] = DIRS[MOVE_ORDER[mi - 1]];
      const x = state.player.x + dx;
      const y = state.player.y + dy;
      if (x < 0 || y < 0 || x >= state.level.width || y >= state.level.height) continue;
      to = y * state.level.width + x;
      const tile = terrain(state.level, x, y);
      if (tile === '#' || (!state.open && (tile === 'H' || tile === 'X'))) continue;
      if (blockedAt(frames[0], to)) continue;
    }
    if (deadly(state, frames, 1, me, to)) continue;
    // How many more ticks this cell stays clear of drifts and conflicts.
    let air = 1;
    while (air < 12 && !deadly(state, frames, air + 1, to, to)) air++;
    const away = dist === null ? 0 : (dist[to] < 0 ? 9999 : dist[to]);
    // Key: closer to the goal first (a stay is free), then drier ground.
    const key = hasGoal
      ? [-away, air, mi]
      : [air, -away, mi];
    if (bestKey === null || better(key, bestKey)) {
      bestKey = key;
      best = mi === 0 ? null : MOVE_ORDER[mi - 1];
    }
  }
  return { move: best, pause: false };
}

// Lexicographic comparison for small number arrays.
function better(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

// One input for the state: where to go, one step at a time.
export function botInput(state) {
  // A game that is over, or paused, needs no move.
  if (!state || state.status !== 'playing' || state.paused) {
    return { move: null, pause: false };
  }
  const level = state.level;
  const w = level.width;
  const me = state.player.y * w + state.player.x;
  const tile = terrain(level, state.player.x, state.player.y);
  const carried = state.carried.length;

  // Merging runs on its own: stand on a pad with hands full.
  if (!state.open && carried > 0 && tile === 'M') return { move: null, pause: false };

  const dist = reachMap(state);
  let targets = null;
  if (state.open) {
    // Ship the level: head for the exit. Gated-off exits are not goals —
    // the search would walk a losing prism for them.
    targets = new Set();
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < w; x++) {
        if (terrain(level, x, y) === 'X' && dist[y * w + x] >= 0) targets.add(y * w + x);
      }
    }
  } else if (carried < CARRY_MAX) {
    // Gather patches; the plan times the last step to the drift. Patches
    // unreachable this level (behind a closed hold door) are skipped.
    targets = new Set();
    for (const p of state.patches) {
      if (dist[p.y * w + p.x] >= 0) targets.add(p.y * w + p.x);
    }
  }
  if (targets !== null && targets.size === 0) targets = null;
  if (targets === null && carried > 0) {
    // Nothing left to gather: merge what the hands hold.
    targets = new Set();
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < w; x++) {
        if (terrain(level, x, y) === 'M' && dist[y * w + x] >= 0) targets.add(y * w + x);
      }
    }
    if (targets.size === 0) targets = null;
  }

  const frames = timeline(state, DEPTH_TICKS);
  if (targets !== null && level.width * level.height <= MAX_CELLS) {
    if (targets.has(me)) return { move: null, pause: false };
    const move = plan(state, frames, targets);
    if (move !== undefined) return { move, pause: false };
  }
  return shuffle(state, frames, targets === null ? null : dist, targets !== null);
}
