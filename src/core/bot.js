// The autopilot (DESIGN.md §9). botInput(state) returns an input
// { move, pause: false } for the state: it fetches patches (batching up
// to CARRY_MAX), merges them on a pad, and heads for the exit once the
// quorum is met. Paths are breadth-first searches over the grid, run in
// widening caution tiers around the drifts; everything is deterministic:
// the same state always gives the same input, and nothing that is read is
// ever changed.

import { CARRY_MAX, DIRS } from './constants.js';

// The fixed neighbour order keeps every tie deterministic.
const ORDER = ['up', 'right', 'down', 'left'];

// Levels are at most 32 cells wide and 24 high (§4), so the search grids
// are laid out on a fixed board of that size.
const W = 32;
const H = 24;
const CELLS = W * H;

const STILL = { move: null, pause: false };

// Caution tiers, outermost first: 'safe' keeps a wide berth around every
// drift, 'loose' may pass beside a drift but never onto one, 'any' takes
// whatever cell the rules let the player enter.
const TIERS = [
  { avoidDrift: true, avoidDanger: true },
  { avoidDrift: true, avoidDanger: false },
  { avoidDrift: false, avoidDanger: false },
];

const idx = (x, y) => y * W + x;
const xOf = (i) => i % W;
const yOf = (i) => (i - xOf(i)) / W;

export function botInput(state) {
  const level = state && state.level;
  const tiles = level && level.tiles;
  if (!Array.isArray(tiles) || tiles.length === 0 || tiles.length > H) return STILL;
  for (const row of tiles) {
    if (typeof row !== 'string' || row.length > W) return STILL;
  }
  const px = state.player && state.player.x;
  const py = state.player && state.player.y;
  if (!Number.isInteger(px) || !Number.isInteger(py)) return STILL;
  if (py < 0 || py >= tiles.length) return STILL;
  if (px < 0 || px >= tiles[py].length) return STILL;
  const start = idx(px, py);
  const open = Boolean(state.open);

  // Terrain: one flag per cell saying the player may enter it — not a
  // wall, not a closed hold or closed exit, and no conflict on it.
  const pass = new Uint8Array(CELLS);
  const padMark = new Uint8Array(CELLS);
  const pads = [];
  const exits = [];
  for (let y = 0; y < tiles.length; y++) {
    const row = tiles[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '#') continue;
      const i = idx(x, y);
      pass[i] = 1;
      if (ch === 'H' || ch === 'X') {
        if (!open) pass[i] = 0;
        else if (ch === 'X') exits.push(i);
      }
      if (ch === 'M') {
        pads.push(i);
        padMark[i] = 1;
      }
    }
  }

  const conflicts = Array.isArray(state.conflicts) ? state.conflicts : [];
  for (const c of conflicts) {
    if (!Number.isInteger(c && c.x) || !Number.isInteger(c.y)) continue;
    if (c.x < 0 || c.x >= W || c.y < 0 || c.y >= H) continue;
    pass[idx(c.x, c.y)] = 0;
  }

  // A drift's cell and every cell beside one are risky ground.
  const driftMark = new Uint8Array(CELLS);
  const danger = new Uint8Array(CELLS);
  const drifts = Array.isArray(state.drifts) ? state.drifts : [];
  for (const d of drifts) {
    if (!Number.isInteger(d && d.x) || !Number.isInteger(d.y)) continue;
    if (d.x < 0 || d.x >= W || d.y < 0 || d.y >= H) continue;
    const i = idx(d.x, d.y);
    driftMark[i] = 1;
    danger[i] = 1;
    if (d.y > 0) danger[i - W] = 1;
    if (d.x < W - 1) danger[i + 1] = 1;
    if (d.y < H - 1) danger[i + W] = 1;
    if (d.x > 0) danger[i - 1] = 1;
  }

  // The lying patches, as cell indices in reading order.
  const patchKeys = [];
  const patchList = Array.isArray(state.patches) ? state.patches : [];
  for (const p of patchList) {
    if (Number.isInteger(p && p.x) && Number.isInteger(p.y) && p.x >= 0
      && p.x < W && p.y >= 0 && p.y < H) {
      patchKeys.push(idx(p.x, p.y));
    }
  }

  const carried = Array.isArray(state.carried) ? state.carried.length : 0;

  // Scratch state for the searches, reused run to run through a
  // generation stamp in `seen`.
  const dist = new Int32Array(CELLS);
  const prev = new Int32Array(CELLS);
  const seen = new Int32Array(CELLS);
  const queue = new Int32Array(CELLS);
  let generation = 0;

  // May the search walk through a cell in a tier? The start cell is the
  // player's own cell and is never filtered.
  const walkable = (i, tier) =>
    pass[i] === 1
      && !(tier.avoidDrift && driftMark[i] === 1)
      && !(tier.avoidDanger && danger[i] === 1)
      && !(tier.avoidPads && padMark[i] === 1);

  const goalOk = (i, tier) =>
    pass[i] === 1
      && !(tier.avoidDanger && danger[i] === 1)
      && !(tier.avoidDrift && driftMark[i] === 1);

  // One breadth-first search: from one cell or from several, flooding to
  // the edge of its tier's reach. With `goals` it stops at the first
  // goal reached (in cell order) and returns the first step's key, -1 if
  // none is reached; without goals it floods the whole map and returns
  // the generation of the results, which the caller reads via seen/dist.
  function search(sources, goals, tier, full) {
    if (sources.length === 0) return -1;
    generation++;
    const g = generation;
    let head = 0;
    let tail = 0;
    for (const s of sources) {
      if (seen[s] === g) continue;
      seen[s] = g;
      dist[s] = 0;
      prev[s] = -1;
      queue[tail++] = s;
    }
    while (head < tail) {
      const cur = queue[head++];
      const cx = xOf(cur);
      const cy = yOf(cur);
      for (const dir of ORDER) {
        const [ddx, ddy] = DIRS[dir];
        const nx = cx + ddx;
        const ny = cy + ddy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const ni = ny * W + nx;
        if (seen[ni] === g) continue;
        if (goals !== null && goals.has(ni) && goalOk(ni, tier)) {
          prev[ni] = cur; // firstStepKey walks the parents of this run
          return firstStepKey(ni);
        }
        if (!walkable(ni, tier)) continue;
        seen[ni] = g;
        dist[ni] = dist[cur] + 1;
        prev[ni] = cur;
        queue[tail++] = ni;
      }
    }
    return full ? g : -1;
  }

  // The first step of the path to `goal` in the last search, by walking
  // the parents back; -1 when the goal is the start.
  function firstStepKey(goal) {
    let cur = goal;
    let guard = CELLS;
    while (cur !== start && prev[cur] !== start && guard-- > 0) cur = prev[cur];
    if (cur === start || prev[cur] !== start) return -1;
    return cur;
  }

  function stepInput(nextKey) {
    if (nextKey < 0) return null;
    const ddx = xOf(nextKey) - px;
    const ddy = yOf(nextKey) - py;
    for (const dir of ORDER) {
      const [ex, ey] = DIRS[dir];
      if (ex === ddx && ey === ddy) return { move: dir, pause: false };
    }
    return null;
  }

  // One tier run to a goal set: Standing on the goal is success with a
  // still input; a found path turns into first step; nothing found moves
  // the hunt to the next tier.
  function reach(goals, tier) {
    if (goals.has(start)) return STILL;
    const key = search([start], goals, tier, false);
    return stepInput(key);
  }

  function firstMoveTo(goalList) {
    const goals = new Set(goalList);
    for (const tier of TIERS) {
      const got = reach(goals, tier);
      if (got) return got;
    }
    return null;
  }

  // Gather the nearest mergeable patch: in the widest tier the bot can
  // work in, one whose patch and a pad behind it are both reachable.
  function chasePatch() {
    for (const tier of TIERS) {
      const reached = search([start], null, tier, true);
      if (reached < 0) continue;
      const gPlayer = reached;
      let any = false;
      const d1 = [];
      for (const key of patchKeys) {
        const v = seen[key] === gPlayer ? dist[key] : -1;
        d1.push(v);
        if (v >= 0) any = true;
      }
      if (!any) continue;
      const gPads = pads.length > 0 ? search(pads.filter((p) => pass[p] === 1), null, tier, true) : -1;
      let best = -1;
      let bestCost = Infinity;
      for (let k = 0; k < patchKeys.length; k++) {
        if (d1[k] < 0) continue;
        const key = patchKeys[k];
        const d2 = seen[key] === gPads && gPads >= 0 ? dist[key] : -1;
        if (d2 < 0) continue;
        const cost = d1[k] + d2;
        if (cost < bestCost) {
          bestCost = cost;
          best = k;
        }
      }
      if (best < 0) continue;
      const goals = new Set([patchKeys[best]]);
      // With cargo, prefer a route that does not cross a merge pad,
      // which would merge a small batch early; fall back to any route.
      if (carried > 0) {
        const quietTier = { ...tier, avoidPads: true };
        const got = reach(goals, quietTier);
        if (got) return got;
      }
      const got = reach(goals, tier);
      if (got) return got;
    }
    return null;
  }

  // Open exit first, patches next, merging held cargo when there is
  // nothing more to fetch, then getting clear of the drifts.
  if (open && exits.length > 0) {
    const got = firstMoveTo(exits);
    if (got) return got;
  }
  if (carried < CARRY_MAX && patchKeys.length > 0) {
    const got = chasePatch();
    if (got) return got;
  }
  if (carried > 0 && pads.length > 0) {
    const got = firstMoveTo(pads);
    if (got) return got;
  }
  if (danger[start] === 1) {
    // In a drift's reach: reach any non-drift, non-danger ground.
    const goals = new Set();
    for (let i = 0; i < CELLS; i++) {
      if (pass[i] === 1 && driftMark[i] === 0 && danger[i] === 0) goals.add(i);
    }
    for (const tier of TIERS) {
      const got = reach(goals, tier);
      if (got) return got;
    }
  }
  return STILL;
}
