// The bot (DESIGN.md §9): a pure, deterministic autopilot.
//
// `botInput(state)` answers one input `{ move, pause: false }` for the
// state: fetch patches while there is room in the hands, merge at the pad
// (holding up to CARRY_MAX at once so merges earn their bulk and
// same-colour bonuses), and take the exit once the quorum has opened the
// level. Moves are planned over the grid with a breadth-first search, and
// the drifts are simulated one and two ticks ahead — they are unaffected
// by the player, so their next positions are exact — so the bot never
// walks into a drift, never accepts a cell swap, and routes around
// conflicts while they last.
//
// The module is deliberately dependency-free: it keeps its own copies of
// the tables of §2 and reads the state alone, so it cannot drift from the
// rules the game implements and stays pure for a frozen state.

const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const ORDER = ['up', 'right', 'down', 'left']; // CLOCKWISE turn order of §2
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const CARRY_MAX = 3; // §2
const CONFLICT_TICKS = 10; // §2
const IDLE = { move: null, pause: false };

// Reading-order key of a cell.
function keyOf(width, x, y) {
  return y * width + x;
}

// The terrain character of a cell, '#' off the map (§5's tileAt).
function tileAt(level, x, y) {
  if (y < 0 || y >= level.height) return '#';
  const row = level.tiles[y];
  if (x < 0 || x >= row.length) return '#';
  return row[x];
}

// Passable to the player (§6 step 6): not a wall, not a hold or the exit
// unless open, and not on a conflict cell of the given set.
function playerPassable(level, x, y, open, blocked) {
  const t = tileAt(level, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !open) return false;
  if (blocked && blocked.has(keyOf(level.width, x, y))) return false;
  return true;
}

// Passable to a drift (§6 step 10): never a wall, hold, or exit, and no
// conflict on the target cell.
function driftPassable(level, x, y, conflicts) {
  const t = tileAt(level, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !conflicts.has(keyOf(level.width, x, y));
}

// One tick of the drift-and-conflict world (§6 steps 5, 10, 11): the
// player never affects it. `conflicts` maps a cell key to its remaining
// ttl; `moved` says whether the drifts step on this tick.
function simulate(level, drifts, conflicts, moved) {
  // Step 5: conflicts age and those at 0 go.
  const aged = new Map();
  for (const [k, ttl] of conflicts) if (ttl > 1) aged.set(k, ttl - 1);
  const next = drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  if (moved) {
    // Step 10: each drift tries its own direction, then clockwise, up to
    // four, and takes the first passable one.
    for (const d of next) {
      const at = Math.max(0, ORDER.indexOf(d.dir));
      for (let i = 0; i < 4; i++) {
        const dir = ORDER[(at + i) % 4];
        const tx = d.x + DIRS[dir][0];
        const ty = d.y + DIRS[dir][1];
        if (driftPassable(level, tx, ty, aged)) {
          d.x = tx;
          d.y = ty;
          d.dir = dir;
          break;
        }
      }
    }
    // Step 11: cells holding two or more drifts reverse them and spawn a
    // conflict, in reading order.
    const width = level.width;
    const byCell = new Map();
    for (const d of next) {
      const k = keyOf(width, d.x, d.y);
      const list = byCell.get(k);
      if (list) list.push(d);
      else byCell.set(k, [d]);
    }
    for (const k of [...byCell.keys()].sort((a, b) => a - b)) {
      const list = byCell.get(k);
      if (list.length >= 2) {
        for (const d of list) d.dir = OPPOSITE[d.dir] || d.dir;
        if (!aged.has(k)) aged.set(k, CONFLICT_TICKS);
      }
    }
  }
  return { drifts: next, conflicts: aged };
}

// Breadth-first distances over the grid from the player. `blocked` is a
// set of cell keys the plan will not pass through (conflicts); holds and
// the exit count as passable exactly when `open`.
function planPaths(level, sx, sy, open, blocked) {
  const width = level.width;
  const total = width * level.height;
  const dist = new Array(total).fill(-1);
  const prev = new Array(total).fill(-1);
  const start = keyOf(width, sx, sy);
  dist[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head];
    const x = k % width;
    const y = (k - x) / width;
    for (const dir of ORDER) {
      const nx = x + DIRS[dir][0];
      const ny = y + DIRS[dir][1];
      if (nx < 0 || ny < 0 || nx >= width || ny >= level.height) continue;
      const nk = keyOf(width, nx, ny);
      if (dist[nk] !== -1) continue;
      if (!playerPassable(level, nx, ny, open, blocked)) continue;
      dist[nk] = dist[k] + 1;
      prev[nk] = k;
      queue.push(nk);
    }
  }
  return { dist, prev, start };
}

// The direction of the first step of the shortest path from `start` to
// `target`, or null when unreachable or already standing on it.
function firstStep(level, plan, start, target) {
  const d = plan.dist[target];
  if (d === undefined || d <= 0) return null;
  let cur = target;
  for (let guard = 0; guard < d && plan.prev[cur] !== start; guard++) {
    cur = plan.prev[cur];
    if (cur < 0) return null;
  }
  if (plan.prev[cur] !== start) return null;
  const width = level.width;
  const sx = start % width;
  const sy = (start - sx) / width;
  const dx = (cur % width) - sx;
  const dy = ((cur - (cur % width)) / width) - sy;
  for (const dir of ORDER) {
    if (DIRS[dir][0] === dx && DIRS[dir][1] === dy) return dir;
  }
  return null;
}

// Nearest of the candidate cells, the earliest in the list winning ties.
function nearestTo(plan, cells) {
  let best = -1;
  let bestDist = -1;
  for (const k of cells) {
    const d = plan.dist[k];
    if (d >= 0 && (best < 0 || d < bestDist)) {
      best = k;
      bestDist = d;
    }
  }
  return best;
}

// True when any drift of the list would stand on the cell after a tick in
// which the player stayed there: the hit condition of §6 step 12 for a
// player who does not move.
function landsOn(cell, drifts) {
  for (const d of drifts) {
    if (d.x === cell.x && d.y === cell.y) return true;
  }
  return false;
}

// Manhattan distance from the cell to the nearest drift of the list.
function driftDistance(cell, drifts) {
  let best = Infinity;
  for (const d of drifts) {
    const d_ = Math.abs(d.x - cell.x) + Math.abs(d.y - cell.y);
    if (d_ < best) best = d_;
  }
  return best === Infinity ? 99 : best;
}

// botInput: the one export of §9. Returns `{ move, pause: false }`.
export function botInput(state) {
  if (!state || state.status !== 'playing') return IDLE;
  const level = state.level;
  const player = state.player;
  if (!level || !Array.isArray(level.tiles) || !player) return IDLE;
  const width = level.width;
  if (!(width > 0) || !(level.height > 0)) return IDLE;
  const open = !!state.open;
  const carried = Array.isArray(state.carried) ? state.carried.length : 0;
  const patches = Array.isArray(state.patches) ? state.patches : [];
  const driftsNow = Array.isArray(state.drifts) ? state.drifts : [];
  const invulnNow = state.invuln > 0;
  const needLeft = Math.max(0, level.quorum - state.merges);

  // The conflict map as it stands, cell keys to ttl.
  const conflictsNow = new Map();
  for (const c of Array.isArray(state.conflicts) ? state.conflicts : []) {
    conflictsNow.set(keyOf(width, c.x, c.y), c.ttl | 0);
  }

  // Predict the drifts for the next two ticks. Drifts ignore the player
  // (§6 step 10), so nothing the bot does will change what they do.
  const driftPeriod = level.driftPeriod > 0 ? level.driftPeriod : 1;
  const tick = state.tick | 0;
  const one = simulate(level, driftsNow, conflictsNow, (tick + 1) % driftPeriod === 0);
  const two = simulate(level, one.drifts, one.conflicts, (tick + 2) % driftPeriod === 0);
  const d1 = one.drifts;
  const d2 = two.drifts;

  // Conflict-key sets: strict blocks the cells a conflict holds now or
  // will reach in the next two ticks; loose keeps only the predicted
  // ones, for goals whose strict way a conflict is crossing.
  const blockedStrict = new Set([...conflictsNow.keys(),
    ...one.conflicts.keys(), ...two.conflicts.keys()]);
  const blockedLoose = new Set([...one.conflicts.keys(), ...two.conflicts.keys()]);

  const plan = planPaths(level, player.x, player.y, open, blockedStrict);
  const loose = planPaths(level, player.x, player.y, open, blockedLoose);

  // Goal cells: every pad in reading order, the one exit, the patches in
  // the state's order.
  const pads = [];
  let exitKey = -1;
  for (let y = 0; y < level.height; y++) {
    const row = level.tiles[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === 'M') pads.push(keyOf(width, x, y));
      else if (ch === 'X') exitKey = keyOf(width, x, y);
    }
  }
  const patchKeys = [];
  for (const p of patches) {
    if (p.x >= 0 && p.y >= 0 && p.y < level.height &&
        p.x < (level.tiles[p.y] || '').length) {
      patchKeys.push(keyOf(width, p.x, p.y));
    }
  }

  // What to want, in the order to want it (§9): the exit when the quorum
  // has opened the level; the pad when the hands are full or hold every
  // patch the quorum still needs; more patches while there is room and a
  // patch lies in reach (any carrying hands fall back to the pad when
  // none does); patches plainly when empty-handed.
  const wants = [];
  if (open) {
    wants.push([exitKey]);
  } else if (carried > 0) {
    if (carried >= CARRY_MAX || carried >= needLeft) wants.push(pads);
    else wants.push(patchKeys, pads);
  } else if (patchKeys.length > 0) {
    wants.push(patchKeys);
  }

  let goalKey = -1;
  let goalPlan = null;
  for (const cells of wants) {
    for (const option of [plan, loose]) {
      const target = nearestTo(option, cells);
      if (target >= 0) {
        goalKey = target;
        goalPlan = option;
        break;
      }
    }
    if (goalKey >= 0) break;
  }

  const moveOf = goalKey >= 0 ? firstStep(level, goalPlan, goalPlan.start, goalKey) : null;

  // The cell the player would end on for a move that is even worth
  // making: not into a wall, not through a closed hold or the closed
  // exit, not back onto a conflict (the rules keep the player where it
  // was for either — a tick wasted).
  function stepTarget(dir) {
    const tx = player.x + DIRS[dir][0];
    const ty = player.y + DIRS[dir][1];
    if (!playerPassable(level, tx, ty, open, conflictsNow)) return null;
    return { x: tx, y: ty, key: keyOf(width, tx, ty) };
  }

  // Would a step that ends on `cell` be a hit during the coming tick
  // (§6 step 12)? A drift landing on the cell, or a drift that sits today
  // where the player will stand and sits tomorrow where the player was:
  // their cells swap. While `invuln` holds, nothing hits.
  function unsafe(cell) {
    if (invulnNow) return false;
    for (let i = 0; i < d1.length; i++) {
      const after = d1[i];
      if (after.x === cell.x && after.y === cell.y) return true;
      const before = driftsNow[i];
      if (after.x === player.x && after.y === player.y &&
          before.x === cell.x && before.y === cell.y) return true;
    }
    return false;
  }

  // Take the planned step when it costs no hit.
  if (moveOf !== null) {
    const target = stepTarget(moveOf);
    if (target && !unsafe(target)) return { move: moveOf, pause: false };
  }

  // Otherwise hold the spot while it stays clear of drifts for two ticks;
  // a drift two ticks out is worth sidestepping while there is room to.
  const here = { x: player.x, y: player.y };
  if (!unsafe(here) && !landsOn(here, d2)) return IDLE;

  // Dodge: among the legal, unhittable steps prefer those the next tick
  // leaves clear, then those closest to the goal, then those farthest
  // from any predicted drift; the earliest checked direction wins ties
  // (ORDER is fixed, so this is deterministic).
  let best = null;
  let bestScore = null;
  for (const dir of ORDER) {
    const target = stepTarget(dir);
    if (!target || unsafe(target)) continue;
    const goalWay = goalPlan ? goalPlan.dist[target.key] : -1;
    const score = [
      landsOn(target, d2) ? 1 : 0,
      goalWay < 0 ? 10000 : goalWay,
      99 - driftDistance(target, d2),
    ];
    if (bestScore === null || score < bestScore) {
      best = dir;
      bestScore = score;
    }
  }
  if (best) return { move: best, pause: false };

  // Stand when nothing is better and standing survives this tick.
  if (!unsafe(here)) return IDLE;

  // Every direction and standing are threatened; take the least flight
  // from any drift that could land on the player (deterministic order).
  let last = null;
  let lastScore = -1;
  for (const dir of [null, ...ORDER]) {
    const target = dir ? stepTarget(dir) : here;
    if (dir && !target) continue;
    const score = driftDistance(target, d1);
    if (score > lastScore) {
      last = dir;
      lastScore = score;
    }
  }
  if (last !== null) return { move: last, pause: false };
  return IDLE;
}
