// DESIGN.md §9: the bot. `botInput(state)` returns `{ move, pause: false }`
// for the state, pure and deterministic. It plays well: it fetches patches,
// merges them (a bigger hand is worth more), avoids drifts, and takes the
// exit once it is open.
//
// Every call plans from scratch over the state it is given: breadth-first
// distance fields give the shortest walk to each kind of goal, a priority
// ladder picks the goal, and the move is the neighbour that walks down that
// goal's field without walking into a drift — §6's hit conditions are
// predicted exactly, pinch-cells whose every exit could be hit are
// avoided, and when the grid offers no safe step the bot holds still.

import { CARRY_MAX, INVULN_TICKS, DIRS, CLOCKWISE } from './constants.js';

// --- cells ------------------------------------------------------------------

// §5's tileAt: the level's terrain at a cell, '#' outside the map.
function tileAt(level, x, y) {
  const row = level.tiles[y];
  return row === undefined || x < 0 || x >= row.length ? '#' : row[x];
}

// Whether a conflict lies on the cell (§6 step 5's survivors).
function conflictAt(conflicts, x, y) {
  for (let i = 0; i < conflicts.length; i++) {
    if (conflicts[i].x === x && conflicts[i].y === y) return true;
  }
  return false;
}

// §6 step 6: cells passable to the player — not a wall, not a hold or the
// exit unless open, and no conflict on them.
function passablePlayer(state, x, y) {
  const t = tileAt(state.level, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !state.open) return false;
  return !conflictAt(state.conflicts, x, y);
}

// §6 step 10: cells passable to a drift — never a wall, hold, exit, or cell
// with a conflict on it.
function passableDrift(state, x, y) {
  const t = tileAt(state.level, x, y);
  return t !== '#' && t !== 'H' && t !== 'X' && !conflictAt(state.conflicts, x, y);
}

// --- drift prediction -------------------------------------------------------

// §6 step 10: where the drift ends up after this step. Drifts move when the
// step's tick is a multiple of driftPeriod (the step's tick is the state's
// plus one); each tries its own direction first, then each next direction
// clockwise, and turns to the direction it moves in. Drifts ignore the
// player, patches, and each other; with nowhere to go it stays.
function driftAfter(state, drift, step) {
  const tick = state.tick + (step === undefined ? 1 : step);
  if (tick % state.level.driftPeriod !== 0) {
    return { x: drift.x, y: drift.y, dir: drift.dir };
  }
  const at = CLOCKWISE.indexOf(drift.dir);
  for (let k = 0; k < CLOCKWISE.length; k++) {
    const dir = CLOCKWISE[(at + k) % CLOCKWISE.length];
    const x = drift.x + DIRS[dir][0];
    const y = drift.y + DIRS[dir][1];
    if (passableDrift(state, x, y)) return { x, y, dir };
  }
  return { x: drift.x, y: drift.y, dir: drift.dir };
}

// A drifting rocker makes a wall of itself: a drift wedged so that it can
// only ever hop between its cell and the next — each stop's turning is
// blocked — bounces between the two cells forever, and a player that steps
// onto either one meets its return trip. The distance fields treat such
// pairs as walls. The forecast walks the drift's next two hops (however far
// apart they fall in the step cadence, so the verdict holds on any tick);
// if the second hop lands the drift back on its own cell, the pair is
// sealed.
function sealedBy(state) {
  const sealed = new Uint8Array(state.level.width * state.level.height);
  const w = state.level.width;
  const period = state.level.driftPeriod;
  for (let i = 0; i < state.drifts.length; i++) {
    const drift = state.drifts[i];
    // First step in the cadence where this drift moves.
    let s = 1;
    for (; s <= period; s++) {
      if ((state.tick + s) % period === 0) break;
    }
    if (s > period) continue;
    const one = driftAfter(state, drift, s);
    if (one.x === drift.x && one.y === drift.y) continue; // boxed in entirely
    // One full period later it moves again; back home means a sealed pair.
    const back = driftAfter(state, one, s + period);
    if (back.x === drift.x && back.y === drift.y) {
      sealed[drift.y * w + drift.x] = 1;
      sealed[one.y * w + one.x] = 1;
    }
  }
  return sealed;
}

// §6 step 12: the drift rules turn a step from `from` in `dir` into a hit
// when a drift is on the player's cell after the step's movement, or when a
// drift swapped cells with the player (it was where the player steps to,
// and is now where the player was).
function hitOnMove(state, from, dir) {
  const to = { x: from.x + DIRS[dir][0], y: from.y + DIRS[dir][1] };
  for (let i = 0; i < state.drifts.length; i++) {
    const drift = state.drifts[i];
    const post = driftAfter(state, drift);
    if (post.x === to.x && post.y === to.y) return true;
    if (post.x === from.x && post.y === from.y &&
        drift.x === to.x && drift.y === to.y) return true;
  }
  return false;
}

// Unsafe to the player right now: while invulnerable nothing hits (§6 step
// 12 drops the immunity by one instead).
function unsafeMove(state, dir) {
  return state.invuln === 0 && hitOnMove(state, state.player, dir);
}

// --- path finding -----------------------------------------------------------

// A distance field over the player-passable cells: sources are the goal
// cells, and the value at a cell is the number of steps in the shortest
// walk from the field's nearest source. Walking down the field walks the
// shortest route to the goal. Unreachable cells hold -1.
function field(state, sources, calm) {
  const w = state.level.width;
  const h = state.level.height;
  const sealed = calm ? null : sealedBy(state);
  const dist = new Int16Array(w * h).fill(-1);
  const queue = [];
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    if (s.x < 0 || s.y < 0 || s.x >= w || s.y >= h) continue;
    const j = s.y * w + s.x;
    if (sealed && sealed[j]) continue; // a wall of a drift is not a goal
    if (dist[j] !== -1) continue;
    dist[j] = 0;
    queue.push(j);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const j = queue[qi];
    const d = dist[j] + 1;
    const x = j % w;
    const y = (j - x) / w;
    for (let k = 0; k < CLOCKWISE.length; k++) {
      const dir = CLOCKWISE[k];
      const nx = x + DIRS[dir][0];
      const ny = y + DIRS[dir][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (dist[n] !== -1) continue;
      if (sealed && sealed[n]) continue; // walk around a rocking drift
      if (!passablePlayer(state, nx, ny)) continue;
      dist[n] = d;
      queue.push(n);
    }
  }
  return dist;
}

// The merge pads, the exit, and other terrain of one kind, in reading order.
function scan(level, ch) {
  const cells = [];
  for (let y = 0; y < level.tiles.length; y++) {
    const row = level.tiles[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === ch) cells.push({ x, y });
    }
  }
  return cells;
}

function blockedBy(cells, x, y) {
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].x === x && cells[i].y === y) return true;
  }
  return false;
}

// A pinch: a cell the player could step to but that has no safe way out
// under the drifts as they are now. Stepping into one risks getting pinned.
function isPinch(state, x, y) {
  if (state.invuln > 0) return false;
  for (let k = 0; k < CLOCKWISE.length; k++) {
    const dir = CLOCKWISE[k];
    const nx = x + DIRS[dir][0];
    const ny = y + DIRS[dir][1];
    if (!passablePlayer(state, nx, ny)) continue;
    if (!hitOnMove(state, { x, y }, dir)) return false;
  }
  return true;
}

// --- the goal ---------------------------------------------------------------

// The bot's goal: the field to walk down, and cells to never land on. The
// priority ladder, top first:
//   - the exit is open: ship it — but a pad closer than the exit first
//     merges the hands, which are worth more banked than abandoned;
//   - full hands are worth a merge (`PATCH_BASE * n * n` grows with n);
//   - the next merge would land the quorum: merge what is carried now;
//   - a pad closer than the next patch merges with no detour;
//   - fetch the nearest reachable patch — with two or more held, only a
//     patch within a short step is worth the detour;
//   - nothing left to fetch: bank whatever is carried;
//   - carried patches and no way to bank or fetch: back off to the passable
//     cell the drifts are farthest from;
//   - empty-handed with no patch in reach: wait for a spawn — beside a
//     spawn point, never on one (standing on it keeps a patch there from
//     spawning);
//   - the exit is open but walled in by a rocking drift (or every route
//     runs through a sealed cell): if the exit is only a few steps away
//     through the sweeps, break through — the hit buys an invulnerable dash
//     along the rest of the way.
function goalOf(state) {
  const w = state.level.width;
  const at = state.player.y * w + state.player.x;
  const toPads = field(state, scan(state.level, 'M'));
  const toPatches = field(state, state.patches);
  const toExit = field(state, scan(state.level, 'X'));
  const toSpawns = field(state, state.level.spawns);
  const carried = state.carried.length;
  const pads = toPads[at];
  const patches = toPatches[at];
  const exit = toExit[at];
  const spawn = toSpawns[at];

  if (state.open) {
    if (carried > 0 && pads >= 0 && (exit < 0 || pads < exit)) {
      return { field: toPads };
    }
    if (exit >= 0) return { field: toExit };
  }
  // A blocked or wall-track exit is worth a hit: the invuln that follows
  // the hit lets the bot walk the rest of the way, and open beats any pile
  // of banked merges. The calm field (seals and drift cells ignored) gives
  // the breathless route; a couple of steps over the invuln budget are
  // paid for by the growl hitting the sweep once more.
  if (state.open && exit < 0) {
    const through = field(state, scan(state.level, 'X'), true);
    const dash = through[at];
    if (dash >= 0 && dash <= INVULN_TICKS + 4) return { field: through, dash: true };
  }
  if (state.open && exit > INVULN_TICKS + 4) {
    // The safe route exists but sprawls because Drifts shadow it; if the
    // same route is short once the sweeps are ignored, break through.
    const through = field(state, scan(state.level, 'X'), true);
    const dash = through[at];
    if (dash >= 0 && dash <= INVULN_TICKS + 4 && dash < exit - 2) {
      return { field: through, dash: true };
    }
  }
  if (carried >= CARRY_MAX && pads >= 0) return { field: toPads };
  if (carried > 0 && state.merges + carried >= state.level.quorum && pads >= 0) {
    return { field: toPads };
  }
  if (carried > 0 && patches >= 0 && pads >= 0 && pads < patches) {
    return { field: toPads };
  }
  // No pad reachable along safe cells — but if one lies a few steps through
  // the sweeps, the hits buy an invulnerable walk that banks the carries.
  if (carried > 0 && pads < 0) {
    const through = field(state, scan(state.level, 'M'), true);
    const dash = through[at];
    if (dash >= 0 && dash <= INVULN_TICKS) return { field: through, dash: true };
  }
  if (patches >= 0 && carried < CARRY_MAX && (carried < 2 || patches <= 2)) {
    return { field: toPatches };
  }
  if (carried > 0 && pads >= 0) return { field: toPads };
  if (carried > 0) {
    // Blocked from every pad and patch: fall back to the safest reach.
    const own = field(state, [state.player]);
    let bench = null;
    for (let y = 0; y < state.level.height; y++) {
      for (let x = 0; x < state.level.width; x++) {
        const d = own[y * state.level.width + x];
        if (d === -1) continue;
        let clear = Infinity;
        for (let i = 0; i < state.drifts.length; i++) {
          const drift = state.drifts[i];
          const man = Math.abs(drift.x - x) + Math.abs(drift.y - y);
          if (man < clear) clear = man;
        }
        if (state.drifts.length === 0) clear = 1;
        const better = bench === null || clear > bench.clear ||
          (clear === bench.clear && d < bench.d);
        if (better) bench = { x, y, clear, d };
      }
    }
    if (bench) return { field: field(state, [bench]) };
  }
  if (spawn >= 0) {
    if (spawn === 1) return null; // already beside a spawn point: hold
    return { field: toSpawns, not: state.level.spawns };
  }
  return null;
}

// --- the move ---------------------------------------------------------------

// The move for the goal: the safe neighbour with the smallest field value
// (CLOCKWISE order breaks ties), where safe means the drift rules of §6 do
// not turn the step into a hit and the cell is not a pinch. Safe non-pinches
// come first; a safe pinch only when nothing better exists. With no safe
// move, hold still.
function stepToward(state, goal) {
  const p = state.player;
  let best = null;
  let fallback = null;
  for (let k = 0; k < CLOCKWISE.length; k++) {
    const dir = CLOCKWISE[k];
    const x = p.x + DIRS[dir][0];
    const y = p.y + DIRS[dir][1];
    if (!passablePlayer(state, x, y)) continue;
    if (goal.not && blockedBy(goal.not, x, y)) continue;
    if (goal.dash) {
      // Breakthrough: hits are the plan; conflicts still cork the walk.
      const f = goal.field[y * state.level.width + x];
      if (f === -1) continue;
      if (best === null || f < best.f) best = { dir, f };
      continue;
    }
    if (unsafeMove(state, dir)) continue;
    const f = goal.field[y * state.level.width + x];
    if (f === -1) continue;
    if (!isPinch(state, x, y)) {
      if (best === null || f < best.f) best = { dir, f };
    } else if (fallback === null || f < fallback.f) {
      fallback = { dir, f };
    }
  }
  return best ? best.dir : fallback ? fallback.dir : null;
}

// §9: an input for the state; `null` moves hold still.
export function botInput(state) {
  if (!state || state.status !== 'playing' || state.paused) {
    return { move: null, pause: false };
  }
  const goal = goalOf(state);
  return { move: goal ? stepToward(state, goal) : null, pause: false };
}
