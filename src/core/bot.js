// Quorum Run: the autopilot bot (DESIGN.md §9).
// botInput(state) returns { move, pause: false } for the state, pure and
// deterministic. It plays well: it fetches patches, takes full hands to a
// merge pad, dodges drifts, and takes the open exit once it is open.
// Self-contained: it reads only the state's public fields and imports
// nothing, so it runs whatever the rest of the swarm has landed.

const CLOCKWISE = ['up', 'right', 'down', 'left'];
const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const CARRY_MAX = 3;

const keyOf = (x, y) => `${x},${y}`;

// Terrain and passability -------------------------------------------------

function tileOf(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

// Passable to the player: not a wall, not a hold or the exit unless open,
// and no standing conflict on it. A conflict one tick from expiring counts
// as gone already, because it ages away before anything can move.
function playerPassable(level, open, standing, x, y) {
  const ch = tileOf(level, x, y);
  if (ch === '#') return false;
  if ((ch === 'H' || ch === 'X') && !open) return false;
  return !standing.has(keyOf(x, y));
}

// Passable to a drift: never a wall, hold, exit, or conflict (§6 step 10).
function driftPassable(level, standing, x, y) {
  const ch = tileOf(level, x, y);
  if (ch === '#' || ch === 'H' || ch === 'X') return false;
  return !standing.has(keyOf(x, y));
}

// Breadth-first distances from `from` over cells passable to the player,
// treating the keys in `blocked` as walls. Fresh Map, nothing shared.
function bfs(level, open, standing, blocked, from) {
  const dist = new Map();
  dist.set(keyOf(from.x, from.y), 0);
  const queue = [{ x: from.x, y: from.y }];
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i];
    const d = dist.get(keyOf(x, y)) + 1;
    for (const dir of CLOCKWISE) {
      const [dx, dy] = DIRS[dir];
      const nx = x + dx;
      const ny = y + dy;
      const nk = keyOf(nx, ny);
      if (dist.has(nk) || blocked.has(nk)) continue;
      if (!playerPassable(level, open, standing, nx, ny)) continue;
      dist.set(nk, d);
      queue.push({ x: nx, y: ny });
    }
  }
  return dist;
}

// Drift prediction --------------------------------------------------------

// Where a drift stands after its next move, following §6 step 10 exactly:
// its own direction first, then clockwise, over cells passable to a drift.
// Returns a fresh object; the state's drift is untouched.
function predictDrift(d, level, standing) {
  const at = CLOCKWISE.indexOf(d.dir);
  const from = at === -1 ? 0 : at;
  for (let k = 0; k < 4; k++) {
    const dir = CLOCKWISE[(from + k) % 4];
    const [dx, dy] = DIRS[dir];
    const tx = d.x + dx;
    const ty = d.y + dy;
    if (driftPassable(level, standing, tx, ty)) {
      return { x: tx, y: ty, moved: true };
    }
  }
  return { x: d.x, y: d.y, moved: false };
}

// Everything the decision needs, read once --------------------------------

function read(state) {
  if (!state || state.status !== 'playing') return null;
  const level = state.level;
  if (level === null || typeof level !== 'object' || !Array.isArray(level.tiles)) return null;
  const tiles = level.tiles;
  const player = { x: state.player?.x ?? 0, y: state.player?.y ?? 0 };
  const open = Boolean(state.open);
  const carried = Array.isArray(state.carried) ? state.carried : [];
  const patches = Array.isArray(state.patches) ? state.patches : [];
  const drifts = Array.isArray(state.drifts) ? state.drifts : [];
  const conflicts = Array.isArray(state.conflicts) ? state.conflicts : [];

  // Conflicts as they stand on the upcoming tick: ones with ttl 1 age away
  // before anything can move.
  const standing = new Set();
  for (const c of conflicts) {
    if (!c) continue;
    if (typeof c.ttl !== 'number' || c.ttl > 1) standing.add(keyOf(c.x, c.y));
  }

  // Where every drift will be after the upcoming step.
  const period = level.driftPeriod;
  const tick = Number.isFinite(state.tick) ? state.tick : 0;
  const willMove = Number.isInteger(period) && period > 0 && (tick + 1) % period === 0;
  const landedOn = new Set(); // cells a drift will occupy
  const swapSources = new Set(); // cells of drifts that will land on the player
  for (const d of drifts) {
    if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.y)) continue;
    const p = willMove ? predictDrift(d, level, standing) : { x: d.x, y: d.y, moved: false };
    landedOn.add(keyOf(p.x, p.y));
    if (p.moved && p.x === player.x && p.y === player.y) swapSources.add(keyOf(d.x, d.y));
  }

  // Unsafe for a future player cell: a drift will be there, the player
  // would take the landing cell of a departing drift (a swap), or the
  // player already stands in a drift's landing spot. Nothing hits while
  // the player is invulnerable.
  const invuln = (Number.isFinite(state.invuln) ? state.invuln : 0) > 0;
  const unsafe = (x, y) => !invuln &&
    (landedOn.has(keyOf(x, y)) || swapSources.has(keyOf(x, y)));

  // Scan the map once for merge pads and the exit.
  const pads = [];
  let exit = null;
  for (let y = 0; y < tiles.length; y++) {
    const row = tiles[y];
    if (typeof row !== 'string') continue;
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'M') pads.push({ x, y });
      else if (row[x] === 'X') exit = { x, y };
    }
  }

  const quorum = Number.isFinite(level.quorum) && level.quorum > 0 ? level.quorum : 1;
  const merges = Number.isFinite(state.merges) ? state.merges : 0;
  const mergesLeft = Math.max(0, quorum - merges);
  const handsFull = carried.length >= CARRY_MAX;
  const canFinish = carried.length > 0 && carried.length >= mergesLeft;

  return { level, player, open, carried, patches, pads, exit, standing,
    landedOn, swapSources, invuln, unsafe, handsFull, canFinish };
}

// Route selection ---------------------------------------------------------

// The merge pad reachable soonest (BFS from the player, reading order).
function nearestPad(r) {
  if (r.pads.length === 0) return null;
  const dist = bfs(r.level, r.open, r.standing, new Set(), r.player);
  let best = null;
  let bestD = Infinity;
  for (const p of r.pads) {
    const d = dist.get(keyOf(p.x, p.y));
    if (d !== undefined && d < bestD) { bestD = d; best = p; }
  }
  return best;
}

// The patch whose cheapest full route (player → patch → some pad) is the
// shortest, deterministically by patch order.
function bestPatch(r) {
  if (r.patches.length === 0 || r.pads.length === 0) return null;
  const from = bfs(r.level, r.open, r.standing, new Set(), r.player);
  const back = r.pads.map((pad) => bfs(r.level, r.open, r.standing, new Set(), pad));
  let best = null;
  let bestRoute = Infinity;
  r.patches.forEach((p, i) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const out = from.get(keyOf(p.x, p.y));
    if (out === undefined) return;
    let home = Infinity;
    for (const dist of back) {
      const d = dist.get(keyOf(p.x, p.y));
      if (d !== undefined && d < home) home = d;
    }
    if (home === Infinity) return;
    const route = out + home;
    if (route < bestRoute) { bestRoute = route; best = { x: p.x, y: p.y, i }; }
  });
  return best;
}

// Step once toward the goal ------------------------------------------------

function seek(r, goal) {
  const goalIsExit = r.open && r.exit !== null &&
    goal.x === r.exit.x && goal.y === r.exit.y;

  const onGoal = r.player.x === goal.x && r.player.y === goal.y;
  if (onGoal) return dodge(r);

  // Distances to the goal, unsafe cells fenced off. The goal itself always
  // counts: taking the open exit ends the step before anything can move,
  // and reaching a pad or patch is the whole point.
  const blocked = new Set();
  for (let y = 0; y < r.level.tiles.length; y++) {
    const row = r.level.tiles[y];
    if (typeof row !== 'string') continue;
    for (let x = 0; x < row.length; x++) {
      if (x === goal.x && y === goal.y) continue;
      if (r.unsafe(x, y)) blocked.add(keyOf(x, y));
    }
  }
  const toGoal = bfs(r.level, r.open, r.standing, blocked, goal);
  const pk = keyOf(r.player.x, r.player.y);

  if (toGoal.has(pk)) {
    const here = toGoal.get(pk);
    for (const dir of CLOCKWISE) {
      const [dx, dy] = DIRS[dir];
      const nx = r.player.x + dx;
      const ny = r.player.y + dy;
      const d = toGoal.get(keyOf(nx, ny));
      if (d === undefined || d >= here) continue;
      const isGoalCell = nx === goal.x && ny === goal.y;
      if (!playerPassable(r.level, r.open, r.standing, nx, ny)) continue;
      if (r.unsafe(nx, ny) && !(goalIsExit && isGoalCell)) continue;
      return { move: dir, pause: false };
    }
  }

  // The safe route dead-ends somewhere (a drifting cordon with no way
  // around): fall back to the rough route and let luck protect the player.
  const rough = bfs(r.level, r.open, r.standing, new Set(), goal);
  if (rough.has(pk)) {
    const here = rough.get(pk);
    for (const dir of CLOCKWISE) {
      const [dx, dy] = DIRS[dir];
      const nx = r.player.x + dx;
      const ny = r.player.y + dy;
      const d = rough.get(keyOf(nx, ny));
      if (d === undefined || d >= here) continue;
      if (!playerPassable(r.level, r.open, r.standing, nx, ny)) continue;
      return { move: dir, pause: false };
    }
  }

  // Nothing routes there right now: wait it out, dodging.
  return dodge(r);
}

// Stay put when safe; else the first safe passable step; else any legal
// step at all.
function dodge(r) {
  if (!r.unsafe(r.player.x, r.player.y)) return { move: null, pause: false };
  for (const risky of [false, true]) {
    for (const dir of CLOCKWISE) {
      const [dx, dy] = DIRS[dir];
      const nx = r.player.x + dx;
      const ny = r.player.y + dy;
      if (!playerPassable(r.level, r.open, r.standing, nx, ny)) continue;
      if (risky || !r.unsafe(nx, ny)) return { move: dir, pause: false };
    }
  }
  return { move: null, pause: false };
}

// botInput(state): one input for the state, pure and deterministic. Never
// crashes and never returns an illegal move.
export function botInput(state) {
  let move = null;
  try {
    const r = read(state);
    if (r === null) return { move: null, pause: false };

    // Survival first: any immediate hit risk beats all plans.
    if (r.unsafe(r.player.x, r.player.y)) return dodge(r);

    let goal;
    if (r.open && r.exit) goal = r.exit;
    else if (r.handsFull || r.canFinish) goal = nearestPad(r);
    else goal = bestPatch(r) ?? nearestPad(r);

    if (goal === null || goal === undefined) return dodge(r);
    move = (seek(r, goal) ?? { move: null, pause: false }).move;
  } catch {
    move = null;
  }
  if (move !== 'up' && move !== 'right' && move !== 'down' && move !== 'left') {
    return { move: null, pause: false };
  }
  return { move, pause: false };
}
