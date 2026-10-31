// The bot (DESIGN.md §9): a pure, deterministic autopilot. It reads the
// state it is given and returns one input for it, changing and caching
// nothing: calling it twice for one state answers twice the same input.
//
// Strategy: when the quorum is reached, head for the exit; with full hands,
// head for the nearest merge pad; otherwise collect the nearest reachable
// patch (taking full hands along the way), and mud to merge pads when no
// patch is out. Paths avoid conflicts and drifts, and a cell that a drift
// could step onto next tick, so the bot drops and takes hits only when the
// grid leaves it no other choice.

import { CARRY_MAX, CLOCKWISE, DIRS } from './constants.js';

// Neighbour cells, walked in CLOCKWISE order so tie-breaks are stable.
const NEIGHBORS = CLOCKWISE.map((dir) => [dir, DIRS[dir][0], DIRS[dir][1]]);

export function botInput(state) {
  if (!state || state.status !== 'playing') return { move: null, pause: false };
  const rows = (state.level && state.level.tiles) || [];
  const height = rows.length;
  const width = height > 0 ? rows[0].length : 0;
  const player = state.player;
  if (!player || typeof player.x !== 'number' || typeof player.y !== 'number') {
    return { move: null, pause: false };
  }
  const drifts = state.drifts || [];
  const conflicts = state.conflicts || [];
  const open = state.open === true;
  const carried = state.carried || [];

  const key = (x, y) => y * width + x;
  const terrain = (x, y) =>
    y >= 0 && y < height && x >= 0 && x < width ? rows[y][x] : '#';

  const onCell = (list) => (x, y) =>
    list.some((c) => c && c.x === x && c.y === y);
  const conflictAt = onCell(conflicts);
  const driftAt = onCell(drifts);

  // A cell the player may stand on: floor of the open level, never a wall,
  // a closed hold, a closed exit, a conflict, or a drift.
  const passable = (x, y) => {
    const ch = terrain(x, y);
    if (ch === '#') return false;
    if ((ch === 'H' || ch === 'X') && !open) return false;
    return !conflictAt(x, y) && !driftAt(x, y);
  };

  // Cells a drift could reach with a one-cell step: its own and its four
  // neighbours. Ending a turn next to one is how hits happen.
  const danger = new Set();
  for (const d of drifts) {
    if (!d) continue;
    for (const [dir, dx, dy] of [[null, 0, 0], ...NEIGHBORS]) {
      const x = d.x + dx;
      const y = d.y + dy;
      if (terrain(x, y) !== '#' && !conflictAt(x, y)) danger.add(key(x, y));
    }
  }

  // Breadth-first search for the first reachable cell of `goals`; returns
  // the first step of a shortest path in the neighbour order, or null.
  // `safe` keeps paths out of danger cells when it can.
  const bfs = (goals, safe) => {
    const startK = key(player.x, player.y);
    const first = new Map(); // cell key -> first step of the path to it
    first.set(startK, null);
    const queue = [{ x: player.x, y: player.y }];
    while (queue.length > 0) {
      const cur = queue.shift();
      const curK = key(cur.x, cur.y);
      if (curK !== startK && goals.has(curK)) return first.get(curK);
      for (const [dir, dx, dy] of NEIGHBORS) {
        const x = cur.x + dx;
        const y = cur.y + dy;
        const k = key(x, y);
        if (first.has(k) || !passable(x, y)) continue;
        if (safe && danger.has(k)) continue;
        first.set(k, curK === startK ? dir : first.get(curK));
        queue.push({ x, y });
      }
    }
    return null;
  };

  // Goals, in priority order: exit, then merge pad, then patch.
  const merges = new Set();
  const exits = new Set();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = terrain(x, y);
      if (ch === 'M') merges.add(key(x, y));
      if (ch === 'X') exits.add(key(x, y));
    }
  }
  // Patches lie on spawn points and may reach them by their coordinates
  // (the tiles map shows spawn points as plain floor).
  const patchCells = new Set(
    (state.patches || []).filter((p) => p).map((p) => key(p.x, p.y)),
  );

  const stages = [];
  if (open) stages.push(exits);
  if (carried.length >= CARRY_MAX) stages.push(merges);
  else if (patchCells.size > 0) stages.push(patchCells);
  else if (carried.length > 0) stages.push(merges);

  for (const goals of stages) {
    if (goals.size === 0) continue;
    const move = bfs(goals, true);
    if (move) return { move, pause: false };
  }
  for (const goals of stages) {
    if (goals.size === 0) continue;
    const move = bfs(goals, false);
    if (move) return { move, pause: false };
  }

  // No route to any goal: step to passability, maximizing the distance to
  // the nearest drift (and standing still when there are none to worry
  // about, or no legal step at all).
  if (drifts.length === 0) return { move: null, pause: false };
  let best = null;
  let bestScore = 0;
  for (const [dir, dx, dy] of NEIGHBORS) {
    const x = player.x + dx;
    const y = player.y + dy;
    if (!passable(x, y)) continue;
    const score = drifts.reduce(
      (m, d) => (d && d.x === x && d.y === y ? Infinity : Math.min(m, Math.abs(d.x - x) + Math.abs(d.y - y))),
      Infinity,
    );
    if (score > bestScore) {
      bestScore = score;
      best = dir;
    }
  }
  return { move: best, pause: false };
}
