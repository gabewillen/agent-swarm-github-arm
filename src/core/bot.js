// The autopilot (DESIGN.md §9): pure, deterministic, and grid-aware.
//
// Each call plans over the terrain with breadth-first search and predicts
// the drifts' next positions by re-running the core's own movement rules
// — §6 steps 5, 10, and 11 are deterministic, no draw touches them — so a
// move is offered only when no drift can land on or swap over the player.
// Priorities: take the open exit, merge full hands, fetch the nearest
// patch on the way to a pad. It answers { move, pause: false } only.

import { DIRS, CLOCKWISE, CARRY_MAX, CONFLICT_TICKS } from './constants.js';

const NONE = { move: null, pause: false };
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

const key = (state, x, y) => y * state.level.width + x;

function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  return row === undefined || x < 0 || x >= row.length ? '#' : row[x];
}

// Passable to the player per §6 step 6: holds and the exit only when open.
function playerPassable(state, x, y) {
  const t = tileAt(state, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !state.open) return false;
  return true;
}

// Unrolls the drifts and conflicts one step ahead, exactly as §6 runs
// them: conflicts age every step (step 5); on a motion tick each drift, in
// array order, tries its direction then each next clockwise up to four,
// against walls, holds, the exit, and conflicts (step 10); then every cell
// in reading order holding two or more drifts reverses them and keeps one
// conflict (step 11). Drifts ignore the player and each other while moving.
function forecast(state) {
  const conflicts = state.conflicts
    .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);
  const drifts = state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  const motion = (state.tick + 1) % state.level.driftPeriod === 0;
  if (motion) {
    for (const d of drifts) {
      const at = CLOCKWISE.indexOf(d.dir);
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(at + k) % 4];
        const nx = d.x + DIRS[dir][0];
        const ny = d.y + DIRS[dir][1];
        const t = tileAt(state, nx, ny);
        if (t === '#' || t === 'H' || t === 'X') continue;
        if (conflicts.some((c) => c.x === nx && c.y === ny)) continue;
        d.dir = dir;
        d.x = nx;
        d.y = ny;
        break;
      }
    }
    const stacks = new Map();
    for (let i = 0; i < drifts.length; i++) {
      const k = key(state, drifts[i].x, drifts[i].y);
      const list = stacks.get(k);
      if (list) list.push(i);
      else stacks.set(k, [i]);
    }
    for (const k of [...stacks.keys()].sort((a, b) => a - b)) {
      const list = stacks.get(k);
      if (list.length < 2) continue;
      const x = drifts[list[0]].x;
      const y = drifts[list[0]].y;
      for (const i of list) drifts[i].dir = REVERSE[drifts[i].dir];
      if (!conflicts.some((c) => c.x === x && c.y === y)) {
        conflicts.push({ x, y, ttl: CONFLICT_TICKS });
      }
    }
  }
  return { drifts, conflicts, motion };
}

// True when the player could end a step on `post` starting from `pre`
// without being hit under §6 step 12 with the forecast drifts: a drift
// landing on the player's cell, or one that moved from the player's post
// cell onto where the player was (the swap).
function safe(state, fc, pre, post) {
  for (let i = 0; i < fc.drifts.length; i++) {
    const d = fc.drifts[i];
    if (d.x === post.x && d.y === post.y) return false;
    if (
      fc.motion && d.x === pre.x && d.y === pre.y &&
      state.drifts[i].x === post.x && state.drifts[i].y === post.y
    ) return false;
  }
  return true;
}

// Breadth-first distances from `source` over cells passable to the player,
// treating each cell key in `blocked` as impassable. Unreachable and
// blocked cells stay unset. The source is always seeded at 0.
function distances(state, source, blocked) {
  const dist = new Map();
  const work = [{ x: source.x, y: source.y, d: 0 }];
  dist.set(key(state, source.x, source.y), 0);
  for (let i = 0; i < work.length; i++) {
    const { x, y, d } = work[i];
    for (const name of CLOCKWISE) {
      const nx = x + DIRS[name][0];
      const ny = y + DIRS[name][1];
      const k = key(state, nx, ny);
      if (dist.has(k)) continue;
      if (!playerPassable(state, nx, ny) || blocked.has(k)) continue;
      dist.set(k, d + 1);
      work.push({ x: nx, y: ny, d: d + 1 });
    }
  }
  return dist;
}

function scanMap(state, ch) {
  const cells = [];
  for (let y = 0; y < state.level.tiles.length; y++) {
    const row = state.level.tiles[y];
    for (let x = 0; x < row.length; x++) if (row[x] === ch) cells.push({ x, y });
  }
  return cells;
}

// Sorts cells by BFS distance from the player, ties in reading order.
function byNearness(map, state, cells) {
  return cells
    .map((c) => ({ c, d: map.get(key(state, c.x, c.y)) }))
    .filter((o) => o.d !== undefined)
    .sort((a, b) => a.d - b.d || a.c.y - b.c.y || a.c.x - b.c.x);
}

export function botInput(state) {
  if (!state || state.status !== 'playing') return NONE;
  const player = { x: state.player.x, y: state.player.y };
  const fc = forecast(state);

  // Cells a drift is on or a conflict still covers: plan around them.
  const conflicts = new Set();
  for (const c of fc.conflicts) conflicts.add(key(state, c.x, c.y));
  const blocked = new Set(conflicts);
  for (const d of fc.drifts) blocked.add(key(state, d.x, d.y));

  // Choose the objective cell. Distances treat conflicts as walls and
  // drift ground as crossable — those patrols move on, and the gradient
  // below still refuses any step a drift could punish.
  let target = null;
  if (state.open) {
    target = scanMap(state, 'X')[0] ?? null;
  } else {
    const pads = scanMap(state, 'M');
    if (pads.length) {
      const fromHere = distances(state, player, conflicts);
      const padsNear = byNearness(fromHere, state, pads);
      if (!padsNear.length) return NONE;
      // Cost down a fetch: the leg to the patch plus the leg from the
      // patch to the nearest pad (one rooted walk measures every patch),
      // so picking patches spreads the walk instead of pinning one cell.
      const pad = padsNear[0].c;
      const toPad = distances(state, pad, conflicts);
      const patchOpts = state.patches
        .map((c) => ({
          c,
          d: fromHere.get(key(state, c.x, c.y)),
          leg: toPad.get(key(state, c.x, c.y)),
        }))
        .filter((o) => o.d !== undefined && o.leg !== undefined)
        .sort((a, b) =>
          (a.d + a.leg) - (b.d + b.leg) || a.c.y - b.c.y || a.c.x - b.c.x);
      const full = state.carried.length >= CARRY_MAX;
      if (full || patchOpts.length === 0) {
        target = pad;
      } else if (state.carried.length === 0) {
        target = patchOpts[0].c;
      } else {
        const cost = patchOpts[0].d + patchOpts[0].leg;
        target = cost <= padsNear[0].d + 3 + state.carried.length
          ? patchOpts[0].c
          : pad;
      }
    }
  }
  if (!target) return NONE;
  if (target.x === player.x && target.y === player.y) return NONE;

  // Route to the objective; when the drifts fence the path off entirely,
  // treat their ground as passable — they patrol away again.
  let plan = distances(state, target, blocked);
  if (!plan.has(key(state, player.x, player.y))) {
    plan = distances(state, target, conflicts);
  }
  const from = plan.get(key(state, player.x, player.y));
  if (from === undefined) return NONE;

  // Walk the gradient strictly closer, but when no closer step is safe a
  // dodge still beats standing in a patrol's lane: take the nearest safe
  // neighbor, so a drift can't wave back onto us while we wait.
  let best = null;
  let bestDist = from;
  let dodge = null;
  let dodgeDist = Infinity;
  for (const name of CLOCKWISE) {
    const c = { x: player.x + DIRS[name][0], y: player.y + DIRS[name][1] };
    const k = key(state, c.x, c.y);
    if (!playerPassable(state, c.x, c.y)) continue;
    if (conflicts.has(k)) continue;
    const d = plan.get(k);
    if (d === undefined) continue;
    if (!safe(state, fc, player, c)) continue;
    if (d < bestDist) {
      best = name;
      bestDist = d;
    }
    if (d < dodgeDist) {
      dodge = name;
      dodgeDist = d;
    }
  }
  if (best !== null) return { move: best, pause: false };
  if (dodge !== null) return { move: dodge, pause: false };
  return NONE;
}
