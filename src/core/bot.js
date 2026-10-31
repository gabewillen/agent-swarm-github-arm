// The autopilot (DESIGN.md §9). `botInput` is pure and deterministic: it
// reads the state, predicts where the drifts will be one tick from now,
// and returns the first move along a safest shortest path to its target.

import { CARRY_MAX, CLOCKWISE, DIRS } from './constants.js';

const key = (x, y) => `${x},${y}`;

function tileOf(state, x, y) {
  const { tiles, width, height } = state.level;
  if (x < 0 || y < 0 || x >= width || y >= height) return '#';
  const row = tiles[y];
  return row === undefined ? '#' : row[x];
}

// Cells the player may enter right now (§6 step 6): conflicts always
// block, holds and the exit only when the level is open.
function walkable(state, x, y) {
  const t = tileOf(state, x, y);
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !state.open) return false;
  for (const c of state.conflicts) if (c.x === x && c.y === y) return false;
  return true;
}

// Predict every drift's position after this step's drift phase (§6 step
// 10). Drift movement is fully deterministic given the state, so the
// prediction is exact. While `invuln` is up nothing can hit the player,
// so there is no danger to predict.
function predictDrifts(state) {
  if (state.invuln > 0) return [];
  if ((state.tick + 1) % state.level.driftPeriod !== 0) {
    return state.drifts.map((d) => ({ cur: { x: d.x, y: d.y }, next: { x: d.x, y: d.y } }));
  }
  // Conflicts age before the drifts move; one with ttl 1 vanishes.
  const aged = state.conflicts.filter((c) => c.ttl - 1 > 0);
  return state.drifts.map((d) => {
    const blocked = (x, y) => {
      const t = tileOf(state, x, y);
      return t === '#' || t === 'H' || t === 'X' || aged.some((c) => c.x === x && c.y === y);
    };
    const start = CLOCKWISE.indexOf(d.dir);
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = DIRS[CLOCKWISE[(start + k) % 4]];
      const x = d.x + dx;
      const y = d.y + dy;
      if (!blocked(x, y)) return { cur: { x: d.x, y: d.y }, next: { x, y } };
    }
    return { cur: { x: d.x, y: d.y }, next: { x: d.x, y: d.y } };
  });
}

// A move from `from` to `to` is unsafe when a drift will land on `to`,
// or when a drift crosses the player: it moves onto the cell the player
// leaves while the player moves onto its cell.
function unsafeMove(pairs, from, to) {
  for (const p of pairs) {
    if (p.next.x === to.x && p.next.y === to.y) return true;
    if (
      p.next.x === from.x &&
      p.next.y === from.y &&
      p.cur.x === to.x &&
      p.cur.y === to.y
    ) {
      return true;
    }
  }
  return false;
}

// Breadth-first search from the player over walkable cells, honouring
// drift safety, remembering the first step of the shortest path to each
// cell. Extending in CLOCKWISE order keeps it deterministic. Returns the
// first move of the shortest path, or null when no goal is reachable
// (which includes standing on the only goal).
function bfs(state, goals, pairs) {
  const { width, height } = state.level;
  const dist = new Int32Array(width * height).fill(-1);
  const first = new Array(width * height).fill(null);
  const start = state.player.x + state.player.y * width;
  dist[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    const cx = cell % width;
    const cy = (cell - cx) / width;
    for (const move of CLOCKWISE) {
      const [dx, dy] = DIRS[move];
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (!walkable(state, x, y)) continue;
      if (pairs && unsafeMove(pairs, { x: cx, y: cy }, { x, y })) continue;
      const idx = x + y * width;
      if (dist[idx] !== -1) continue;
      dist[idx] = dist[cell] + 1;
      first[idx] = dist[cell] === 0 ? move : first[cell];
      if (goals.has(key(x, y))) return first[idx];
      queue.push(idx);
    }
  }
  return null;
}

// Cells of one terrain character on the map.
function cellsOf(state, ch) {
  const out = [];
  const { width, height, tiles } = state.level;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x] === ch) out.push({ x, y });
    }
  }
  return out;
}

// The target ladder, as one flat list of cells in priority order for tie
// breaks: the nearest reachable among them wins.
function goalCells(state) {
  const carried = state.carried.length;
  if (carried >= CARRY_MAX) return cellsOf(state, 'M');
  if (state.open) {
    if (carried > 0) {
      return [...cellsOf(state, 'M'), ...cellsOf(state, 'X')];
    }
    return cellsOf(state, 'X');
  }
  if (carried > 0) {
    return [...cellsOf(state, 'M'), ...state.patches.map((p) => ({ x: p.x, y: p.y }))];
  }
  return state.patches.map((p) => ({ x: p.x, y: p.y }));
}

// Used when nothing on the ladder can be reached: wait next to a spawn
// point so a new patch can appear there.
function hoverCells(state) {
  return state.level.spawns.map((sp) => ({ x: sp.x, y: sp.y }));
}

export function botInput(state) {
  const pairs = predictDrifts(state);

  for (const targets of [goalCells(state), hoverCells(state)]) {
    if (targets.length === 0) continue;
    const keySet = new Set(targets.map((c) => key(c.x, c.y)));
    const move = bfs(state, keySet, pairs);
    if (move !== null) return { move, pause: false };

    // No fully safe route: take the safe step that gets closest.
    const relaxed = bfs(state, keySet, null);
    if (relaxed !== null) {
      const side = safeStep(state, pairs, relaxed);
      if (side !== null) return { move: side, pause: false };
    }
  }
  return { move: null, pause: false };
}

// The safe neighbour closer to the goal, if there is one; otherwise any
// safe neighbour; otherwise null (stand still).
function safeStep(state, pairs, closer) {
  const px = state.player.x;
  const py = state.player.y;
  const options = [];
  for (const move of CLOCKWISE) {
    const [dx, dy] = DIRS[move];
    const x = px + dx;
    const y = py + dy;
    if (!walkable(state, x, y)) continue;
    if (unsafeMove(pairs, { x: px, y: py }, { x, y })) continue;
    options.push(move);
  }
  if (options.includes(closer)) return closer;
  return options.length > 0 ? options[0] : null;
}
