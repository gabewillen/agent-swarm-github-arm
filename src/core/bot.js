// Quorum Run's autopilot (DESIGN.md §9): a pure, deterministic player.
// It plans with breadth-first search over the level's grid: it walks to
// the nearest patch while its hands have room, takes a full hand to the
// nearest merge pad, and heads for the exit once the quorum is open. It
// avoids drifts by steering around the cells they can reach on the next
// step, and it does not cross a merge pad while carrying unless the pad
// is the destination, since arriving there would merge early.
import { CARRY_MAX, CLOCKWISE, DIRS } from './constants.js';

const NONE = { move: null, pause: false };
const NEIGHBOURS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];

// Reads a level's terrain from its tiles, walls outside the map.
function terrain(tiles, x, y) {
  const row = tiles[y];
  if (row === undefined) return '#';
  return row[x] ?? '#';
}

// Where each drift will be after the next step (the rules of §6: the
// conflicts on the board age first, then each drift takes the first
// passable direction clockwise from its own, or stays put). A drift's
// own cell only matters for the tick after that, so the prediction is
// recomputed on every call.
function predictDrifts(state, tiles, conflicts) {
  const level = state.level;
  if (state.paused || (state.tick + 1) % level.driftPeriod !== 0) {
    return state.drifts.map((d) => ({ x: d.x, y: d.y }));
  }
  const aged = new Set();
  for (const c of conflicts) {
    if (c.ttl - 1 > 0) aged.add(`${c.x},${c.y}`);
  }
  const conflictAt = (x, y) => aged.has(`${x},${y}`);
  const out = [];
  for (const d of state.drifts) {
    const start = Math.max(0, CLOCKWISE.indexOf(d.dir));
    for (let turn = 0; turn < CLOCKWISE.length; turn++) {
      const dir = CLOCKWISE[(start + turn) % CLOCKWISE.length];
      const nx = d.x + DIRS[dir][0];
      const ny = d.y + DIRS[dir][1];
      const t = terrain(tiles, nx, ny);
      if (t !== "#" && t !== "H" && t !== "X" && !conflictAt(nx, ny)) {
        out.push({ x: nx, y: ny });
        break;
      }
    }
  }
  return out;
}

// botInput(state): the input for the state. Pure and deterministic.
export function botInput(state) {
  if (!state || state.status !== "playing" || state.paused) return { ...NONE };
  const tiles = state.level.tiles;
  const height = tiles.length;
  const width = (tiles[0] ?? "").length;
  const open = state.open;
  const carrying = state.carried.length;
  const key = (x, y) => `${x},${y}`;
  const start = key(state.player.x, state.player.y);

  // Predict the next step of the drifts: the cells they will occupy.
  const predicted = predictDrifts(state, tiles, state.conflicts);
  const driftNext = new Set(); // drifts will be there on the coming step
  const driftNear = new Set(); // those cells and their neighbours
  for (const d of predicted) {
    driftNext.add(key(d.x, d.y));
    for (const [dx, dy] of NEIGHBOURS) driftNear.add(key(d.x + dx, d.y + dy));
  }
  // A drift that keeps its cell for the next step still blocks it; the
  // cell a leaving drift vacates is safe to walk into (§6 step 12).
  const driftStay = new Set(state.drifts.map((d) => key(d.x, d.y)));
  for (const d of predicted) driftStay.delete(key(d.x, d.y));
  const conflictAt = new Set(state.conflicts.map((c) => key(c.x, c.y)));

  // Target cells of each goal, as sets of `x,y` keys.
  const patchCells = new Set(state.patches.map((p) => key(p.x, p.y)));
  const pads = new Set();
  const exits = new Set();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = terrain(tiles, x, y);
      if (t === "M") pads.add(key(x, y));
      if (t === "X") exits.add(key(x, y));
    }
  }

  // Breadth-first search to the nearest target cell. Neighbours are
  // checked in a fixed order (up, right, down, left), so the path chosen
  // is deterministic. Strictness:
  //   0 — cells a drift can reach on the next step, and their
  //       neighbours, are avoided on top of the base rules below;
  //   1 — base rules only;
  //   2 — the base rules, but carrying may cross a merge pad.
  // The base rules: walls, closed holds and exits, conflict cells,
  // drift cells that will be or stay occupied, and pads crossed while
  // carrying that are not the destination.
  const search = (targets, strict) => {
    const parent = new Map([[start, start]]);
    const frontier = [start];
    for (let head = 0; head < frontier.length; head++) {
      const cell = frontier[head];
      if (targets.has(cell) && cell !== start) {
        let step = cell;
        while (parent.get(step) !== start) step = parent.get(step);
        const [fx, fy] = step.split(",").map(Number);
        for (const name of Object.keys(DIRS)) {
          const [dx, dy] = DIRS[name];
          if (key(state.player.x + dx, state.player.y + dy) === key(fx, fy)) {
            return { move: name, pause: false };
          }
        }
        return { ...NONE };
      }
      const [x, y] = cell.split(",").map(Number);
      for (const name of CLOCKWISE) {
        const nx = x + DIRS[name][0];
        const ny = y + DIRS[name][1];
        const cellKey = key(nx, ny);
        if (parent.has(cellKey)) continue;
        const t = terrain(tiles, nx, ny);
        if (t === "#") continue;
        if ((t === "H" || t === "X") && !open) continue;
        if (t === "M" && carrying > 0 && !targets.has(cellKey) && strict < 2) continue;
        if (conflictAt.has(cellKey)) continue;
        if (driftNext.has(cellKey) || driftStay.has(cellKey)) continue;
        if (strict === 0 && driftNear.has(cellKey)) continue;
        parent.set(cellKey, cell);
        frontier.push(cellKey);
      }
    }
    return null;
  };

  const probe = (targets) => search(targets, 0) ?? search(targets, 1) ?? search(targets, 2);

  if (!open) {
    if (carrying < CARRY_MAX && patchCells.size > 0) {
      const got = probe(patchCells);
      if (got) return got;
    }
    if (carrying > 0 && pads.size > 0) {
      const got = probe(pads);
      if (got) return got;
    }
    return { ...NONE };
  }

  // The quorum is open: ship the level from the exit.
  const got = probe(exits);
  if (got) return got;
  return { ...NONE };
}
