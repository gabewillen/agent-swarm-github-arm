// The autopilot (DESIGN.md §9): botInput(state) returns a pure,
// deterministic input { move, pause: false } for the state. It routes
// over the grid with a Dijkstra search whose edges cost more near
// drifts, fetches patches, merges the hands it holds, takes the exit
// once the quorum has opened, and waits still when there is nothing
// better to do.

import { CARRY_MAX, CLOCKWISE, DIRS } from './constants.js';

// Routing and safety
const RISK_STEP = 6;

// The terrain character of a level cell, '#' outside the map.
function tile(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined) return '#';
  return row[x] ?? '#';
}

// Every cell of terrain ch, in reading order.
function cellsWhere(level, ch) {
  const out = [];
  for (let y = 0; y < level.tiles.length; y++) {
    for (let x = 0; x < (level.tiles[y] || '').length; x++) {
      if (level.tiles[y][x] === ch) out.push({ x, y });
    }
  }
  return out;
}

// §6 step 6: cells the player may stand on: not a wall, a hold or the
// exit opens only with the level's quorum, and no conflict sits there.
function playerCan(level, conflicts, open, x, y) {
  const t = tile(level, x, y);
  if (t === '#' || (t === 'H' || t === 'X') && !open) return false;
  return !conflicts.some((c) => c.x === x && c.y === y);
}

// Where each drift will be one step on: its planned move, or where it
// stands when drifts do not move on the coming tick. Mirrors §6 step 10
// (own direction first, then the clockwise order, ignoring everything
// but walls, holds, the exit, and conflicts).
function driftPlan(state) {
  const level = state.level;
  const moving = (state.tick + 1) % level.driftPeriod === 0;
  const dirs = state.drifts.map((d) => DIRS[d.dir] ?? DIRS.up);
  const cur = state.drifts.map((d) => ({ x: d.x, y: d.y }));
  const next = cur.map((c, i) => {
    if (!moving) return c;
    const from = CLOCKWISE.indexOf(state.drifts[i].dir);
    for (let k = 0; k < 4; k++) {
      const dir = CLOCKWISE[((from < 0 ? 0 : from) + k) % 4];
      const [dx, dy] = DIRS[dir];
      const x = c.x + dx;
      const y = c.y + dy;
      const t = tile(level, x, y);
      if (t === '#') continue;
      if (t === 'H' || t === 'X') continue;
      if (level.conflicts && level.conflicts.length) { /* parsed levels carry no conflicts */ }
      if (state.conflicts.some((cc) => cc.x === x && cc.y === y)) continue;
      return { x, y };
    }
    return c;
  });
  void dirs;
  return { moving, cur, next };
}

// The per-cell safety of the coming step: fatal cells are where a drift
// is about to land or would swap cells with the player; risky cells sit
// beside a drift's landing spot. With invuln standing nothing is risky
// or fatal, so the bot runs straight through.
function makeDanger(state, keep) {
  if (keep) return { fatal: () => false, risk: () => false };
  const { cur, next } = driftPlan(state);
  const player = state.player;
  return {
    fatal(x, y) {
      return next.some((n) => n.x === x && n.y === y)
        || next.some((n, i) => n.x === player.x && n.y === player.y && cur[i].x === x && cur[i].y === y);
    },
    risk(x, y) {
      return next.some((n) => Math.abs(n.x - x) + Math.abs(n.y - y) <= 1);
    },
  };
}

// Dijkstra over the grid from the player to the nearest reachable
// target, with risky cells costing extra and fatal cells standing out.
// Returns the verb of the first move of the cheapest route, { reached:
// true } when the player is already standing on a target, or null when
// every target is walled off.
function routeTo(state, targets, danger) {
  const level = state.level;
  const w = level.width;
  const h = level.height;
  const start = state.player;
  if (targets.some((t) => t.x === start.x && t.y === start.y)) return { reached: true };
  const n = w * h;
  const where = (x, y) => y * w + x;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const s = where(start.x, start.y);
  dist[s] = 0;
  const front = [s];
  let found = -1;
  while (front.length > 0 && found === -1) {
    let bi = 0;
    for (let i = 1; i < front.length; i++) {
      if (dist[front[i]] < dist[front[bi]]) bi = i;
    }
    const u = front[bi];
    front.splice(bi, 1);
    const ux = u % w;
    const uy = (u - ux) / w;
    for (const dir of CLOCKWISE) {
      const [dx, dy] = DIRS[dir];
      const x = ux + dx;
      const y = uy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (!playerCan(level, state.conflicts, state.open, x, y)) continue;
      if (danger.fatal(x, y)) continue;
      const v = where(x, y);
      const cost = dist[u] + 1 + (danger.risk(x, y) ? RISK_STEP : 0);
      if (cost < dist[v]) {
        dist[v] = cost;
        prev[v] = u;
        if (!front.includes(v)) front.push(v);
      }
      if (targets.some((t) => t.x === x && t.y === y) && cost <= dist[v]) found = v;
    }
  }
  if (found < 0) return null;
  let v = found;
  while (prev[v] !== s) v = prev[v];
  const vx = v % w;
  const vy = (v - vx) / w;
  for (const dir of CLOCKWISE) {
    const [dx, dy] = DIRS[dir];
    if (dx === vx - start.x && dy === vy - start.y) return dir;
  }
  return null;
}

// A target is unreachable or the road is all danger: fall back to the
// safest single move, staying whenever staying is safe.
function dodge(state, danger) {
  const level = state.level;
  const p = state.player;
  let move = null;
  let score = danger.fatal(p.x, p.y) ? 1000 : danger.risk(p.x, p.y) ? 1 : 0;
  for (const dir of CLOCKWISE) {
    const [dx, dy] = DIRS[dir];
    const x = p.x + dx;
    const y = p.y + dy;
    if (!playerCan(level, state.conflicts, state.open, x, y)) continue;
    if (danger.fatal(x, y)) continue;
    const r = danger.risk(x, y) ? 1 : 0;
    if (r < score) {
      score = r;
      move = dir;
    }
  }
  return move;
}

export function botInput(state) {
  if (!state || state.status !== 'playing' || !state.level) return { move: null, pause: false };
  const level = state.level;
  const danger = makeDanger(state, state.invuln > 0);
  const move = plan(state, danger) ?? dodge(state, danger);
  return { move: move ?? null, pause: false };
}

// What the bot wants, in order: the exit when the level is open; the
// merge pad once the hands hold the quorum (or are full); otherwise the
// nearest patch; with a patchless floor, the pad for what it holds.
function plan(state, danger) {
  const level = state.level;
  const exit = cellsWhere(level, 'X')[0];
  const pads = cellsWhere(level, 'M');
  if (exit && state.open) {
    const r = routeTo(state, [exit], danger);
    if (r === null) return dodge(state, danger);
    return r;
  }
  const carried = state.carried.length;
  const pending = Math.max(0, level.quorum - state.merges);
  if (carried > 0 && (carried >= CARRY_MAX || carried >= pending)) {
    if (pads.length === 0) return null;
    const r = routeTo(state, pads, danger);
    if (r === null) return dodge(state, danger);
    return r;
  }
  if (state.patches.length > 0) {
    const r = routeTo(state, state.patches, danger);
    if (r === null) return dodge(state, danger);
    return r;
  }
  if (carried > 0 && pads.length > 0) {
    const r = routeTo(state, pads, danger);
    if (r === null) return dodge(state, danger);
    return r;
  }
  return null;
}
