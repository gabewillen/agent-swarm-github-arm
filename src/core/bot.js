// The autopilot (DESIGN.md §9): one pure function of the state that picks
// the next input. Pure and deterministic: same state in, same input out,
// no DOM, and randomness plays no part.

import { DIRS, CLOCKWISE, CARRY_MAX } from './constants.js';

// A move longhand the game accepts; CLOCKWISE order keeps every tie-break
// deterministic.
const ORDER = [CLOCKWISE[0], CLOCKWISE[1], CLOCKWISE[2], CLOCKWISE[3]];

const NONE = { move: null, pause: false };

function makeInput(move) {
  if (!move) return NONE;
  return { move, pause: false };
}

// Whether the player's body can enter (x, y): floors and pads yes, holds
// and the exit only once the level is open, walls never.
function reachable(state, x, y) {
  const t = state.level.tiles[y];
  if (t === undefined) return false;
  const c = t[x];
  if (c === undefined || c === '#') return false;
  if ((c === 'H' || c === 'X') && !state.open) return false;
  return true;
}

// Breadth-first step map from the player: distances and the direction of
// the first step on the shortest route. Congested cells (conflicts and
// drifts both) are not enterable, so routes never plan through them.
function fieldMap(state) {
  const rows = state.level.tiles;
  const width = rows[0] === undefined ? 0 : rows[0].length;
  const height = rows.length;
  const blocker = (x, y) => {
    if (state.conflicts.some((c) => c.x === x && c.y === y)) return true;
    return state.drifts.some((d) => d.x === x && d.y === y);
  };
  const dist = [];
  const first = [];
  for (let y = 0; y < height; y++) {
    dist.push(new Array(width).fill(-1));
    first.push(new Array(width).fill(null));
  }
  dist[state.player.y][state.player.x] = 0;
  const queue = [[state.player.x, state.player.y]];
  for (let head = 0; head < queue.length; head++) {
    const [cx, cy] = queue[head];
    const here = dist[cy][cx];
    for (const dir of ORDER) {
      const [dx, dy] = DIRS[dir];
      const x = cx + dx;
      const y = cy + dy;
      if (!reachable(state, x, y) || dist[y][x] !== -1 || blocker(x, y)) continue;
      dist[y][x] = here + 1;
      first[y][x] = cy === state.player.y && cx === state.player.x ? dir : first[cy][cx];
      queue.push([x, y]);
    }
  }
  return { dist, first, width, height };
}

// The nearest goal cell of one kind (and every pad, for the lookahead),
// by distance, tie-broken in reading order.
function pickGoal(state, field, cells) {
  let best = null;
  for (const cell of cells) {
    const d = field.dist[cell.y] === undefined ? -1 : field.dist[cell.y][cell.x];
    if (d === undefined || d < 0) continue;
    if (best === null || d < best.d) best = { x: cell.x, y: cell.y, d };
  }
  return best;
}

// Drifts move on their own clock: when drifts move this generated step,
// each one lands on a computable cell (the same clockwise search the rules
// use). One cell out of four attempts means the leftmost-first order.
function driftLanding(state, d) {
  const from = CLOCKWISE.indexOf(d.dir);
  for (let i = 0; i < 4; i++) {
    const dir = CLOCKWISE[(from + i) % 4];
    const [dx, dy] = DIRS[dir];
    const x = d.x + dx;
    const y = d.y + dy;
    const row = state.level.tiles[y];
    if (row === undefined) continue;
    const t = row[x];
    if (t === undefined || t === '#' || t === 'H' || t === 'X') continue;
    if (state.conflicts.some((c) => c.x === x && c.y === y)) continue;
    return { x, y };
  }
  return null;
}

// Whether the move would end this tick sharing a cell with a drift: the
// drift is already there, or lands there, or — never — swaps with the
// player (entering a drift's cell is covered by the first case).
function unsafeStep(state, x, y, moves) {
  if (state.drifts.some((d) => d.x === x && d.y === y)) return true;
  if (moves && state.drifts.some((d) => {
    const land = driftLanding(state, d);
    return land !== null && land.x === x && land.y === y;
  })) return true;
  return false;
}

// The direction to take toward a goal, or null to stand.
function stepToward(state, field, goal) {
  const dir = goal === null ? null : field.first[goal.y][goal.x];
  if (dir !== null) {
    const [dx, dy] = DIRS[dir];
    if (!unsafeStep(state, state.player.x + dx, state.player.y + dy, mayMove(state))) {
      return dir;
    }
  }
  // The shortest route's first step is unsafe or there is no goal: any
  // step that brings the distance down, then any step at all, each safe.
  const moves = mayMove(state);
  let fallback = null;
  let fallbackDist = Infinity;
  for (const cand of ORDER) {
    const [dx, dy] = DIRS[cand];
    const x = state.player.x + dx;
    const y = state.player.y + dy;
    if (!reachable(state, x, y) || unsafeStep(state, x, y, moves)) continue;
    const d = field.dist[y][x];
    const dd = d === -1 ? Infinity : d;
    if (dd < fallbackDist) {
      fallbackDist = dd;
      fallback = cand;
    }
  }
  if (fallback !== null && fallbackDist < (goal === null ? Infinity : field.dist[goal.y][goal.x])) {
    return fallback;
  }
  if (fallback !== null && goal === null) return fallback;
  if (fallback !== null) return fallback;
  return null;
}

// Whether drifts land on new cells this coming step.
function mayMove(state) {
  return (state.tick + 1) % state.level.driftPeriod === 0;
}

// §9 policy: an open exit wins; full hands head to the pad; hands with a
// patch weigh pad against patch by distance (merging early beats hoarding
// when the pad is nearer, which keeps quorum moving); empty hands fetch
// patches, and when none can be reached, stand on the pad or idle until a
// spawn.
export function botInput(state) {
  if (state.status !== 'playing') return NONE;
  const field = fieldMap(state);
  const pads = [];
  const spawns = [];
  const rows = state.level.tiles;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'M') pads.push({ x, y });
      if (row[x] === 'X') spawns.push({ x, y });
    }
  }
  let goal = null;
  if (state.open) {
    goal = pickGoal(state, field, spawns);
  } else if (state.carried.length >= CARRY_MAX) {
    goal = pickGoal(state, field, pads);
  } else {
    const patchGoal = pickGoal(state, field, state.patches.map((p) => ({ x: p.x, y: p.y })));
    const padGoal = pickGoal(state, field, pads);
    if (state.carried.length > 0) {
      if (padGoal === null) goal = patchGoal;
      else if (patchGoal === null || padGoal.d <= patchGoal.d) goal = padGoal;
      else goal = patchGoal;
    } else {
      goal = patchGoal === null ? padGoal : patchGoal;
    }
  }
  if (goal === null) return NONE;
  return makeInput(stepToward(state, field, goal));
}
