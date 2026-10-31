// An autopilot that plays Quorum Run (DESIGN.md §9).
//
// botInput(state) returns { move, pause: false } and is pure: it changes
// nothing, draws no randomness, and gives the same input for the same
// state. Each step is planned from scratch:
//
//   1. predict exactly where every drift stands after this step, conflicts
//      aged first, per §6 steps 5, 10 and 11;
//   2. pick a target: the exit once the level is open, a merge pad when
//      the hands are full, a patch while room is left, a merge pad when
//      carrying, else a cell beside a spawn point to wait for the next
//      patch;
//   3. walk a breadth-first path to it that avoids conflicts, drifts, and
//      cells a drift will reach this step; when drifts wall off every
//      route the blocking relaxes one level at a time;
//   4. check the chosen move against the exact hit rules of §6 step 12 —
//      never land where a drift lands, never swap cells with one, never
//      step onto one that stays;
//   5. holding still is allowed only while no drift lands on the player's
//      cell within a few steps; otherwise the bot steps aside, preferring
//      cells no drift is headed for.

import { DIRS, CLOCKWISE, CARRY_MAX } from './constants.js';

// The four moves, clockwise from up (§2), which is also the tie-break
// order for paths and for fallbacks.
const DIR_VECTORS = CLOCKWISE.map((name) => DIRS[name]);
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// The terrain at a cell, '#' past the edges of the map (§5 tileAt).
function tileOf(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

// A drift may stand on any terrain but a wall, a hold, or the exit (§6
// step 10), open or not.
function passableForDrift(t) {
  return t !== '#' && t !== 'H' && t !== 'X';
}

// A cell the player may stand on: never a wall; holds and the exit only
// while the level is open (§6 step 6).
function passableForPlayer(t, open) {
  if (t === '#') return false;
  if (!open && (t === 'H' || t === 'X')) return false;
  return true;
}

function keyOf(width, x, y) {
  return y * width + x;
}

// Conflicts on the board during the next step: each ages by one first (§6
// step 5), and one that reaches 0 is gone. `age` is how many stages to age
// past the state's value: 1 for the next step, 2 for the step after.
function conflictAged(conflicts, width, age) {
  const set = new Set();
  for (const c of conflicts ?? []) {
    if (c.ttl > age) set.add(keyOf(width, c.x, c.y));
  }
  return set;
}

// One drift phase over `drifts`, per §6 step 10 (turn order against walls,
// holds, the exit, and conflicts) and step 11 (collisions). Returns the
// drifts' resulting { x, y, dir } in drift order and, on move ticks, the
// cells where two or more drifts collided — a conflict forms on each.
function simDriftStep(level, drifts, conflicts, willMove) {
  const width = level.width;
  const land = [];
  for (const d of drifts) {
    if (!willMove) {
      land.push({ x: d.x, y: d.y, dir: d.dir });
      continue;
    }
    const from = Math.max(0, CLOCKWISE.indexOf(d.dir));
    let placed = false;
    for (let k = 0; k < 4 && !placed; k++) {
      const m = (from + k) % 4;
      const [dx, dy] = DIR_VECTORS[m];
      const x = d.x + dx;
      const y = d.y + dy;
      if (passableForDrift(tileOf(level, x, y)) && !conflicts.has(keyOf(width, x, y))) {
        land.push({ x, y, dir: CLOCKWISE[m] });
        placed = true;
      }
    }
    if (!placed) land.push({ x: d.x, y: d.y, dir: d.dir });
  }
  const collisions = [];
  if (willMove && land.length > 1) {
    const stacks = new Map();
    for (let i = 0; i < land.length; i++) {
      const k = keyOf(width, land[i].x, land[i].y);
      if (!stacks.has(k)) stacks.set(k, []);
      stacks.get(k).push(i);
    }
    for (const k of [...stacks.keys()].sort((a, b) => a - b)) {
      if (stacks.get(k).length < 2) continue;
      for (const i of stacks.get(k)) land[i].dir = REVERSE[land[i].dir] ?? land[i].dir;
      collisions.push(k);
    }
  }
  return { land, collisions };
}

// Breadth-first search over the cells the player may stand on. `blocked`
// is a set of cell keys treated as impassable. Returns dist/fn arrays
// where dist ≥ 0 marks a reached cell and fn its first step (0 to 3, a
// CLOCKWISE move index); the start cell is always reached at distance 0.
function bfsFrom(level, open, blocked, px, py) {
  const width = level.width;
  const height = level.height;
  const dist = new Int16Array(width * height).fill(-1);
  const fn = new Int8Array(width * height).fill(-1);
  const start = keyOf(width, px, py);
  dist[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const key = queue[head];
    const x = key % width;
    const y = (key - x) / width;
    for (let m = 0; m < 4; m++) {
      const nx = x + DIR_VECTORS[m][0];
      const ny = y + DIR_VECTORS[m][1];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nk = keyOf(width, nx, ny);
      if (dist[nk] !== -1) continue;
      if (!passableForPlayer(tileOf(level, nx, ny), open)) continue;
      if (blocked.has(nk)) continue;
      dist[nk] = dist[key] + 1;
      fn[nk] = key === start ? m : fn[key];
      queue.push(nk);
    }
  }
  return { dist, fn };
}

// The best reachable cell of a candidate list: the closest, ties in list
// order (build the lists in reading order). Null when none is reached.
function pickCell(reached, cells) {
  let best = null;
  for (const cell of cells) {
    if (reached.dist[cell] < 0) continue;
    if (best === null || reached.dist[cell] < reached.dist[best]) best = cell;
  }
  return best === null ? null : { cell: best, dist: reached.dist[best] };
}

// Which sort of progress cell to walk to, in the order of §9: the exit
// first when it is open, a merge pad when the hands are full, a patch
// while room remains, a merge pad when carrying. Waiting spots beside
// spawn points are settled separately, after every relaxation has been
// tried for progress.
function chooseCargo(reached, exits, merges, patches, open, carried) {
  if (open) {
    const exit = pickCell(reached, exits);
    if (exit !== null) return exit;
  }
  if (carried >= CARRY_MAX) {
    return pickCell(reached, merges);
  }
  if (carried < CARRY_MAX) {
    const patch = pickCell(reached, patches);
    if (patch !== null) return patch;
  }
  if (carried > 0) {
    const merge = pickCell(reached, merges);
    if (merge !== null) return merge;
  }
  return null;
}

export function botInput(state) {
  if (!state || state.status !== 'playing' || state.paused) return { move: null, pause: false };
  const level = state.level;
  if (!level || !state.player) return { move: null, pause: false };
  const width = level.width;
  const height = level.height;
  const open = !!state.open;
  const px = state.player.x;
  const py = state.player.y;
  const carried = state.carried ? state.carried.length : 0;
  const period = level.driftPeriod || 1;

  // Conflicts block from the moment they age in (§6 steps 5, 6, 10).
  const conflicts = conflictAged(state.conflicts, width, 1);

  // Where the drifts stand after this step (§6 step 10), cells a drift
  // will swap across, and whether a drift will land on the player's cell
  // within a few steps. Waiting beside a spawn point is safe only until a
  // patrol turns: a cell a drift will reach is no camp site.
  const stepA = simDriftStep(level, state.drifts ?? [], conflicts, (state.tick + 1) % period === 0);
  const dests = stepA.land;
  const destOcc = new Set(dests.map((d) => keyOf(width, d.x, d.y)));
  const nowOcc = new Set((state.drifts ?? []).map((d) => keyOf(width, d.x, d.y)));
  // A drift that will swap cells with the player this step: it now stands
  // on the cell the player would enter while it is headed for the player's
  // own cell (§6 step 12), so entering its cell is a hit.
  const swap = new Set();
  for (let i = 0; i < dests.length; i++) {
    const d = (state.drifts ?? [])[i];
    if (d && dests[i].x === px && dests[i].y === py) swap.add(keyOf(width, d.x, d.y));
  }
  // A few drift phases of preview: `attacked` gathers every cell a drift
  // lands on, whether it reaches the player's own cell is `unsafeToHold`.
  const attacked = new Set();
  let unsafeToHold = false;
  let drifts = dests;
  let conflictKeys = new Set([
    ...conflictAged(state.conflicts, width, 2),
    ...stepA.collisions,
  ]);
  for (let ahead = 2; ahead <= 4 && !unsafeToHold; ahead++) {
    const nxt = simDriftStep(level, drifts, conflictKeys, (state.tick + ahead) % period === 0);
    for (const d of nxt.land) {
      const k = keyOf(width, d.x, d.y);
      attacked.add(k);
      if (d.x === px && d.y === py) unsafeToHold = true;
    }
    drifts = nxt.land;
    conflictKeys = new Set([...conflictKeys, ...nxt.collisions]);
  }

  // Holding still is a hit when a drift lands on (or stays on) the
  // player's cell; a drift standing there that moves away is no hit.
  const staySafe = !destOcc.has(keyOf(width, px, py));
  const holdSafe = staySafe && !unsafeToHold;
  const steppingSafe = (x, y) => {
    const nk = keyOf(width, x, y);
    if (destOcc.has(nk) || swap.has(nk)) return false;
    if (!passableForPlayer(tileOf(level, x, y), open)) return false;
    if (conflicts.has(nk)) return false;
    return true;
  };

  // Cells worth walking to: exits, merge pads, patches, and the cells
  // beside spawn points worth standing near. Lists in reading order.
  const exits = [];
  const merges = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = tileOf(level, x, y);
      if (t === 'M') merges.push(keyOf(width, x, y));
      else if (t === 'X') exits.push(keyOf(width, x, y));
    }
  }
  const patches = (state.patches ?? []).map((p) => keyOf(width, p.x, p.y)).sort((a, b) => a - b);
  const spawnKeys = new Set((level.spawns ?? []).map((s) => keyOf(width, s.x, s.y)));
  const anchors = [];
  for (const s of level.spawns ?? []) {
    for (let m = 0; m < 4; m++) {
      const x = s.x + DIR_VECTORS[m][0];
      const y = s.y + DIR_VECTORS[m][1];
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const k = keyOf(width, x, y);
      if (spawnKeys.has(k)) continue;
      if (!passableForPlayer(tileOf(level, x, y), open)) continue;
      anchors.push(k);
    }
  }
  const anchorList = [...new Set(anchors)].sort((a, b) => a - b);

  // The plan: cross every relaxation level looking for progress cells —
  // the exit, patches, merge pads — before settling to wait, since a
  // drifting patrol can shade a pad for whole sweeps though a trailing
  // walk still crosses it. A relaxed opening is checked against the exact
  // hit rules and routed around when it is doomed.
  const full = new Set([...conflicts, ...nowOcc, ...destOcc]);
  const mid = new Set([...conflicts, ...nowOcc]);
  for (const blocked of [full, mid, conflicts]) {
    const aug = new Set(blocked);
    for (let pass = 0; pass < 8; pass++) {
      const reached = bfsFrom(level, open, aug, px, py);
      const target = chooseCargo(reached, exits, merges, patches, open, carried);
      if (target === null) break;
      if (target.dist === 0) {
        // Standing on the target is fine while nothing is coming for it:
        // pickups, merges, and exits fire on standing there (§6 steps 7-9).
        if (holdSafe) return { move: null, pause: false };
        break;
      }
      const m = reached.fn[target.cell];
      const nx = px + DIR_VECTORS[m][0];
      const ny = py + DIR_VECTORS[m][1];
      if (steppingSafe(nx, ny)) return { move: CLOCKWISE[m], pause: false };
      aug.add(keyOf(width, nx, ny));
    }
  }
  // No progress cell anywhere: wait beside a patch spawn, again in
  // relaxation order (a drifting patrol may need the roomier routes).
  for (const blocked of [full, conflicts]) {
    const aug = new Set(blocked);
    for (let pass = 0; pass < 8; pass++) {
      const reached = bfsFrom(level, open, aug, px, py);
      const target = pickCell(reached, anchorList);
      if (target === null) break;
      if (target.dist === 0) {
        if (holdSafe) return { move: null, pause: false };
        break;
      }
      const m = reached.fn[target.cell];
      const nx = px + DIR_VECTORS[m][0];
      const ny = py + DIR_VECTORS[m][1];
      if (steppingSafe(nx, ny)) return { move: CLOCKWISE[m], pause: false };
      aug.add(keyOf(width, nx, ny));
    }
  }

  // Nothing to reach: hold while that is safe, else step aside —
  // preferring safe cells no drift is headed for, then any safe cell, then
  // any passable neighbour (ordered clockwise), else hold anyway.
  if (holdSafe) return { move: null, pause: false };
  const options = [];
  for (let m = 0; m < 4; m++) {
    const x = px + DIR_VECTORS[m][0];
    const y = py + DIR_VECTORS[m][1];
    if (!passableForPlayer(tileOf(level, x, y), open)) continue;
    if (conflicts.has(keyOf(width, x, y))) continue;
    options.push({ m, x, y });
  }
  const safe = options.filter((o) => steppingSafe(o.x, o.y));
  const calm = safe.filter((o) => !attacked.has(keyOf(width, o.x, o.y)));
  if (calm.length > 0) return { move: CLOCKWISE[calm[0].m], pause: false };
  if (safe.length > 0) return { move: CLOCKWISE[safe[0].m], pause: false };
  if (options.length > 0) return { move: CLOCKWISE[options[0].m], pause: false };
  return { move: null, pause: false };
}
