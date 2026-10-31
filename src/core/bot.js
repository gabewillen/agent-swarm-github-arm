// Quorum Run — the autopilot (DESIGN.md §9).
// Pure and deterministic: it reads the state, never changes it, and draws
// no randomness. The strategy: pick up patches (staying in a colour for
// the bonus), merge full hands or enough to open the door, dodge drifts,
// and take the exit once it is open.

import { CARRY_MAX } from './constants.js';

const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const ORDER = ['up', 'right', 'down', 'left'];
const STEP4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const key = (x, y) => x + ',' + y;
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// Breadth-first search from the player over cells that `ok` accepts.
// Returns a map of cell key to { dist, move }: the cell's distance and
// the first step on the shortest path to it.
function search(player, ok) {
  const seen = new Map([[key(player.x, player.y), { dist: 0, move: null }]]);
  const queue = [{ x: player.x, y: player.y, first: null, dist: 0 }];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const dir of ORDER) {
      const [dx, dy] = DIRS[dir];
      const nx = cur.x + dx, ny = cur.y + dy;
      const k = key(nx, ny);
      if (seen.has(k) || !ok(nx, ny)) continue;
      const first = cur.first === null ? dir : cur.first;
      const dist = cur.dist + 1;
      seen.set(k, { dist, move: first });
      queue.push({ x: nx, y: ny, first, dist });
    }
  }
  return seen;
}

export function botInput(state) {
  const still = { move: null, pause: false };
  if (!state || state.status !== 'playing') return still;
  const { level, player, open } = state;
  const width = level.width, height = level.height;
  const tiles = level.tiles;
  const tile = (x, y) => (y < 0 || y >= height || x < 0 || x >= width ? '#' : tiles[y][x]);

  const conflicts = new Set(state.conflicts.map((c) => key(c.x, c.y)));
  const drifts = new Set(state.drifts.map((d) => key(d.x, d.y)));
  const hot = new Set(drifts);
  for (const d of state.drifts) {
    for (const [dx, dy] of STEP4) hot.add(key(d.x + dx, d.y + dy));
  }
  const laid = state.patches.map((p) => ({ ...p }));
  const patchAt = new Map(laid.map((p) => [key(p.x, p.y), p]));

  // Passable to the player: not a wall, not a closed hold or exit, and
  // no conflict on it (§6 step 6). `extra` blocks further cells.
  const legal = (x, y, extra) => {
    const t = tile(x, y);
    if (t === '#' || (t === 'H' && !open) || (t === 'X' && !open)) return false;
    if (conflicts.has(key(x, y))) return false;
    if (extra && extra.has(key(x, y))) return false;
    return true;
  };
  const cool = (x, y) => legal(x, y) && !hot.has(key(x, y));

  // A lying patch can only be entered from a neighbouring cell, so its
  // distance comes from the best entered neighbour.
  function patchStep(dists, targets) {
    let best = null;
    for (const p of targets) {
      const [px, py] = p;
      let reach = null;
      for (const [dx, dy] of STEP4) {
        const d = dists.get(key(px + dx, py + dy));
        if (d === undefined) continue;
        if (reach === null || d.dist < reach.dist) reach = { dist: d.dist, move: d.move };
        if (reach.dist === 0) break;
      }
      if (reach === null) continue;
      const cand = { dist: reach.dist + 1, move: reach.move, at: key(px, py) };
      if (best === null || cand.dist < best.dist) best = cand;
      if (best.dist === 1) break;
    }
    return best;
  }

  const held = state.carried.length;

  // In danger next to a drift: step to the neighbour farthest from any
  // drift, never onto a drift, preferring cool cells.
  if (state.invuln <= 0 && state.drifts.some((d) => manhattan(d, player) <= 1)) {
    const here = Math.min(...state.drifts.map((d) => manhattan(d, player)));
    const onHot = hot.has(key(player.x, player.y));
    let best = null;
    for (const dir of ORDER) {
      const [dx, dy] = DIRS[dir];
      const nx = player.x + dx, ny = player.y + dy;
      if (!legal(nx, ny) || drifts.has(key(nx, ny))) continue;
      const dist = Math.min(...state.drifts.map((d) => manhattan(d, { x: nx, y: ny })));
      const cand = { dist, cool: !hot.has(key(nx, ny)), prio: ORDER.indexOf(dir) };
      const better = (a, b) =>
        a.dist !== b.dist ? a.dist < b.dist : a.cool !== b.cool ? a.cool : a.prio < b.prio;
      if (best === null || better(cand, best)) best = cand;
    }
    const worth = best !== null && (best.dist > here || (best.dist === here && best.cool && !onHot));
    if (worth) return { move: ORDER[best.prio], pause: false };
    return still;
  }

  // Where to walk, by what the hands need:
  //   open and full hands   -> merge for the points
  //   open and empty hands  -> the exit, without stamping on patches
  //   not open, full hands or hands enough to open the door -> merge
  //   not open, short hands -> a patch, in the carried colour if it is
  //                            within a short detour
  //   nothing to fetch      -> hover by a merge pad for the next spawn
  const pads = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (tiles[y][x] === 'M') pads.push([x, y]);
  }
  const mergeNow = state.open
    ? held > 0
    : held > 0 && (held >= CARRY_MAX || held >= level.quorum - state.merges);

  if (mergeNow) {
    const dists = search(player, cool);
    let best = null;
    for (const [x, y] of pads) {
      const d = dists.get(key(x, y));
      if (d !== undefined && (best === null || d.dist < best.dist)) best = { ...d, at: key(x, y) };
      if (best !== null && best.dist === 0) break;
    }
    if (best === null) {
      const dists2 = search(player, (x, y) => legal(x, y));
      for (const [x, y] of pads) {
        const d = dists2.get(key(x, y));
        if (d !== undefined && (best === null || d.dist < best.dist)) best = { ...d, at: key(x, y) };
      }
    }
    if (best !== null && best.dist > 0) return { move: best.move, pause: false };
    return still;
  }

  if (open && held === 0) {
    const exit = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) if (tiles[y][x] === 'X') exit.push([x, y]);
    }
    const blockPatches = new Set(patchAt.keys());
    const dists = search(player, (x, y) => cool(x, y) && !blockPatches.has(key(x, y)));
    let best = null;
    for (const [x, y] of exit) {
      const d = dists.get(key(x, y));
      if (d !== undefined && (best === null || d.dist < best.dist)) best = { ...d, at: key(x, y) };
      if (best !== null && best.dist === 0) break;
    }
    if (best === null) {
      const dists2 = search(player, (x, y) => legal(x, y) && !blockPatches.has(key(x, y)));
      for (const [x, y] of exit) {
        const d = dists2.get(key(x, y));
        if (d !== undefined && (best === null || d.dist < best.dist)) best = { ...d, at: key(x, y) };
      }
    }
    if (best !== null && best.dist > 0) return { move: best.move, pause: false };
    // The lying patches gate the only road: fetch them instead of standing
    // still, and the road clears.
  }

  if (laid.length > 0 && held < CARRY_MAX) {
    const blockPatches = new Set(patchAt.keys());
    blockPatches.delete(key(player.x, player.y));
    const safeDists = search(player, (x, y) => cool(x, y) && !blockPatches.has(key(x, y)));
    const legalDists = search(player, (x, y) => legal(x, y) && !blockPatches.has(key(x, y)));
    const sameColor = held > 0 && state.carried.every((c) => c === state.carried[0]);
    const coolLys = laid.filter((p) => !hot.has(key(p.x, p.y)));
    const coolPicks = coolLys.length > 0 ? coolLys : laid;

    let pick = null;
    const bestOf = (dists, spots) => patchStep(dists, spots.map((p) => [p.x, p.y]));
    if (sameColor) {
      const inColor = coolPicks.filter((p) => p.color === state.carried[0]);
      const colourPick = inColor.length > 0 ? bestOf(safeDists, inColor) : null;
      const anyPick = bestOf(safeDists, coolPicks);
      pick = anyPick !== null && (colourPick === null || colourPick.dist > anyPick.dist + 4)
        ? anyPick
        : colourPick;
      if (pick === null) {
        const inColor2 = laid.filter((p) => p.color === state.carried[0]);
        pick = bestOf(legalDists, inColor2.length > 0 ? inColor2 : laid);
      }
    } else {
      pick = bestOf(safeDists, coolPicks);
    }
    if (pick === null) pick = bestOf(legalDists, coolPicks.length > 0 ? coolPicks : laid);
    if (pick !== null && pick.dist > 0) return { move: pick.move, pause: false };
  }

  // Idle hands, nothing to fetch: hover by a merge pad for the next
  // spawn. Worthless pads are behind the door; get close anyway.
  {
    const dists = search(player, cool);
    let best = null;
    for (const [x, y] of pads) {
      const d = dists.get(key(x, y));
      if (d !== undefined && (best === null || d.dist < best.dist)) best = { ...d, at: key(x, y) };
      if (best !== null && best.dist === 0) break;
    }
    if (best === null) {
      const dists2 = search(player, (x, y) => legal(x, y));
      for (const [x, y] of pads) {
        const d = dists2.get(key(x, y));
        if (d !== undefined && (best === null || d.dist < best.dist)) best = { ...d, at: key(x, y) };
      }
    }
    if (best !== null && best.dist > 0) return { move: best.move, pause: false };
  }
  return still;
}
