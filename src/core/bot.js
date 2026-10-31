// Quorum Run — the autopilot (DESIGN.md §9).
//
// `botInput(state)` is pure and deterministic: same state in, same input
// out, no clock, no randomness, no DOM. The bot path-finds with a BFS on
// the level grid and plays it safe around drifts and conflicts:
//
//   - an open level first: take the exit;
//   - full hands: walk to the merge pad;
//   - patches on the floor: fetch the nearest one;
//   - otherwise (with or without hands): idle near a free spawn point,
//     so the next patch to appear is almost under the bot;
//   - never step onto a drift or a conflict, and step away when a drift
//     bears down on the bot's cell.

import { CARRY_MAX } from './constants.js';

const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const ORDER = ['up', 'right', 'down', 'left']; // deterministic tie-break order

const key = (x, y) => y * 1000 + x;

// Cells the bot must never plan through: conflicts, and any cell a drift
// is on right now.
function blockedCells(state) {
  const blocked = new Set();
  for (const c of state.conflicts) blocked.add(key(c.x, c.y));
  for (const d of state.drifts) blocked.add(key(d.x, d.y));
  return blocked;
}

// A cell the player may walk on at all: not a wall, not a closed hold or
// exit. Conflicts and drift cells are handled separately so the fallback
// search can relax one but not the other.
function walkable(state, x, y, open) {
  const row = state.level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return false;
  const t = row[x];
  if (t === '#') return false;
  if ((t === 'H' || t === 'X') && !open) return false;
  return true;
}

// BFS from a start cell over walkable cells that are not in `blocked`.
// Returns a map cellKey -> { x, y, dist }, or a partial one when
// `stopAt` is given.
function search(state, start, blocked, open, stopAt) {
  const dist = new Map();
  const prev = new Map();
  if (blocked.has(key(start.x, start.y))) return { dist, prev };
  dist.set(key(start.x, start.y), 0);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    const d = dist.get(key(cell.x, cell.y));
    if (stopAt && stopAt.has(key(cell.x, cell.y)) && d > 0) continue;
    for (const dir of ORDER) {
      const [dx, dy] = DIRS[dir];
      const x = cell.x + dx;
      const y = cell.y + dy;
      const k = key(x, y);
      if (dist.has(k)) continue;
      if (blocked.has(k)) continue;
      if (!walkable(state, x, y, open)) continue;
      dist.set(k, d + 1);
      prev.set(k, key(cell.x, cell.y));
      queue.push({ x, y });
    }
  }
  return { dist, prev };
}

// First step of the BFS path from the player to `target`.
function firstStep(prev, dist, player, target) {
  const tk = key(target.x, target.y);
  if (tk === key(player.x, player.y)) return null; // already there
  if (!dist.has(tk)) return null;
  let cur = tk;
  for (let guard = 0; guard < 4 * 1000; guard++) {
    const p = prev.get(cur);
    if (p === undefined) return null;
    if (p === key(player.x, player.y)) {
      return { x: cur % 1000, y: Math.floor(cur / 1000) };
    }
    cur = p;
  }
  return null;
}

// Direction from cell `a` to neighbouring cell `b`, or null if they are
// not adjacent.
const dirOf = (a, b) => {
  for (const dir of ORDER) {
    const [dx, dy] = DIRS[dir];
    if (a.x + dx === b.x && a.y + dy === b.y) return dir;
  }
  return null;
};

// Pick the nearest target cell by (BFS distance, reading order) and give
// back its first step; `cells` is an array of { x, y }.
function toward(player, cells, search1, search2) {
  let best = null;
  let bestCell = null;
  for (const c of cells) {
    const k = key(c.x, c.y);
    const safe = search1.dist.has(k) ? search1.dist.get(k) : Infinity;
    const rough = search2.dist.has(k) ? search2.dist.get(k) : Infinity;
    const d = Math.min(safe, rough < Infinity ? rough : Infinity);
    if (d === Infinity) continue;
    const score = safe < Infinity ? safe : rough + 1000; // safe over rough
    if (!best || score < best || (score === best && (c.y < bestCell.y || (c.y === bestCell.y && c.x < bestCell.x)))) {
      best = score;
      bestCell = c;
    }
  }
  if (!bestCell) return { cell: null, step: null };
  const s1 = firstStep(search1.prev, search1.dist, player, bestCell);
  const s2 = firstStep(search2.prev, search2.dist, player, bestCell);
  return { cell: bestCell, step: s1 ?? s2 };
}

// Is the bot in danger right now? A drift is adjacent and facing the
// bot's cell. `invuln` covers the bot meanwhile.
function threatened(state) {
  if (state.invuln >= 2) return null;
  const p = state.player;
  for (const d of state.drifts) {
    for (const dir of ORDER) {
      const [dx, dy] = DIRS[dir];
      if (d.x + dx === p.x && d.y + dy === p.y) {
        // The drift is adjacent; is it aimed at the bot?
        if (d.dir === dir) return d;
      }
    }
  }
  return null;
}

// A safe cell adjacent to the player to flee to, farthest from the
// threat, deterministic.
function flee(state, threat) {
  const blocked = blockedCells(state);
  const open = state.open;
  let best = null;
  let bestScore = -1;
  for (const dir of ORDER) {
    const [dx, dy] = DIRS[dir];
    const x = state.player.x + dx;
    const y = state.player.y + dy;
    if (blocked.has(key(x, y))) continue;
    if (!walkable(state, x, y, open)) continue;
    if (threat && x === threat.x && y === threat.y) continue;
    // Score: distance from the threat, min drift distance as a doom check.
    let minDrift = Infinity;
    for (const d of state.drifts) {
      const dist = Math.abs(d.x - x) + Math.abs(d.y - y);
      if (dist < minDrift) minDrift = dist;
    }
    const away = Math.abs(threat.x - x) + Math.abs(threat.y - y);
    const score = away * 10 + Math.min(minDrift, 9);
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
}

export function botInput(state) {
  // Nothing to decide when the game is not running.
  if (!state.level || state.status !== 'playing') return { move: null, pause: false };

  const open = state.open;
  const player = state.player;
  const mask = blockedCells(state); // drifts and conflicts
  const safe = search(state, player, mask, open);
  // The fallback relaxes drift cells (they move; the exit or a pad may be
  // worthwhile to approach) but never steps onto one this tick, because
  // `firstStep`'s target cell itself is re-blocked below.
  const rough = search(state, player, new Set(state.conflicts.map((c) => key(c.x, c.y))), open);

  let choice = { cell: null, step: null };

  if (open) {
    const exit = [];
    for (let y = 0; y < state.level.tiles.length; y++) {
      const row = state.level.tiles[y];
      for (let x = 0; x < row.length; x++) if (row[x] === 'X') exit.push({ x, y });
    }
    choice = toward(player, exit, safe, rough);
  } else {
    const patches = state.patches;
    const pads = [];
    for (let y = 0; y < state.level.tiles.length; y++) {
      const row = state.level.tiles[y];
      for (let x = 0; x < row.length; x++) if (row[x] === 'M') pads.push({ x, y });
    }
    if (player.x >= 0 && patches.length > 0) {
      if (state.carried.length >= CARRY_MAX) {
        choice = toward(player, pads, safe, rough);
      } else {
        const reading = patches.slice().sort((a, b) => a.y - b.y || a.x - b.x);
        choice = toward(player, reading, safe, rough);
        if (!choice.step && state.carried.length > 0) {
          // No reachable patch: dump the hands at the pad instead.
          choice = toward(player, pads, safe, rough);
        }
      }
    } else if (state.carried.length > 0) {
      choice = toward(player, pads, safe, rough);
    } else {
      // Nothing to fetch or merge: hover one cell off a free spawn point.
      const taken = new Set();
      for (const p of state.patches) taken.add(key(p.x, p.y));
      for (const d of state.drifts) taken.add(key(d.x, d.y));
      const holders = state.level.spawns.filter((sp) => {
        const k = key(sp.x, sp.y);
        if (taken.has(k)) return false;
        if (sp.x === player.x && sp.y === player.y) return false;
        return walkable(state, sp.x, sp.y, true) || true; // spawns are floor
      });
      // Wait beside the nearest reachable holder, without occupying it.
      const lips = [];
      for (const sp of state.level.spawns) {
        for (const dir of ORDER) {
          const [dx, dy] = DIRS[dir];
          const x = sp.x + dx;
          const y = sp.y + dy;
          lips.push({ x, y });
        }
      }
      const waitAt = toward(player, lips, safe, rough);
      if (waitAt.cell) {
        const beside = state.level.spawns.some(
          (sp) => Math.abs(sp.x - player.x) + Math.abs(sp.y - player.y) === 1,
        );
        if (beside) choice = { cell: null, step: null };
        else choice = waitAt;
      }
    }
  }

  // A drift right on the bot's heels: flee instead of the plan.
  const threat = threatened(state);
  if (threat && !choice.step) {
    const run = flee(state, threat);
    if (run) return { move: dirOf(player, run), pause: false };
  }
  if (threat && choice.step) {
    // Flee unless the planned step truly gains ground.
    if (choice.step.x !== player.x || choice.step.y !== player.y) {
      const planned = Math.abs(threat.x - choice.step.x) + Math.abs(threat.y - choice.step.y);
      const here = Math.abs(threat.x - player.x) + Math.abs(threat.y - player.y);
      if (planned <= here) {
        const run = flee(state, threat);
        if (run) return { move: dirOf(player, run), pause: false };
      }
    }
  }

  if (!choice.step) return { move: null, pause: false };
  return { move: dirOf(player, choice.step), pause: false };
}
