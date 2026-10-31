// §9: an autopilot. Pure and deterministic: it plans over the level's
// static grid with distance fields, then checks each candidate move with
// a real step() and prefers the safe, progressing one.

import { CARRY_MAX, DIRS } from './constants.js';
import { step } from './game.js';

const MOVES = ['up', 'right', 'down', 'left'];

function passable(terrain, open) {
  return terrain === '.' || terrain === 'M' || ((terrain === 'H' || terrain === 'X') && open);
}

// BFS distances over player-passable cells from a set of seeds.
function field(level, open, seeds) {
  const w = level.width;
  const h = level.height;
  const dist = new Int32Array(w * h).fill(-1);
  const queue = [];
  const push = (x, y, d) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    if (!passable(level.tiles[y][x], open)) return;
    const i = y * w + x;
    if (dist[i] !== -1) return;
    dist[i] = d;
    queue.push(i);
  };
  for (const s of seeds) push(s.x, s.y, 0);
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % w;
    const y = (i - x) / w;
    for (const name of MOVES) {
      push(x + DIRS[name][0], y + DIRS[name][1], dist[i] + 1);
    }
  }
  return { dist, w };
}

function cellsOf(level, terrain, open) {
  const found = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (level.tiles[y][x] === terrain) {
        if (passable(terrain, open) || terrain === 'M' || terrain === '.') found.push({ x, y });
      }
    }
  }
  return found;
}

function neighbors(level, open, cell) {
  const out = [];
  for (const name of MOVES) {
    const x = cell.x + DIRS[name][0];
    const y = cell.y + DIRS[name][1];
    if (x >= 0 && y >= 0 && x < level.width && y < level.height
      && passable(level.tiles[y][x], open)) {
      out.push({ x, y });
    }
  }
  return out;
}

// Picks what the bot should head for: patches, pads, the exit, or a spot
// beside a spawn point to wait for one.
function goalFor(state) {
  const open = state.open;
  const level = state.level;
  const startField = field(level, open, [state.player]);
  const at = (cell) => startField.dist[cell.y * startField.w + cell.x];
  const dist = (cell) => at(cell);

  const pads = cellsOf(level, 'M', open);
  const exit = cellsOf(level, 'X', open)[0];
  const reachable = (cell) => cell !== undefined && at(cell) !== -1;

  // Full hands go merge; open and empty hands go ship.
  if (state.carried.length >= CARRY_MAX) {
    const pad = pads.filter(reachable).sort((a, b) => at(a) - at(b))[0];
    if (pad) return pad;
  }
  if (open && state.carried.length === 0 && reachable(exit)) return exit;

  const lying = state.patches.filter(reachable);
  if (lying.length > 0) {
    return lying.sort((a, b) => at(a) - at(b))[0];
  }
  if (state.carried.length > 0) {
    const pad = pads.filter(reachable).sort((a, b) => at(a) - at(b))[0];
    if (pad) return pad;
  }

  // Nothing to fetch and nothing to merge: camp beside a spawn point.
  const occupied = new Set(state.patches.map((p) => p.x + ',' + p.y));
  let best = null;
  let bestDistance = Infinity;
  for (const spawn of level.spawns) {
    if (occupied.has(spawn.x + ',' + spawn.y)) continue;
    if (at(spawn) === -1) continue;
    for (const spot of neighbors(level, open, spawn)) {
      const d = at(spot);
      if (d !== -1 && d < bestDistance) {
        best = spot;
        bestDistance = d;
      }
    }
  }
  if (best) return best;

  if (reachable(exit)) return exit;
  return state.player;
}

export function botInput(state) {
  if (state.status !== 'playing') return { move: null, pause: false };
  const goal = goalFor(state);
  const { dist, w } = field(state.level, state.open, [goal]);
  const distance = (cell) => dist[cell.y * w + cell.x];

  let bestMove = null;
  let bestScore = Infinity;
  for (const move of [null, ...MOVES]) {
    const next = step(state, { move, pause: false });
    const d = distance(next.player);
    let score;
    if (next.events.includes('lost')) {
      score = 1000000;
    } else if (next.events.includes('level') || next.status === 'won') {
      score = -1000; // shipping a level or winning is always the best step
    } else if (d === -1) {
      score = 2000;
    } else {
      score = d * 4;
    }
    if (next.events.includes('hit')) score += 500;
    if (next.events.includes('drop')) score += 260;
    if (move === null) score += 3;
    if (score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return { move: bestMove, pause: false };
}
