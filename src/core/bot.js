// The bot (DESIGN.md §9): an autopilot that plays the game. Pure and
// deterministic: it reads a state, plans a goal (patch, merge pad, or the
// open exit), paths over the grid with BFS weighted away from drifts and
// conflicts, and checks its move by simulating a step with the real rules
// so it never walks into a drift when a safe move exists.
import { DIRS } from './constants.js';
import { step } from './game.js';

// The four moves, in the clockwise order of §2's CLOCKWISE, so every tie
// in this file breaks the same way.
const MOVES = ['up', 'right', 'down', 'left'];

// A cell's tile, '#' beyond the map.
function tileAt(level, x, y) {
  const row = level.tiles[y];
  if (!row || x < 0 || x >= row.length) return '#';
  return row[x];
}

// Passable to the player: not a wall; a hold or the exit only when open.
// Conflicts are passable for planning but cost extra (they expire).
function passable(level, x, y, open) {
  return tileAt(level, x, y) !== '#' && ((tileAt(level, x, y) !== 'H' && tileAt(level, x, y) !== 'X') || open);
}

// The first move of a cheapest path from the player to any of the target
// cells, or null when none is reachable. Costs: 1 a cell, steep next to a
// drift or on a drift's own cell, mild on a conflict.
function stepToward(state, targets) {
  if (targets.length === 0) return null;
  const level = state.level;
  const width = level.width;
  const height = level.height;
  const open = state.open;
  const player = state.player;
  const want = targets.map((t) => t.y * width + t.x);

  const drifts = new Set(state.drifts.map((d) => d.y * width + d.x));
  const conflicts = new Set(state.conflicts.map((c) => c.y * width + c.x));
  const near = new Set();
  for (const d of state.drifts) {
    for (const m of MOVES) {
      const [dx, dy] = DIRS[m];
      const x = d.x + dx;
      const y = d.y + dy;
      if (x >= 0 && y >= 0 && x < width && y < height) near.add(y * width + x);
    }
  }
  const cost = (cell) =>
    1 + (drifts.has(cell) ? 60 : near.has(cell) ? 8 : 0) + (conflicts.has(cell) ? 3 : 0);

  const best = new Map();
  const parents = new Map();
  // A small binary heap keyed by (cost, order): same cost keeps the order
  // the cell was enqueued, so ties break clockwise-deterministically.
  const heap = [];
  const push = (cost, order, cell, parent) => {
    heap.push({ cost, order, cell, parent });
    let i = heap.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (heap[up].cost < heap[i].cost || (heap[up].cost === heap[i].cost && heap[up].order <= heap[i].order)) break;
      [heap[up], heap[i]] = [heap[i], heap[up]];
      i = up;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && (heap[l].cost < heap[m].cost || (heap[l].cost === heap[m].cost && heap[l].order < heap[m].order))) m = l;
        if (r < heap.length && (heap[r].cost < heap[m].cost || (heap[r].cost === heap[m].cost && heap[r].order < heap[m].order))) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  const startCell = player.y * width + player.x;
  best.set(startCell, 0);
  push(0, 0, startCell, null);
  let order = 1;
  while (heap.length > 0) {
    const { cost: c, cell, parent } = pop();
    if ((best.get(cell) ?? Infinity) < c) continue;
    if (parent !== null || cell !== startCell) parents.set(cell, parent);
    if (want.includes(cell) && cell !== startCell) {
      // Walk the parent chain back to the cell that leaves the player.
      let node = cell;
      while (parents.get(node) !== startCell && parents.get(node) !== undefined && parents.get(node) !== null) node = parents.get(node);
      const first = parents.get(node) === startCell ? node : null;
      if (first !== null) {
        const x = first % width;
        const y = Math.floor(first / width);
        const dx = x - player.x;
        const dy = y - player.y;
        for (const m of MOVES) {
          const [ddx, ddy] = DIRS[m];
          if (ddx === dx && ddy === dy) return m;
        }
        return null;
      }
      return null;
    }
    for (const m of MOVES) {
      const [dx, dy] = DIRS[m];
      const x = (cell % width) + dx;
      const y = Math.floor(cell / width) + dy;
      if (!passable(level, x, y, open)) continue;
      const next = y * width + x;
      const nc = c + cost(next);
      if ((best.get(next) ?? Infinity) <= nc) continue;
      best.set(next, nc);
      push(nc, order++, next, cell);
    }
  }
  return null;
}

// Lists of goal cells on the board, in reading order.
function tiles(state, ch) {
  const out = [];
  state.level.tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === ch) out.push({ x, y });
  });
  return out;
}

// What the bot wants right now: a move toward a goal, or to stand still
// and act (merge on the pad, wait for a spawn).
function plan(state) {
  const level = state.level;
  const player = state.player;
  const carried = state.carried.length;
  const need = Math.max(0, level.quorum - state.merges - carried);

  if (state.open) {
    const move = stepToward(state, tiles(state, 'X'));
    return { move, wait: false };
  }
  const pads = tiles(state, 'M');
  if (carried >= 3 || (carried > 0 && need === 0)) {
    return { move: stepToward(state, pads), wait: false };
  }
  const patches = state.patches.map((p) => ({ x: p.x, y: p.y }));
  if (carried > 0 && need > 0) {
    const move = stepToward(state, patches) ?? stepToward(state, pads);
    return { move, wait: false };
  }
  if (patches.length > 0) {
    const move = stepToward(state, patches);
    if (move !== null) return { move, wait: false };
  }
  // Empty-handed and no patch to fetch: wait next to a spawn point, so a
  // patch that spawns there is one step away. Patches never spawn on the
  // player's own cell, hence the adjacent cells, not the spawn itself.
  // Standing next to a spawn already? Wait right there instead of pacing
  // between two equally near wait cells forever.
  const isNextToSpawn = level.spawns.some(
    (s) => Math.abs(s.x - player.x) + Math.abs(s.y - player.y) === 1,
  );
  if (isNextToSpawn) return { move: null, wait: true };
  const waitCells = [];
  for (const s of level.spawns) {
    for (const m of MOVES) {
      const [dx, dy] = DIRS[m];
      const x = s.x + dx;
      const y = s.y + dy;
      if (passable(level, x, y, state.open) && !(x === player.x && y === player.y)) waitCells.push({ x, y });
    }
  }
  if (waitCells.length > 0) {
    const move = stepToward(state, waitCells);
    if (move !== null) return { move, wait: false };
  }
  return { move: null, wait: true };
}

// botInput(state) returns `{ move, pause: false }` for the state. It
// checks each candidate move by playing one real step with the rules, so
// a drift ambush, a conflict, or a swap is caught before it is made.
export function botInput(state) {
  if (state.status !== 'playing' || state.paused) return { move: null, pause: false };
  const plan0 = plan(state);
  const first = plan0.move;
  const candidates = first === null
    ? (plan0.wait ? [null, ...MOVES] : [...MOVES, null])
    : [first, ...MOVES.filter((m) => m !== first), null];

  let descent = null; // survives but drops the carried patches
  let alive = null; // survives but takes a hit
  let any = null; // nothing better exists
  for (const move of candidates) {
    const sim = step(state, { move, pause: false });
    const lost = sim.status === 'lost';
    const hit = sim.events.includes('hit');
    const drop = sim.events.includes('drop');
    if (any === null) any = move;
    if (!lost && alive === null) alive = move;
    if (!lost && !hit && descent === null) descent = move;
    if (!lost && !hit && !drop) return { move, pause: false };
  }
  return { move: descent ?? alive ?? any ?? null, pause: false };
}
