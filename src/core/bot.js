// Quorum Run §9 — the bot: a pure, deterministic autopilot.
//
// `botInput(state)` reads one game state (§5) and returns the input
// `{ move, pause: false }` to play next. It plans with breadth-first
// search over the level grid: fetch patches, carry them to a merge pad,
// avoid drifts and conflicts, and take the exit once the quorum is met.
//
// Self-contained on purpose: it imports nothing, so it only ever reads
// the state it is given and never mutates it.

const MOVE_ORDER = ['up', 'right', 'down', 'left'];
const DIR_VECTOR = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const CARRY_MAX = 3;

function cellKey(x, y) {
  return x + ',' + y;
}

function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

// Passable terrain to the player: never a wall; holds and the exit only
// when open (§6 step 6).
function passable(state, x, y) {
  const t = tileAt(state, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !state.open) return false;
  return true;
}

// Breadth-first search from `from` over cells not in `blocked` and not
// impassable. Returns:
//   a move string — the first step toward the nearest target;
//   null          — the player already stands on a target (or no targets);
//   undefined     — no target reachable under `blocked`.
function stepToward(state, from, targets, blocked) {
  if (targets.length === 0) return null;
  const targetSet = new Set(targets.map((t) => cellKey(t[0], t[1])));
  const start = cellKey(from.x, from.y);
  if (targetSet.has(start)) return null;
  const height = state.level.tiles.length;
  const width = state.level.tiles.reduce((m, r) => Math.max(m, r.length), 0);
  const came = new Map([[start, null]]);
  const queue = [[from.x, from.y]];
  let head = 0;
  let found = null;
  while (head < queue.length && found === null) {
    const [cx, cy] = queue[head++];
    for (const dir of MOVE_ORDER) {
      const nx = cx + DIR_VECTOR[dir][0];
      const ny = cy + DIR_VECTOR[dir][1];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nk = cellKey(nx, ny);
      if (came.has(nk) || blocked.has(nk)) continue;
      if (!passable(state, nx, ny)) continue;
      came.set(nk, cellKey(cx, cy));
      if (targetSet.has(nk)) {
        found = nk;
        break;
      }
      queue.push([nx, ny]);
    }
  }
  if (found === null) return undefined;
  let cur = found;
  while (came.get(cur) !== start) cur = came.get(cur);
  const [cx, cy] = cur.split(',').map(Number);
  for (const dir of MOVE_ORDER) {
    if (from.x + DIR_VECTOR[dir][0] === cx && from.y + DIR_VECTOR[dir][1] === cy) return dir;
  }
  return null;
}

// tries each blocking regime in turn: a move, or null to wait at the
// target, or undefined when the goal is unreachable in all of them.
function towardGoal(state, targets, passes) {
  for (const blocked of passes) {
    const step = stepToward(state, state.player, targets, blocked);
    if (step !== undefined) return step;
  }
  return undefined;
}

function goalsOfChar(state, ch) {
  const out = [];
  const tiles = state.level.tiles;
  for (let y = 0; y < tiles.length; y++) {
    const row = tiles[y];
    for (let x = 0; x < row.length; x++) if (row[x] === ch) out.push([x, y]);
  }
  return out;
}

// True when a drift stands on the player's cell or next to it.
function driftNear(state) {
  const p = state.player;
  return state.drifts.some(
    (d) => Math.abs(d.x - p.x) + Math.abs(d.y - p.y) <= 1
  );
}

// While idling, step to a neighbouring cell no drift sits on or beside;
// prefer a direction that actually gains distance from every drift.
function escape(state, blocked) {
  const p = state.player;
  let fallback = null;
  for (const dir of MOVE_ORDER) {
    const nx = p.x + DIR_VECTOR[dir][0];
    const ny = p.y + DIR_VECTOR[dir][1];
    if (!passable(state, nx, ny) || blocked.has(cellKey(nx, ny))) continue;
    const worst = state.drifts.reduce(
      (m, d) => Math.min(m, Math.abs(d.x - nx) + Math.abs(d.y - ny)),
      99
    );
    if (worst >= 2) return dir;
    if (fallback === null) fallback = dir;
  }
  return fallback;
}

export function botInput(state) {
  if (!state || state.status !== 'playing' || state.paused) {
    return { move: null, pause: false };
  }
  const p = state.player;
  const conflicts = new Set(state.conflicts.map((c) => cellKey(c.x, c.y)));
  const driftCells = new Set();
  const nearDrifts = new Set();
  for (const d of state.drifts) {
    driftCells.add(cellKey(d.x, d.y));
    for (const dir of MOVE_ORDER) {
      nearDrifts.add(cellKey(d.x + DIR_VECTOR[dir][0], d.y + DIR_VECTOR[dir][1]));
    }
  }
  // While invulnerable, hits cannot happen: ignore drifts entirely.
  const safe = state.invuln > 0;
  const wary = safe
    ? new Set(conflicts)
    : new Set([...conflicts, ...driftCells, ...nearDrifts]);
  const waryCells = safe ? new Set(conflicts) : new Set([...conflicts, ...driftCells]);
  const passes = [wary, waryCells, conflicts];

  const carried = state.carried.length;
  const full = carried >= CARRY_MAX;
  const toMerge = full || (carried > 0 && carried >= state.level.quorum - state.merges);
  const patches = state.patches.map((q) => [q.x, q.y]);

  let choice;
  if (state.open) {
    choice = towardGoal(state, goalsOfChar(state, 'X'), passes);
  } else if (toMerge) {
    choice = towardGoal(state, goalsOfChar(state, 'M'), passes);
    if (choice === undefined && !full) choice = towardGoal(state, patches, passes);
  } else {
    choice = towardGoal(state, patches, passes);
    if (choice === undefined && carried > 0) {
      choice = towardGoal(state, goalsOfChar(state, 'M'), passes);
    }
  }

  // Nothing to do (waiting for a spawn, a conflict, an opening): if a
  // drift is adjacent, step aside; otherwise hold the cell.
  if (choice === undefined || choice === null) {
    if (!safe && driftNear(state)) {
      const dir = escape(state, wary);
      if (dir !== null) choice = dir;
    }
  }
  return { move: choice === undefined ? null : choice, pause: false };
}
