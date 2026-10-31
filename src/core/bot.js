// Quorum Run — the bot (§9): an autopilot that plays the game.
//
// `botInput(state)` returns an input `{ move, pause: false }` for the
// state. It is pure (it changes neither `state` nor anything in it),
// deterministic (no randomness, no clock), and imports nothing, so it
// rides on the state shape of §5 and the rules of §6 alone.
//
// How it plays, each time it is asked:
//   1. Predict drifts. The step about to happen has already grown
//      `tick` by one (§6 step 4), so the drifts move when
//      `(state.tick + 1) % driftPeriod === 0`. Each drift on its own
//      tries its direction and then the next directions clockwise until
//      one is passable, and stands when none is (§6 step 10).
//   2. Pick one goal cell by priority:
//        - when `open`: the exit, merging carried patches first;
//        - else with CARRY_MAX carried: the nearest merge pad;
//        - else the nearest reachable lying patch;
//        - else carrying something: the nearest merge pad;
//        - else a spawn point to wait at (spawns churn in every
//          `spawnEvery` ticks), and a spawn the player sits on is not
//          one (spawns skip the player's cell, §6 step 13);
//        - else the nearest merge pad, or stand still.
//   3. Flood the grid backward from the goal with BFS over cells
//      passable to the player (§6 step 6: no wall, holds and the exit
//      only when open, and no conflict — conflicts age at the head of
//      the step, so one at ttl 1 is already gone).
//   4. Score the five possible inputs — four moves and no move — and
//      take the safest: a move that would be hit, drop, or lose (§6
//      step 12) loses to any safer one; among equally safe ones the
//      shortest path to the goal wins, with a small penalty for cells
//      a drift sits on or could walk into breaking the ties.

const REST = { move: null, pause: false };
const CARRY_MAX = 3;                                             // §2
const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }; // §2
const CLOCKWISE = ['up', 'right', 'down', 'left'];               // §2
const CANDIDATES = ['up', 'right', 'down', 'left', null];

// How badly a cost penalty weighs one risky cell against path length.
const ON_DRIFT = 3;   // a cell a drift may be standing on right away
// The rest are relative shrugs: weights make detours longer than bold
// straight routes only when the bold route sits under a drifting nose.
const COULD_MOVE_TO = 1.5; // the cell a drift most likely walks to
const COULD_TURN_TO = 0.5; // a further turn a drift could still take
const OFF_GRID = 1e6; // stands in for a goal that is simply not reachable

// How each of the five possible inputs ranks when unsafe, lower better.
const DROP = 1;          // carrying: the patches scatter, life stands
const HIT = 2;           // empty-handed: a life goes
const LOST = 3;          // the last life goes

export function botInput(state) {
  if (!state || !state.level || !state.player || state.status !== 'playing' || state.paused) {
    return REST;
  }
  const tiles = state.level.tiles || [];
  const H = tiles.length;
  let W = 0;
  for (let y = 0; y < H; y++) if (tiles[y].length > W) W = tiles[y].length;
  if (W === 0 || H === 0) return REST;

  const open = !!state.open;
  const carried = state.carried || [];
  const patches = state.patches || [];
  const drifts = state.drifts || [];
  const conflicts = state.conflicts || [];
  const px = state.player.x, py = state.player.y;

  // The terrain character of a cell, '#' outside the map (§5 tileAt).
  const tileAt = (x, y) => {
    if (y < 0 || y >= H) return '#';
    const row = tiles[y];
    return x < 0 || x >= row.length ? '#' : row[x];
  };

  // Conflicts age at the head of the step (§6 step 5), before anything
  // moves, so only ttl greater than 1 is still blocking through it.
  const blocked = new Array(W * H).fill(false);
  for (const c of conflicts) {
    if (c && c.ttl > 1 && c.x >= 0 && c.x < W && c.y >= 0 && c.y < H) {
      blocked[c.y * W + c.x] = true;
    }
  }

  // Cells the player may move through (§6 step 6): no wall, holds and
  // the exit only when open, no blocking conflict.
  const playerPass = (x, y) => {
    const t = tileAt(x, y);
    if (t === '#') return false;
    if (t === 'H' || t === 'X') return open;
    return !blocked[y * W + x];
  };
  // Cells a drift may move through (§6 step 10): never a wall, never a
  // hold, never the exit — open or not.
  const driftPass = (x, y) => {
    const t = tileAt(x, y);
    if (t === '#' || t === 'H' || t === 'X') return false;
    return !blocked[y * W + x];
  };

  // One drift's next cell when the drifts move: its own direction
  // first, then the next directions clockwise (§6 step 10).
  const dirIndex = (dir) => {
    const i = CLOCKWISE.indexOf(dir);
    return i < 0 ? 0 : i;
  };
  const driftStep = (d) => {
    const from = dirIndex(d.dir);
    for (let i = 0; i < 4; i++) {
      const dir = CLOCKWISE[(from + i) & 3];
      const nx = d.x + DIRS[dir][0], ny = d.y + DIRS[dir][1];
      if (driftPass(nx, ny)) return { x: nx, y: ny, dir };
    }
    return { x: d.x, y: d.y, dir: d.dir };
  };

  // Drifts move this step only when the grown tick says so (§6 step 10).
  const period = state.level.driftPeriod > 0 ? state.level.driftPeriod : 1;
  const driftsMove = ((state.tick + 1) % period) === 0;
  const ahead = new Array(drifts.length);
  for (let i = 0; i < drifts.length; i++) {
    ahead[i] = driftsMove ? driftStep(drifts[i]) : { x: drifts[i].x, y: drifts[i].y, dir: drifts[i].dir };
  }

  // A small penalty map: cells drifts stand on or could walk or turn
  // into, so a shortest path with a hairpin through the drift traffic
  // loses to a slightly longer calm one.
  const danger = new Array(W * H).fill(0);
  const bump = (x, y, v) => {
    if (x >= 0 && x < W && y >= 0 && y < H) danger[y * W + x] += v;
  };
  for (const d of ahead) {
    bump(d.x, d.y, ON_DRIFT);
    // Where this drift could be on its next move: the direction it
    // prefers first, and every turn it could still fall back to.
    const from = dirIndex(d.dir);
    for (let i = 0; i < 4; i++) {
      const dir = CLOCKWISE[(from + i) & 3];
      const tx = d.x + DIRS[dir][0], ty = d.y + DIRS[dir][1];
      if (driftPass(tx, ty)) bump(tx, ty, i === 0 ? COULD_MOVE_TO : COULD_TURN_TO);
    }
  }

  // BFS over cells passable to the player, telling every cell how far
  // it is from `(sx, sy)` (used from the player to rank goals and from
  // the goal to score candidate moves; edges run both ways).
  const flood = (sx, sy) => {
    const dist = new Array(W * H).fill(Infinity);
    if (sx < 0 || sx >= W || sy < 0 || sy >= H) return dist;
    const queue = [sy * W + sx];
    dist[queue[0]] = 0;
    for (let head = 0; head < queue.length; head++) {
      const here = queue[head];
      const hx = here % W, hy = (here - hx) / W;
      const next = dist[here] + 1;
      for (let k = 0; k < 4; k++) {
        const nx = hx + DIRS[CLOCKWISE[k]][0], ny = hy + DIRS[CLOCKWISE[k]][1];
        const there = ny * W + nx;
        if (playerPass(nx, ny) && dist[there] === Infinity) {
          dist[there] = next;
          queue.push(there);
        }
      }
    }
    return dist;
  };

  // Where everything interesting is, in reading order.
  const idxOf = (c) => c.y * W + c.x;
  const mergeIdx = [];
  const exitIdx = [];
  for (let y = 0; y < H; y++) {
    const row = tiles[y];
    for (let x = 0; x < row.length; x++) {
      const t = row[x];
      if (t === 'M') mergeIdx.push(y * W + x);
      else if (t === 'X') exitIdx.push(y * W + x);
    }
  }
  const patchIdx = patches.map(idxOf);

  const nearPlayer = flood(px, py);
  // The first of `cells` at the least distance in `dist`; ties keep
  // reading order because `cells` arrive in it.
  const nearest = (cells, dist) => {
    let best = -1, bestDist = Infinity;
    for (let i = 0; i < cells.length; i++) {
      if (dist[cells[i]] < bestDist) { bestDist = dist[cells[i]]; best = cells[i]; }
    }
    return best;
  };

  // Goal by priority; `-1` when none of that rank is reachable.
  let goal = -1;
  if (open && carried.length > 0) goal = nearest(mergeIdx, nearPlayer);
  if (goal < 0 && open) goal = nearest(exitIdx, nearPlayer);
  if (goal < 0 && carried.length >= CARRY_MAX) goal = nearest(mergeIdx, nearPlayer);
  if (goal < 0) goal = nearest(patchIdx, nearPlayer);
  if (goal < 0 && carried.length > 0) goal = nearest(mergeIdx, nearPlayer);
  if (goal < 0) {
    // Nothing to fetch: wait by a spawn point for the next patch, but
    // not on one (a patch never spawns on the player's cell) and not
    // under a drift (a patch never spawns under one either).
    const busy = [];
    for (const d of drifts) if (d && d.y >= 0 && d.y < H && d.x >= 0 && d.x < W) busy.push(d.y * W + d.x);
    const spawnIdx = [];
    const spawns = state.level.spawns || [];
    for (const s of spawns) {
      const i = s.y * W + s.x;
      if (i === py * W + px || busy.indexOf(i) >= 0) continue;
      spawnIdx.push(i);
    }
    goal = nearest(spawnIdx, nearPlayer);
  }
  if (goal < 0) goal = nearest(mergeIdx, nearPlayer);

  // Distance to the goal from every cell, or none when the level
  // happens to offer no reachable goal at all this tick.
  const goalDist = goal >= 0
    ? flood(goal % W, (goal - (goal % W)) / W)
    : null;

  // How each input would rank on safety, exactly as §6 step 12 hits:
  // with invulnerability nothing hits; otherwise a drift that ends this
  // step on the player's cell — or that swaps cells with it, standing
  // now where the player began the move and coming from where the
  // player now is — hits, a drop when carrying, a lost life when not.
  const forMove = (mv) => {
    let tx = px, ty = py;
    if (mv) {
      const nx = px + DIRS[mv][0], ny = py + DIRS[mv][1];
      if (playerPass(nx, ny)) { tx = nx; ty = ny; }
    }
    if (state.invuln > 0) return { x: tx, y: ty, bad: 0 };
    let bad = 0;
    for (let i = 0; i < drifts.length; i++) {
      const pre = drifts[i], post = ahead[i];
      let hit = post.x === tx && post.y === ty;
      if (!hit && (pre.x !== post.x || pre.y !== post.y)) {
        hit = post.x === px && post.y === py && pre.x === tx && pre.y === ty;
      }
      if (hit) {
        const cost = carried.length > 0 ? DROP : state.lives > 1 ? HIT : LOST;
        if (cost > bad) bad = cost;
      }
    }
    return { x: tx, y: ty, bad };
  };

  // The safest input, then the shortest, with the danger map as a tie
  // lighter between routes that measure the same.
  let bestMove = null, bestBad = Infinity, bestCost = Infinity;
  for (let i = 0; i < CANDIDATES.length; i++) {
    const mv = CANDIDATES[i];
    const plan = forMove(mv);
    const toIdx = plan.y * W + plan.x;
    const base = goalDist && isFinite(goalDist[toIdx]) ? goalDist[toIdx] : OFF_GRID;
    const cost = base + danger[toIdx];
    if (plan.bad < bestBad || (plan.bad === bestBad && cost < bestCost)) {
      bestBad = plan.bad;
      bestCost = cost;
      bestMove = mv;
    }
  }
  return { move: bestMove, pause: false };
}
