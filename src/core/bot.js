// The autopilot (DESIGN.md §9): botInput(state) returns an input of the
// shape the rules accept. Pure and deterministic: it plans one route at a
// time with a BFS over the level's tiles, and it forecasts drifts and
// conflicts by replaying §6's steps 5, 10, and 11 — exact, because drifts
// ignore the player. The forecast keeps it off cells a drift will hold and
// out of conflicts; when the direct route is unsafe it replans around the
// patrol, and when nothing is safe it stands still and waits for a gap.

import { CARRY_MAX, CONFLICT_TICKS, DIRS, CLOCKWISE } from './constants.js';

// How far ahead the forecast looks, in steps.
const HORIZON = 12;

const key = (x, y) => `${x},${y}`;

// The tile at a cell ('#' outside the map), read straight from the parsed
// level, like tileAt (§5).
function tileOf(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined) return '#';
  return row[x] === undefined ? '#' : row[x];
}

// §6 step 6's passability for the player: not a wall, not a hold or the
// exit unless `open`, and not a live conflict. (Drift cells stay passable;
// §12 resolves standing next to one, but the forecast steers around it.)
function passableForPlayer(state, x, y, blocked) {
  const t = tileOf(state, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !state.open) return false;
  return !blocked.has(key(x, y));
}

// One BFS from a cell over passable cells: dist to every reachable cell
// and, per cell, the previous cell with the move that entered it.
function floodFrom(state, blocked, sx, sy) {
  const dist = new Map([[key(sx, sy), 0]]);
  const prev = new Map();
  const queue = [{ x: sx, y: sy }];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    if (tileOf(state, c.x, c.y) === 'X') continue; // the exit is a sink: never route through it
    const d = dist.get(key(c.x, c.y));
    for (const dir of CLOCKWISE) {
      const nx = c.x + DIRS[dir][0];
      const ny = c.y + DIRS[dir][1];
      const k = key(nx, ny);
      if (dist.has(k)) continue;
      if (!passableForPlayer(state, nx, ny, blocked)) continue;
      dist.set(k, d + 1);
      prev.set(k, { x: c.x, y: c.y, dir });
      queue.push({ x: nx, y: ny });
    }
  }
  return { dist, prev };
}

// The route from the player to a cell as a list of moves, or null.
function routeTo(state, flood, goal) {
  const start = key(state.player.x, state.player.y);
  const steps = [];
  let cur = key(goal.x, goal.y);
  while (cur !== start) {
    const p = flood.prev.get(cur);
    if (p === undefined) return null;
    steps.push(p.dir);
    cur = key(p.x, p.y);
  }
  return steps.reverse();
}

// Every merge pad and exit cell, read once per call.
function padsAndExits(state) {
  const merges = [];
  const exits = [];
  for (let y = 0; y < state.level.tiles.length; y++) {
    const row = state.level.tiles[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'M') merges.push({ x, y });
      else if (row[x] === 'X') exits.push({ x, y });
    }
  }
  return { merges, exits };
}

// The nearest of some cells by flood distance, or null.
function nearestByDist(dist, cells) {
  let best = null;
  let bestD = Infinity;
  for (const c of cells) {
    const d = dist.get(key(c.x, c.y));
    if (d !== undefined && d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// The bot's goal (§9): ship when open; with full hands, merge; then fetch
// the nearest patch; when none lies around, wait by a spawn point.
function goalFor(state) {
  const blocked = new Set(state.conflicts.map((c) => key(c.x, c.y)));
  const flood = floodFrom(state, blocked, state.player.x, state.player.y);
  const { exits, merges } = padsAndExits(state);
  if (state.open) {
    const exit = nearestByDist(flood.dist, exits);
    if (exit) return { goal: exit, flood, exit: true };
  }
  if (state.carried.length >= CARRY_MAX) {
    const pad = nearestByDist(flood.dist, merges);
    if (pad) return { goal: pad, flood, exit: false };
  }
  const patch = nearestByDist(flood.dist, state.patches);
  if (patch) return { goal: patch, flood, exit: false };
  const spawn = nearestByDist(flood.dist, state.level.spawns);
  if (spawn) return { goal: spawn, flood, exit: false };
  return { goal: null, flood, exit: false };
}

// §6's steps 5, 10, and 11 replayed `horizon` steps for the drifts and the
// conflicts alone. plan.danger[k] is the set of cells holding a drift after
// k forecasted steps (deadly at the hit check, §12); plan.blocked[k] the
// cells holding a conflict (unwalkable, §5-§6).
function forecast(state, horizon) {
  const drifts = state.drifts.map((d) => ({ ...d }));
  let conflicts = state.conflicts.map((c) => ({ ...c }));
  let tick = state.tick;
  const period = state.level.driftPeriod;
  const tiles = state.level.tiles;
  const plan = { danger: [], blocked: [] };
  for (let k = 0; k < horizon; k++) {
    tick += 1;
    conflicts = conflicts.map((c) => ({ ...c, ttl: c.ttl - 1 })).filter((c) => c.ttl > 0);
    if (period > 0 && tick % period === 0) {
      for (const d of drifts) {
        const from = CLOCKWISE.indexOf(d.dir);
        for (let i = 0; i < 4; i++) {
          const dir = CLOCKWISE[(from + i) % 4];
          const nx = d.x + DIRS[dir][0];
          const ny = d.y + DIRS[dir][1];
          const t = tileOf(state, nx, ny);
          if (t === '#' || t === 'H' || t === 'X') continue;
          if (conflicts.some((c) => c.x === nx && c.y === ny)) continue;
          d.x = nx;
          d.y = ny;
          d.dir = dir;
          break;
        }
      }
      const counts = new Map();
      for (const d of drifts) counts.set(key(d.x, d.y), (counts.get(key(d.x, d.y)) || 0) + 1);
      for (const d of drifts) {
        if ((counts.get(key(d.x, d.y)) || 0) < 2) continue;
        d.dir = d.dir === 'up' ? 'down' : d.dir === 'down' ? 'up' : d.dir === 'left' ? 'right' : 'left';
        if (!conflicts.some((c) => c.x === d.x && c.y === d.y)) conflicts.push({ x: d.x, y: d.y, ttl: CONFLICT_TICKS });
      }
    }
    plan.danger.push(new Set(drifts.map((d) => key(d.x, d.y))));
    plan.blocked.push(new Set(conflicts.map((c) => key(c.x, c.y))));
  }
  return plan;
}

// How long a projection survives: the first forecasted game-step whose hit
// check (§6 step 12) puts a drift on the player, or Infinity. cells[0] is
// the player's cell now, cells[j] the cell after j steps (clamped: once a
// projection's steps end, its bot stands). With `walkOnly` beyond-the-walk
// steps pass unjudged — the bot replans every tick anyway. Arriving on the
// open exit ships the level in §6's step 9, before any hit, so a route
// that ends there is safe however the drifts move after. `invuln` ticks of
// immunity (§6 step 12) ride out the first steps.
function hitTick(cells, walkOnly, isExit, plan, invuln) {
  for (let j = 1; j <= plan.danger.length; j++) {
    if (isExit && j === cells.length - 1) return Infinity;
    if (walkOnly && j >= cells.length) return Infinity;
    if (invuln >= j) continue;
    const cell = cells[Math.min(j, cells.length - 1)];
    if (plan.danger[j - 1].has(cell)) return j;
  }
  return Infinity;
}

// The cell list of a route (players move first, drifts after: §6).
function cellsOfRoute(state, route) {
  const cells = [{ x: state.player.x, y: state.player.y }];
  let x = state.player.x;
  let y = state.player.y;
  for (const dir of route) {
    x += DIRS[dir][0];
    y += DIRS[dir][1];
    cells.push({ x, y });
  }
  return cells;
}

export function botInput(state) {
  if (!state || state.status !== 'playing' || !state.level || !Array.isArray(state.level.tiles)) {
    return { move: null, pause: false };
  }
  const { goal, flood, exit } = goalFor(state);
  if (!goal) return { move: null, pause: false };
  const route = routeTo(state, flood, goal);
  if (!route || route.length === 0) return { move: null, pause: false }; // already there or unreachable

  const plan = forecast(state, Math.max(HORIZON, route.length + 2));
  const cells = cellsOfRoute(state, route);
  const invuln = typeof state.invuln === 'number' ? state.invuln : 0;
  if (hitTick(cells, true, exit, plan, invuln) === Infinity) return { move: route[0], pause: false };

  // Replan around the patrol: flood again, treating every cell a drift
  // will cross or a conflict will hold within the forecast as blocked.
  const dodgy = new Set(state.conflicts.map((c) => key(c.x, c.y)));
  for (const set of plan.danger) for (const k of set) dodgy.add(k);
  const detourFlood = floodFrom(state, dodgy, state.player.x, state.player.y);
  const detourGoal = detourFlood.dist.has(key(goal.x, goal.y)) ? goal : null;
  if (detourGoal) {
    const detourRoute = routeTo(state, detourFlood, detourGoal);
    if (detourRoute && detourRoute.length > 0) {
      const dcells = cellsOfRoute(state, detourRoute);
      if (hitTick(dcells, true, exit, plan, invuln) === Infinity) return { move: detourRoute[0], pause: false };
    }
  }

  // No clean step: among the possible moves, hold out the longest. Rank by
  // survival span, then by candidate order (direct route step first).
  const candidates = [];
  if (route.length > 0) candidates.push(route[0]);
  for (const dir of CLOCKWISE) if (!candidates.includes(dir)) candidates.push(dir);
  candidates.push(null);
  const live = new Set(state.conflicts.map((c) => key(c.x, c.y)));
  let best = null;
  let bestSpan = -1;
  let bestIndex = candidates.length;
  for (let i = 0; i < candidates.length; i++) {
    const act = candidates[i];
    if (act !== null) {
      const nx = state.player.x + DIRS[act][0];
      const ny = state.player.y + DIRS[act][1];
      if (!passableForPlayer(state, nx, ny, live)) continue;
    }
    const pcells = [key(state.player.x, state.player.y)];
    if (act !== null) pcells.push(key(state.player.x + DIRS[act][0], state.player.y + DIRS[act][1]));
    const span = hitTick(pcells, false, false, plan, invuln);
    if (span > bestSpan || (span === bestSpan && i < bestIndex)) {
      bestSpan = span;
      bestIndex = i;
      best = act;
    }
  }
  return { move: best, pause: false };
}
