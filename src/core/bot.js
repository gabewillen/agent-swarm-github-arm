// The autopilot (DESIGN.md §9): a pure, deterministic bot. It reads only
// the state it is given — no randomness, no clocks, no DOM.
//
// Strategy, in order: head for the open exit; with full hands or no
// patch ahead, carry what we hold to the nearest merge pad; otherwise go
// fetch the nearest reachable patch (a pad at least as close wins, so a
// held patch merges early). A breadth-first search over the grid picks
// each route. A one-step drift forecast then vetoes steps that end on a
// drift: the bot waits or sidesteps instead of trading a cell.

import { CARRY_MAX, CLOCKWISE, DIRS } from './constants.js';

const NONE = { move: null, pause: false };
const CW = CLOCKWISE; // ['up', 'right', 'down', 'left']

function terrain(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

// Conflict cells at ttl >= minTtl still exist when the next step's move
// resolves (a conflict at ttl 1 ages away during the step that follows).
function conflictBlock(state, minTtl) {
  const block = new Map();
  for (const c of state.conflicts) if (c.ttl >= minTtl) block.set(`${c.x},${c.y}`, c.ttl);
  return block;
}

function passableForPlayer(state, x, y, blocked) {
  const t = terrain(state, x, y);
  if (t === '#') return false;
  if (t === 'H' && !state.open) return false;
  if (t === 'X' && !state.open) return false;
  return !blocked.has(`${x},${y}`);
}

function passableForDrift(state, x, y, blocked) {
  const t = terrain(state, x, y);
  if (t === '#' || t === 'H' || t === 'X') return false;
  return !blocked.has(`${x},${y}`);
}

// Where each drift will stand when the next step's drift phase ends: on
// a moving tick it turns clockwise from its own direction until a
// passable cell appears, otherwise it stays put.
function driftForecast(state, blocked) {
  const willMove = (state.tick + 1) % state.level.driftPeriod === 0;
  const out = [];
  for (const d of state.drifts) {
    let to = `${d.x},${d.y}`;
    if (willMove) {
      const start = CW.indexOf(d.dir);
      for (let i = 0; i < CW.length; i++) {
        const dir = CW[(start + i) % CW.length];
        const [dx, dy] = DIRS[dir];
        if (passableForDrift(state, d.x + dx, d.y + dy, blocked)) {
          to = `${d.x + dx},${d.y + dy}`;
          break;
        }
      }
    }
    out.push({ from: `${d.x},${d.y}`, to });
  }
  return out;
}

// Breadth-first search from the player to the nearest goal cell (goals
// is a Set of 'x,y' keys). Returns { move, dist } — move null when the
// player already stands on a goal — or undefined when no route exists.
function routeToward(state, blocked, goals) {
  const player = state.player;
  const startKey = `${player.x},${player.y}`;
  if (goals.has(startKey)) return { move: null, dist: 0 };
  const parent = new Map([[startKey, null]]);
  let frontier = [startKey];
  for (let dist = 1; dist < 512 && frontier.length; dist++) {
    const next = [];
    for (const key of frontier) {
      const [px, py] = key.split(',').map(Number);
      for (const dir of CW) {
        const [dx, dy] = DIRS[dir];
        const x = px + dx;
        const y = py + dy;
        const cell = `${x},${y}`;
        if (parent.has(cell) || !passableForPlayer(state, x, y, blocked)) continue;
        parent.set(cell, { key, dir });
        if (goals.has(cell)) {
          let step = { key, dir };
          while (parent.get(step.key) !== null) step = parent.get(step.key);
          return { move: step.dir, dist };
        }
        next.push(cell);
      }
    }
    frontier = next;
  }
  return undefined;
}

// Does ending this step on the cell `move` leads to (null: staying)
// leave the player untouched, given the drift forecast?
function safeStep(state, blockAll, forecast, move) {
  const player = state.player;
  const here = `${player.x},${player.y}`;
  let to = here;
  if (move !== null) {
    const [dx, dy] = DIRS[move];
    if (!passableForPlayer(state, player.x + dx, player.y + dy, blockAll)) return false;
    to = `${player.x + dx},${player.y + dy}`;
  }
  for (const f of forecast) {
    if (move === null) {
      if (f.to === here && f.from !== here) return false; // a drift walks onto the standing player
      if (f.from === here && f.to === here) return false; // a drift is stuck on the player
    } else if (f.to === to) return false;                 // a drift arrives (or sits) in the target cell
    else if (f.from === to && f.to === here) return false; // a drift and the player swap cells
  }
  return true;
}

export function botInput(state) {
  if (state.status !== 'playing' || state.paused) return NONE;

  const blockNext = conflictBlock(state, 2);
  const patches = new Set(state.patches.map((p) => `${p.x},${p.y}`));
  const pads = new Set();
  const exits = new Set();
  for (let y = 0; y < state.level.tiles.length; y++) {
    for (let x = 0; x < state.level.tiles[y].length; x++) {
      const t = state.level.tiles[y][x];
      if (t === 'M') pads.add(`${x},${y}`);
      else if (t === 'X') exits.add(`${x},${y}`);
    }
  }

  let move;
  if (state.open) {
    move = routeToward(state, blockNext, exits)?.move ?? null;
  } else if (state.carried.length >= CARRY_MAX) {
    move = routeToward(state, blockNext, pads)?.move ?? null;
  } else {
    const patch = routeToward(state, blockNext, patches);
    const pad = routeToward(state, blockNext, pads);
    if (patch === undefined) {
      move = pad ? pad.move : null; // no patch ahead: merge what we hold, else wait
    } else if (state.carried.length === 0) {
      move = patch.move;
    } else {
      move = pad && pad.dist <= patch.dist ? pad.move : patch.move;
    }
  }

  // Drift dodge: take the route when it is safe, else wait if waiting is
  // safe, else take any safe sidestep in clockwise order, else commit to
  // the route and hope.
  const forecast = driftForecast(state, blockNext);
  const candidates = [];
  if (move !== null) candidates.push(move);
  candidates.push(null);
  for (const dir of CW) {
    if (dir === move || candidates.includes(dir)) continue;
    const [dx, dy] = DIRS[dir];
    if (passableForPlayer(state, state.player.x + dx, state.player.y + dy, blockNext)) candidates.push(dir);
  }
  for (const candidate of candidates) {
    if (safeStep(state, blockNext, forecast, candidate)) return { move: candidate, pause: false };
  }
  return { move, pause: false };
}
