// Quorum Run's autopilot (DESIGN.md §9). Pure and deterministic: given the
// same state it asks for the same move. The plan is goal-directed
// path-finding run through a simulator: pick a target cell by the state
// (exit when open, otherwise fetch patches, merge carried ones, or hover by
// a spawn point waiting for respawn), route with a weighted Dijkstra that
// keeps clear of drifts and conflicts, then step through the real rules of
// `step` to pick the best move and never step into a hit.

import { step, tileAt } from './game.js';
import { CARRY_MAX, DIRS } from './constants.js';

const MOVES = ['up', 'right', 'down', 'left'];
const INF = 1 << 20;

// A tiny binary min-heap over cell costs.
function dijkstra(cost, w, h, sources) {
  const dist = new Int32Array(w * h).fill(INF);
  const idx = [];
  const key = [];
  const swap = (a, b) => {
    const i = idx[a]; const c = key[a];
    idx[a] = idx[b]; key[a] = key[b];
    idx[b] = i; key[b] = c;
  };
  const push = (i, c) => {
    idx.push(i); key.push(c);
    let a = idx.length - 1;
    while (a > 0) {
      const p = (a - 1) >> 1;
      if (key[p] <= key[a]) break;
      swap(p, a);
      a = p;
    }
  };
  const pop = () => {
    const top = idx[0];
    const popped = key[0];
    const lastI = idx.pop();
    const lastC = key.pop();
    if (idx.length) {
      idx[0] = lastI; key[0] = lastC;
      let a = 0;
      for (;;) {
        const l = a * 2 + 1; const r = l + 1; let m = a;
        if (l < idx.length && key[l] < key[m]) m = l;
        if (r < idx.length && key[r] < key[m]) m = r;
        if (m === a) break;
        swap(m, a);
        a = m;
      }
    }
    return { i: top, c: popped };
  };
  for (const s of sources) {
    if (dist[s] !== 0) { dist[s] = 0; push(s, 0); }
  }
  while (idx.length) {
    const { i, c } = pop();
    if (c > dist[i]) continue;
    const x = i % w;
    const y = (i / w) | 0;
    for (const dir of MOVES) {
      const nx = x + DIRS[dir][0];
      const ny = y + DIRS[dir][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (cost[ni] >= INF) continue; // impassable
      const nd = c + cost[ni];
      if (nd < dist[ni]) {
        dist[ni] = nd;
        push(ni, nd);
      }
    }
  }
  return dist;
}

function isBad(events) {
  return events.includes('drop') || events.includes('hit') || events.includes('lost');
}

export function botInput(state) {
  const none = { move: null, pause: false };
  if (!state || state.status !== 'playing' || state.paused) return none;

  const level = state.level;
  const w = level.width;
  const h = level.height;
  const px = state.player.x;
  const py = state.player.y;
  const here = py * w + px;

  // Cells a player could not use right now: walls, closed holds and the
  // closed exit, and any cell under a conflict.
  const blocked = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = level.tiles[y][x];
      if (t === '#' || ((t === 'H' || t === 'X') && !state.open)) blocked[y * w + x] = 1;
    }
  }
  for (const c of state.conflicts) blocked[c.y * w + c.x] = 1;

  // Flat cost per step: 1 normally, plus a toll near drifts so paths keep
  // their distance while a head-on contact is almost never worth it.
  const cost = new Int32Array(w * h).fill(1);
  if (state.invuln === 0) {
    const toll = new Int32Array(w * h);
    for (const d of state.drifts) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = d.x + dx;
          const y = d.y + dy;
          if (x >= 0 && y >= 0 && x < w && y < h) toll[y * w + x] = 6;
        }
      }
      if (d.x >= 0 && d.y >= 0 && d.x < w && d.y < h) toll[d.y * w + d.x] = 24;
    }
    for (let i = 0; i < cost.length; i++) cost[i] += toll[i];
  }
  for (let i = 0; i < blocked.length; i++) {
    if (blocked[i]) cost[i] = INF; // never route through
  }

  // Distance field from the player, to rank goals by reach.
  const fromPlayer = dijkstra(cost, w, h, [here]);

  const pick = (cells) => {
    let best = null;
    let bestD = INF;
    for (const [x, y] of cells) {
      const i = y * w + x;
      const d = fromPlayer[i];
      if (d < bestD) {
        bestD = d;
        best = [x, y];
      }
    }
    return best;
  };

  const carrying = state.carried.length;
  const remaining = level.quorum - state.merges;
  const onPad = tileAt(state, px, py) === 'M';

  // Merge pads and the exit cell.
  const pads = [];
  let exit = null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = level.tiles[y][x];
      if (t === 'M') pads.push([x, y]);
      else if (t === 'X') exit = [x, y];
    }
  }

  // Staging cells next to spawn points with no patch on them.
  const patched = new Set(state.patches.map((p) => `${p.x},${p.y}`));
  const staged = [];
  if (state.patches.length + carrying < level.spawns.length) {
    for (const sp of level.spawns) {
      if (patched.has(`${sp.x},${sp.y}`)) continue;
      for (const dir of MOVES) {
        const x = sp.x + DIRS[dir][0];
        const y = sp.y + DIRS[dir][1];
        if (x < 0 || y < 0 || x >= w || y >= h || blocked[y * w + x]) continue;
        staged.push([x, y]);
      }
    }
  }

  const patchCells = () => state.patches.map((p) => [p.x, p.y]);

  // Goal kinds in priority order; the first kind with a reachable cell wins.
  const kinds = [];
  if (state.open && exit) {
    kinds.push('exit');
    if (carrying > 0) kinds.push('pad');
  } else {
    if (onPad && carrying > 0) return none; // merging happens in place
    if (carrying >= CARRY_MAX) kinds.push('pad');
    else if (carrying > 0 && carrying >= remaining) kinds.push('pad');
    else {
      if (remaining > carrying && patchCells().length > 0) kinds.push('patch');
      if (carrying > 0) kinds.push('pad');
      if (staged.length > 0) kinds.push('hover');
    }
  }

  const pools = { exit: exit ? [exit] : [], pad: pads, patch: patchCells(), hover: staged };
  let goal = null;
  for (const k of kinds) {
    goal = pick(pools[k] ?? []);
    if (goal) break;
  }
  if (!goal) return none;
  const goalIdx = goal[1] * w + goal[0];

  // Distance field to the goal, for scoring candidate moves.
  const toGoal = dijkstra(cost, w, h, [goalIdx]);

  // Score every candidate move through the real rules: the move itself,
  // then an answering idle step, so a drift that would land on the player
  // the tick after a move counts against that move too.
  let bestMove = null;
  let bestScore = -Infinity;
  const candidates = [null, ...MOVES];
  for (const m of candidates) {
    if (m) {
      const nx = px + DIRS[m][0];
      const ny = py + DIRS[m][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || blocked[ny * w + nx]) continue;
    }
    const input = { move: m, pause: false };
    const s1 = step(state, input);
    let score = -toGoal[s1.player.y * w + s1.player.x];
    if (s1.events.includes('level') || s1.events.includes('won')) score += 10000;
    if (s1.events.includes('drop') || s1.events.includes('hit')) score -= 90;
    if (s1.events.includes('lost')) score -= 5000;
    const s2 = step(s1, { move: null, pause: false });
    if (isBad(s2.events)) score -= 40;
    if (m && s1.player.x === px && s1.player.y === py) score -= 1; // a blocked bump
    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }
  return { move: bestMove, pause: false };
}
