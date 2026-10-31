// The autopilot (DESIGN.md §9): botInput(state) returns an input
// { move, pause: false } for the state. It is pure and deterministic —
// no randomness, no clock, no DOM, and it never changes the state it is
// given. It paths over the grid with a breadth-first search, plays safe
// around drifts and conflicts, and plays well: fetch patches, merge
// them full-handed, and take the exit once the quorum is reached.

import { DIRS } from './constants.js';
import { tileAt } from './game.js';

const ORDER = ['up', 'right', 'down', 'left'];
const CARRY_MAX = 3;
const key = (x, y) => `${x},${y}`;
// Cell offsets to the input that steps there.
const STEP_DIR = { '0,-1': 'up', '0,1': 'down', '-1,0': 'left', '1,0': 'right' };

// Whether a cell can hold a drift (they never enter holds or exits).
function driftPassable(state, x, y) {
  const t = tileAt(state, x, y);
  return t !== '#' && t !== 'H' && t !== 'X';
}

// A breadth-first search from start to any cell in targets, whose steps
// never land on a blocked cell. Returns the first move toward the
// nearest reachable target, null when start is already on a target, and
// undefined when no target is reachable.
function bfs(state, start, targets, blocked) {
  const startKey = key(start.x, start.y);
  if (targets.has(startKey)) return null;
  const level = state.level;
  const prev = new Map();
  prev.set(startKey, null);
  let frontier = [start];
  while (frontier.length > 0) {
    const next = [];
    for (const c of frontier) {
      for (const dir of ORDER) {
        const [dx, dy] = DIRS[dir];
        const x = c.x + dx;
        const y = c.y + dy;
        const k = key(x, y);
        if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
        if (prev.has(k)) continue;
        if (blocked.has(k)) continue;
        // Cells the player can stand on: never a wall, and holds and the
        // exit only once the level is open.
        const t = tileAt(state, x, y);
        if (t === '#' || ((t === 'H' || t === 'X') && !state.open)) continue;
        prev.set(k, c);
        if (targets.has(k)) {
          // Walk the recorded path back to the start's neighbour.
          let cell = { x, y };
          let parent = prev.get(`${cell.x},${cell.y}`);
          while (!(parent.x === start.x && parent.y === start.y)) {
            cell = parent;
            parent = prev.get(`${parent.x},${parent.y}`);
          }
          return STEP_DIR[`${cell.x - start.x},${cell.y - start.y}`];
        }
        next.push({ x, y });
      }
    }
    frontier = next;
  }
  return undefined;
}

// Every cell the level holds, flattened to keys, that passes `keep`.
function scanCells(state, keep) {
  const out = new Set();
  const level = state.level;
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (keep(x, y, tileAt(state, x, y))) out.add(key(x, y));
    }
  }
  return out;
}

// Cells a drift might occupy after the next drift tick: its own cell,
// and on a moving tick every neighbour it could turn into.
function driftReach(state) {
  const out = new Set();
  const movingNext = ((state.tick + 1) % state.level.driftPeriod) === 0;
  for (const d of state.drifts) {
    out.add(key(d.x, d.y));
    if (!movingNext) continue;
    for (const dir of ORDER) {
      const [dx, dy] = DIRS[dir];
      const x = d.x + dx;
      const y = d.y + dy;
      if (driftPassable(state, x, y)) out.add(key(x, y));
    }
  }
  return out;
}

// What the bot wants right now, as an ordered list of target sets.
function goals(state) {
  const pads = scanCells(state, (_x, _y, t) => t === 'M');
  if (state.open) return [scanCells(state, (_x, _y, t) => t === 'X')];
  if (state.carried.length >= CARRY_MAX) return [pads];
  const patches = scanCells(state, (x, y, _t) => state.patches.some((p) => p.x === x && p.y === y));
  if (state.carried.length > 0) return [patches, pads];
  return [patches];
}

// botInput: the rules want one cell of progress per tick toward the
// current goal, across a planned route.
export function botInput(state) {
  const conflicts = new Set(state.conflicts.map((c) => key(c.x, c.y)));
  const driftNow = new Set(state.drifts.map((d) => key(d.x, d.y)));
  const reach = driftReach(state);
  const stay = { move: null, pause: false };

  // Landing cells by risk: a safe route never lands where a drift may
  // stand or arrive, or on a conflict; a risky route still never lands
  // on a drift or a conflict.
  const layers = [
    new Set([...conflicts, ...driftNow, ...reach]),
    new Set([...conflicts, ...driftNow]),
  ];
  const here = key(state.player.x, state.player.y);

  for (const targets of goals(state)) {
    for (const blocked of layers) {
      const move = bfs(state, state.player, targets, blocked);
      if (typeof move === 'string') return { move, pause: false };
      if (move === null) return stay;
    }
  }

  // Nothing is reachable: hold position if it is safe, else take the
  // nearest safe cell, else the nearest cell that is not occupied.
  for (const blocked of layers) {
    if (!blocked.has(here)) return stay;
    const freedom = scanCells(state, (x, y, t) => t !== '#');
    for (const blockedCell of blocked) freedom.delete(blockedCell);
    const move = bfs(state, state.player, freedom, blocked);
    if (typeof move === 'string') return { move, pause: false };
  }
  return stay;
}
