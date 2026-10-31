// Quorum Run autopilot (DESIGN.md §9): botInput(state) returns the input
// for a state, pure and deterministic.
//
// The plan: head for the open exit; otherwise for a merge pad with full
// hands; otherwise for the nearest lying patch that can be reached (with
// a fallback to the pad so carried patches bank); otherwise loiter at the
// pad. The first step comes from a breadth-first search over the level's
// passable cells, with the drifts' cells blocked when the route doesn't
// have to cross them.
//
// The dodge: the game is deterministic, so the bot simulates the upcoming
// step's drift movement exactly (§6 step 10 to 12) and avoids every move
// that would end the step with a drift on it, or that would swap cells
// with a moving drift. Cells next to drifts carry a small penalty so
// routes with cover win. With invuln ticks left nothing can hit, so the
// bot spends that window making progress instead of dodging.

import { CARRY_MAX, CLOCKWISE, DIRS } from './constants.js';

const NONE = { move: null, pause: false };
const STEPS = Object.keys(DIRS); // up, right, down, left — a fixed tie-break order

export function botInput(state) {
  if (!state || !state.level || !state.player) return NONE;
  if (state.status !== 'playing' || state.paused) return NONE;

  const level = state.level;
  const W = level.width;
  const H = level.height;
  const tiles = level.tiles;
  const open = !!state.open;
  const drifts = state.drifts || [];
  const conflicts = state.conflicts || [];
  const patches = state.patches || [];
  const hands = state.carried ? state.carried.length : 0;
  const px = state.player.x;
  const py = state.player.y;
  const playerK = py * W + px;

  const key = (x, y) => y * W + x;
  const tile = (x, y) => {
    if (y < 0 || y >= H || x < 0 || x >= W) return '#';
    return tiles[y][x];
  };

  // Where nobody stands this step: walls, closed doors and exit, and
  // conflict cells. The drifts' cells block the cautious search too.
  const staticBlocked = new Set();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = tiles[y][x];
      if (t === '#' || (!open && (t === 'H' || t === 'X'))) staticBlocked.add(key(x, y));
    }
  }
  for (const c of conflicts) staticBlocked.add(key(c.x, c.y));
  const driftBlocked = new Set(staticBlocked);
  const driftNow = new Set();
  for (const d of drifts) {
    driftBlocked.add(key(d.x, d.y));
    driftNow.add(key(d.x, d.y));
  }

  // The upcoming step's drift movement, exactly as §6 step 10 plays it:
  // only when the new tick allows it, against the conflicts after step
  // 5's ageing (a conflict at ttl 1 is gone before anyone moves).
  const tick = (state.tick | 0) + 1;
  const driftPeriod = level.driftPeriod || 1;
  const willMove = tick % driftPeriod === 0;
  const risky = (state.invuln | 0) === 0;
  const aged = new Set();
  for (const c of conflicts) if (c.ttl > 1) aged.add(key(c.x, c.y));
  const moved = []; // { from, to }
  let driftNext = driftNow;
  if (willMove) {
    driftNext = new Set();
    for (const d of drifts) {
      const at = CLOCKWISE.indexOf(d.dir);
      let land = null;
      for (let k = 0; k < 4 && !land; k++) {
        const dir = CLOCKWISE[(at + k) % 4];
        const step = DIRS[dir];
        const x = d.x + step[0];
        const y = d.y + step[1];
        const t = tile(x, y);
        if (t === '#' || t === 'H' || t === 'X') continue;
        if (aged.has(key(x, y))) continue;
        land = { x, y, dir };
      }
      if (!land) land = { x: d.x, y: d.y, dir: d.dir };
      moved.push({ from: key(d.x, d.y), to: key(land.x, land.y) });
      driftNext.add(key(land.x, land.y));
    }
  }

  // Breadth-first distance from one cell to every cell it can reach.
  const bfs = (sourceK, blocked) => {
    const dist = new Int16Array(W * H).fill(-1);
    if (blocked.has(sourceK)) return dist;
    dist[sourceK] = 0;
    const queue = [sourceK];
    for (let qi = 0; qi < queue.length; qi++) {
      const k = queue[qi];
      const x = k % W;
      const y = (k - x) / W;
      const d = dist[k];
      for (const dir of STEPS) {
        const step = DIRS[dir];
        const nx = x + step[0];
        const ny = y + step[1];
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const nk = key(nx, ny);
        if (dist[nk] !== -1 || blocked.has(nk)) continue;
        dist[nk] = d + 1;
        queue.push(nk);
      }
    }
    return dist;
  };

  // A cell's path length from the player, drift-avoiding paths first.
  const toPlayerA = bfs(playerK, driftBlocked);
  const toPlayerB = bfs(playerK, staticBlocked);
  const reach = (k) => {
    const a = toPlayerA[k];
    if (a >= 0) return a;
    return toPlayerB[k];
  };

  // The goal: the exit once the quorum is open, the merge pad with full
  // hands, the nearest patch otherwise; with no patch to fetch, the pad
  // banks what is carried or waits for a spawn.
  const scan = (ch) => {
    const found = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) if (tiles[y][x] === ch) found.push(key(x, y));
    }
    return found;
  };
  const exits = scan('X');
  const pads = scan('M');
  const nearest = (cells) => {
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < cells.length; i++) {
      const d = reach(cells[i]);
      if (d >= 0 && d < bestDist) {
        best = cells[i];
        bestDist = d;
      }
    }
    return best;
  };
  let targetK = null;
  if (open && exits.length > 0) {
    targetK = exits[0]; // exactly one exit per level
  } else if (hands >= CARRY_MAX) {
    targetK = nearest(pads);
  } else {
    let patchK = null;
    let patchDist = Infinity;
    for (let i = 0; i < patches.length; i++) {
      const d = reach(key(patches[i].x, patches[i].y));
      if (d >= 0 && d < patchDist) {
        patchK = key(patches[i].x, patches[i].y);
        patchDist = d;
      }
    }
    targetK = patchK !== null ? patchK : nearest(pads);
  }
  if (targetK === null) {
    // Nothing is reachable: stand ground and let the level change.
    return NONE;
  }

  // Breadth-first distance from the goal, drift-avoiding paths first.
  const toTargetA = bfs(targetK, driftBlocked);
  const toTargetB = bfs(targetK, staticBlocked);
  const dist = (k) => {
    const a = toTargetA[k];
    if (a >= 0) return a;
    return toTargetB[k];
  };

  // The candidates: one per direction, then standing still last so a
  // move wins cost ties. A step the game would refuse (wall, closed
  // door, conflict) behaves like standing still, so it is folded into the
  // stay candidate.
  const candidates = [];
  for (const dir of STEPS) {
    const step = DIRS[dir];
    const nx = px + step[0];
    const ny = py + step[1];
    const t = tile(nx, ny);
    if (t === '#' || (!open && (t === 'H' || t === 'X'))) continue;
    if (staticBlocked.has(key(nx, ny))) continue;
    candidates.push({ move: dir, k: key(nx, ny) });
  }
  candidates.push({ move: null, k: playerK });

  // A cell that ends the step under a drift is deadly while the bot can
  // be hit; so is swapping with a moving drift (the bot steps onto the
  // drift's cell as the drift steps onto the bot's old one). Without a
  // route to the goal the bot hovers on the near side of the blockage
  // instead of chasing the goal into danger. Cells next to drifts cost a
  // little, next to where they land next tick a little more.
  const adjacent = (cells, k) => {
    const x = k % W;
    const y = (k - x) / W;
    let n = 0;
    for (const c of cells) {
      const cx = c % W;
      const cy = (c - cx) / W;
      if (Math.abs(cx - x) + Math.abs(cy - y) === 1) n++;
    }
    return n;
  };
  let best = null;
  let bestCost = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    const k = cand.k;
    const eps = i * 0.01;
    let cost;
    if (risky) {
      let deadly = driftNext.has(k);
      if (!deadly) {
        for (const m of moved) {
          if (m.from !== m.to && m.to === playerK && m.from === k) {
            deadly = true;
            break;
          }
        }
      }
      if (deadly) {
        cost = 5000 + adjacent(driftNow, k) + eps;
      } else {
        const soft = 0.6 * adjacent(driftNow, k)
          + (willMove ? 1.2 * adjacent(driftNext, k) : 0);
        const d = dist(k);
        cost = d >= 0 ? d + soft + eps : 3000 + soft + eps;
      }
    } else {
      // Nothing can hit while invuln ticks remain: walk the route.
      const d = dist(k);
      cost = d >= 0 ? d + eps : 3000 + eps;
    }
    if (cost < bestCost) {
      best = cand;
      bestCost = cost;
    }
  }
  if (!best || bestCost >= 5000) {
    // No safe choice at all: stand ground rather than step onto a drift.
    return NONE;
  }
  return { move: best.move, pause: false };
}
