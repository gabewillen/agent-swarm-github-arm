// Quorum Run — the autopilot (DESIGN.md §9). botInput(state) returns the
// input { move, pause: false } the robot plays: pure and deterministic,
// reading only the state it is given. It finds its way on the grid with
// breadth-first searches, fetches patches, merges them on the pads, keeps
// clear of drifts, and takes the exit once the quorum is in.

import { CARRY_MAX, CLOCKWISE, DIRS } from './constants.js';

const STAY = { move: null, pause: false };
const STEP_ORDER = ['up', 'right', 'down', 'left'];

// Terrain, as the rules see it: '#' outside the map.
function tileFor(level, x, y) {
  if (y < 0 || y >= level.height) return '#';
  const row = level.tiles[y];
  if (row === undefined || x < 0 || x >= level.width || x >= row.length) return '#';
  return row[x];
}

// Passability to the player: not a wall, not a hold or the exit unless
// the level is open, and no conflict on it. Drifts are not terrain; the
// caller keeps clear of them with the danger checks.
function passableForPlayer(level, open, conflicts, x, y) {
  const t = tileFor(level, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !open) return false;
  return !conflicts.has(y * level.width + x);
}

// One breadth-first pass: distances from a source over the cells the
// player can stand on. Walls, closed doors, conflicts, and the cells
// drifts stand on now are walls of the robot's map. Returns a flat
// Int32Array, -1 where a cell is unreachable.
function bfsDistances(width, height, blocked, source) {
  const dist = new Int32Array(width * height).fill(-1);
  if (source < 0 || blocked[source]) return dist;
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  dist[source] = 0;
  queue[tail++] = source;
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const y = (i / width) | 0;
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = DIRS[STEP_ORDER[k]];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const j = ny * width + nx;
      if (blocked[j] || dist[j] !== -1) continue;
      dist[j] = dist[i] + 1;
      queue[tail++] = j;
    }
  }
  return dist;
}

// The conflicts one step on: ttl drops by one and the ones at 0 are gone
// — what this step's drifts (§6 steps 10 to 12) must not enter.
function agedConflicts(conflicts) {
  const out = [];
  for (const c of conflicts) {
    if (c.ttl > 1) out.push({ x: c.x, y: c.y, ttl: c.ttl - 1 });
  }
  return out;
}

// §6 step 10, one step ahead: where each drift ends this step. Exactly
// the game's rule — its own direction first, then clockwise, on to the
// first cell that is not a wall, hold, exit, or live conflict — over the
// conflicts still alive when the drifts move. A step without a drift
// move phase leaves every drift where it is.
function driftEnds(state, liveConflicts) {
  const level = state.level;
  if ((state.tick + 1) % level.driftPeriod !== 0) {
    return state.drifts.map((d) => ({ x: d.x, y: d.y }));
  }
  const blocked = new Uint8Array(level.width * level.height);
  for (const c of liveConflicts) {
    if (c.x >= 0 && c.x < level.width && c.y >= 0 && c.y < level.height) {
      blocked[c.y * level.width + c.x] = 1;
    }
  }
  return state.drifts.map((d) => {
    const at = CLOCKWISE.indexOf(d.dir);
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = DIRS[CLOCKWISE[(at + k) % 4]];
      if (dx === undefined || dy === undefined) continue;
      const x = d.x + dx;
      const y = d.y + dy;
      const t = tileFor(level, x, y);
      if (t === '#' || t === 'H' || t === 'X' || blocked[y * level.width + x]) continue;
      return { x, y, dir: CLOCKWISE[(at + k) % 4] };
    }
    return { x: d.x, y: d.y, dir: d.dir };
  });
}

// less by distance, then reading order.
function earlier(a, b) {
  if (a[0] !== b[0]) return a[0] < b[0];
  if (a[1] !== b[1]) return a[1] < b[1];
  return a[2] < b[2];
}

// Nearest cell of a list that the distances reach; ties break in reading
// order, so the choice is the same for the same state.
function nearest(cells, dist, width) {
  let best = null;
  let bestKey = null;
  for (const c of cells) {
    const d = dist[c.y * width + c.x];
    if (d < 0) continue;
    const key = [d, c.y, c.x];
    if (bestKey === null || earlier(key, bestKey)) {
      best = c;
      bestKey = key;
    }
  }
  return best;
}

// Everything the decision needs, read out of the state once.
function scan(state) {
  const level = state.level;
  const width = level.width;
  const height = level.height;
  const open = !!state.open;

  const conflicts = new Set();
  for (const c of state.conflicts || []) {
    if (c.x >= 0 && c.x < width && c.y >= 0 && c.y < height) conflicts.add(c.y * width + c.x);
  }

  const blocked = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = tileFor(level, x, y);
      if (t === '#' || ((t === 'H' || t === 'X') && !open)) blocked[y * width + x] = 1;
      else if (conflicts.has(y * width + x)) blocked[y * width + x] = 1;
    }
  }
  const now = [];
  for (const d of state.drifts || []) {
    if (d.x >= 0 && d.x < width && d.y >= 0 && d.y < height) {
      blocked[d.y * width + d.x] = 1;
      now.push({ x: d.x, y: d.y });
    } else now.push({ x: d.x, y: d.y });
  }

  const me = state.player;
  const fromPlayer =
    me.x >= 0 && me.x < width && me.y >= 0 && me.y < height
      ? bfsDistances(width, height, blocked, me.y * width + me.x)
      : new Int32Array(width * height).fill(-1);

  const ends = driftEnds(state, agedConflicts(state.conflicts || []));

  const pads = [];
  const exits = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = tileFor(level, x, y);
      if (t === 'M') pads.push({ x, y });
      else if (t === 'X') exits.push({ x, y });
    }
  }

  return { width, height, conflicts, blocked, now, ends, fromPlayer, pads, exits };
}

// A step is lethal when a drift ends on the target cell, when it is a
// drift's cell the drift holds this step (walking into a standing
// drift), or when it is a drift's cell while the drift ends on ours —
// the swap hit of §6 step 12. Landing on a cell a drift is leaving is no
// hit, and the game's own movement rules do the rest.
function lethal(env, x, y) {
  const me = env.me;
  const idx = y * env.width + x;
  for (let i = 0; i < env.ends.length; i++) {
    const to = env.ends[i];
    const from = env.now[i];
    if (to.x === x && to.y === y) return true;
    if (from.x === x && from.y === y && (to.x === from.x && to.y === from.y)) return true;
    if (from.x === x && from.y === y && to.x === me.x && to.y === me.y) return true;
  }
  void idx;
  return false;
}

// The plan: what the robot heads for, or null when nothing needs it.
//
//   open                     -> the exit
//   full hands               -> the nearest pad
//   carried can finish it    -> the nearest pad (merging what is
//                               carried reaches the quorum)
//   a patch within reach     -> the nearest patch
//   carrying something       -> the nearest pad
//   nothing to take          -> guard a cell beside a pad until a
//                               patch spawns
function plan(state, env) {
  const width = env.width;
  const dist = env.fromPlayer;
  const me = state.player;
  const carried = Array.isArray(state.carried) ? state.carried.length : 0;
  const remaining = Math.max(0, (state.level.quorum ?? 1) - (state.merges ?? 0));

  if (state.open) {
    const exit = nearest(env.exits, dist, width);
    if (exit) return { x: exit.x, y: exit.y, kind: 'exit' };
  }

  const pads = env.pads.filter((p) => dist[p.y * width + p.x] >= 0);
  const pad = nearest(pads, dist, width);

  const patches = (state.patches || [])
    .filter((p) => p && Number.isInteger(p.x) && Number.isInteger(p.y))
    .filter((p) => carried < CARRY_MAX || !(p.x === me.x && p.y === me.y))
    .filter((p) => dist[p.y * width + p.x] >= 0)
    .map((p) => ({ x: p.x, y: p.y }));
  const patch = nearest(patches, dist, width);

  if (pad && carried >= CARRY_MAX) return { x: pad.x, y: pad.y, kind: 'pad' };
  if (pad && carried > 0 && carried >= remaining) return { x: pad.x, y: pad.y, kind: 'pad' };
  if (patch) return { x: patch.x, y: patch.y, kind: 'patch' };
  if (pad && carried > 0) return { x: pad.x, y: pad.y, kind: 'pad' };

  // Empty-handed with nothing to fetch: hold a cell beside the nearest
  // pad, where the next merge happens, and let patches come.
  if (pad && remaining > 0) {
    if (!(pad.x === me.x && pad.y === me.y)) return { x: pad.x, y: pad.y, kind: 'pad' };
    const guards = [];
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = DIRS[STEP_ORDER[k]];
      const x = pad.x + dx;
      const y = pad.y + dy;
      if (dist[y * width + x] < 0) continue;
      const t = tileFor(state.level, x, y);
      if (t === '#' || (t === 'H' || t === 'X') && !state.open) continue;
      guards.push({ x, y });
    }
    const guard = nearest(guards, dist, width);
    if (guard) return { x: guard.x, y: guard.y, kind: 'guard' };
  }

  return null;
}

// The step to take: among safe neighbours, the one the plan likes best;
// with no plan, hold still when holding is safe, else dodge; with no
// safe dodge, stay and take the hit that is coming anyway.
function stepFor(state, env, target, neighbours) {
  const me = state.player;
  const meIdx = me.y * env.width + me.x;

  if (target) {
    if (target.kind === 'guard' && target.x === me.x && target.y === me.y) return STAY;
    const to = bfsDistances(env.width, env.height, env.blocked, target.y * env.width + target.x);
    if (to[meIdx] > 0) {
      let best = null;
      let bestKey = null;
      for (const n of neighbours) {
        const t = to[n.idx];
        if (t < 0 || lethal(env, n.x, n.y)) continue;
        const key = [t, n.order];
        if (bestKey === null || earlier(key, bestKey)) {
          best = n;
          bestKey = key;
        }
      }
      if (best) return { move: best.move, pause: false };
    }
  }

  if (!lethal(env, me.x, me.y)) return STAY;
  const dodge = neighbours.find((n) => !lethal(env, n.x, n.y));
  if (dodge) return { move: dodge.move, pause: false };
  return neighbours.length > 0 ? { move: neighbours[0].move, pause: false } : STAY;
}

// §9: the input the robot plays for a state. Valid, pure, and
// deterministic: the same state always gives the same input.
export function botInput(state) {
  if (!state || !state.level || !Array.isArray(state.level.tiles)) return STAY;
  if (state.status !== 'playing' || state.paused) return STAY;
  const level = state.level;
  const me = state.player;
  if (
    !me ||
    !Number.isInteger(me.x) ||
    !Number.isInteger(me.y) ||
    me.x < 0 ||
    me.x >= level.width ||
    me.y < 0 ||
    me.y >= level.height
  ) {
    return STAY;
  }

  const env = scan(state);
  env.me = me;

  const neighbours = [];
  for (let k = 0; k < 4; k++) {
    const dir = STEP_ORDER[k];
    const [dx, dy] = DIRS[dir];
    const x = me.x + dx;
    const y = me.y + dy;
    if (!passableForPlayer(level, state.open, env.conflicts, x, y)) continue;
    neighbours.push({ move: dir, x, y, order: k, idx: y * level.width + x });
  }
  if (neighbours.length === 0 && lethal(env, me.x, me.y)) return STAY;

  const target = plan(state, env);
  return stepFor(state, env, target, neighbours);
}
