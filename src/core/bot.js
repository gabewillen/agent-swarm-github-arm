// The autopilot (DESIGN.md §9). `botInput(state)` returns an input
// `{ move, pause: false }` for the state: pure, deterministic, and
// free of the DOM and of every non-seeded source of chance. It plays
// well by breadth-first route finding: fetch patches, hand full hands
// to a merge pad, take the open exit, and keep out of the drifts' reach
// with a small time margin, falling back to a bolder route when the
// careful one is closed.

import { CARRY_MAX, DIRS } from './constants.js';

// How many of a drift's moves the threat map reaches ahead of the bot.
const THREAT_MOVES = 6;

const key = (x, y) => `${x},${y}`;

// The terrain character at a cell, or '#' outside the map.
function tileOf(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined) return '#';
  return row[x] ?? '#';
}

// Whether the player may stand on the cell: walls and closed holds and
// the closed exit are out, and so are cells under a conflict.
function passPlayer(state, x, y) {
  const tile = tileOf(state, x, y);
  if (tile === '#') return false;
  if ((tile === 'H' || tile === 'X') && !state.open) return false;
  return !state.conflicts.some((c) => c.x === x && c.y === y);
}

// Whether a drift may stand on the cell, ignoring conflicts: they expire,
// so the estimate errs on the side of more threat, never less.
function driftPassable(x, y, tiles) {
  const row = tiles[y];
  if (row === undefined) return false;
  const tile = row[x] ?? '#';
  return tile !== '#' && tile !== 'H' && tile !== 'X';
}

// threat[j] is the set of cells a drift could stand on after at most j of
// its moves, grown layer by layer from where today's drifts stand.
function threatLayers(state, maxMoves) {
  const tiles = state.level.tiles;
  const first = new Set(state.drifts.map((d) => key(d.x, d.y)));
  const layers = [first];
  for (let j = 1; j <= maxMoves; j++) {
    const layer = new Set(layers[j - 1]);
    for (const k of layers[j - 1]) {
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = x + dx;
        const ny = y + dy;
        if (driftPassable(nx, ny, tiles) && !layer.has(key(nx, ny))) {
          layer.add(key(nx, ny));
        }
      }
    }
    layers.push(layer);
  }
  return layers;
}

// The threat layer for a cell the bot would reach after k of its moves:
// how many drift periods have passed by then, one more as margin.
function layerFor(state, k, maxMoves) {
  const driftMoves = Math.floor((state.tick + k) / state.level.driftPeriod)
    - Math.floor(state.tick / state.level.driftPeriod) + 1;
  return Math.min(maxMoves, Math.max(0, driftMoves));
}

// Breadth-first route to one cell; returns `{ move, len }` for the first
// step of the shortest route, or null. With `careful` it refuses cells
// the drifts could occupy by the time of arrival.
function walk(state, to, threats, maxMoves, careful) {
  const from = state.player;
  if (from.x === to.x && from.y === to.y) return null;
  const seen = new Set([key(from.x, from.y)]);
  let frontier = [{ x: from.x, y: from.y, first: null }];
  for (let k = 1; frontier.length > 0; k++) {
    const no = careful ? threats[layerFor(state, k, maxMoves)] : null;
    const next = [];
    for (const cur of frontier) {
      for (const [move, [dx, dy]] of Object.entries(DIRS)) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const k2 = key(nx, ny);
        if (seen.has(k2)) continue;
        if (!passPlayer(state, nx, ny)) continue;
        if (no !== null && no.has(k2)) continue;
        if (nx === to.x && ny === to.y) {
          return { move: cur.first ?? move, len: k };
        }
        seen.add(k2);
        next.push({ x: nx, y: ny, first: cur.first ?? move });
      }
    }
    frontier = next;
  }
  return null;
}

// The nearest reachable cell whose terrain is one of the characters.
function cellsOf(state, chars) {
  const out = [];
  const tiles = state.level.tiles;
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      if (chars.includes(tiles[y][x])) out.push({ x, y });
    }
  }
  return out;
}

// Nearest target: careful routes first, bold ones only when no careful
// route reaches any target.
function nearest(state, targets, threats, maxMoves) {
  let best = null;
  for (const cell of targets) {
    const path = walk(state, cell, threats, maxMoves, true);
    if (path && (!best || path.len < best.len)) best = path;
  }
  if (!best) {
    for (const cell of targets) {
      const path = walk(state, cell, threats, maxMoves, false);
      if (path && (!best || path.len < best.len)) best = path;
    }
  }
  return best;
}

// With nothing to fetch or merge, gather on the nearest pad; when a drift
// closes in, first step to a cell it cannot reach next.
function idleMove(state, threats, maxMoves) {
  const me = state.player;
  const ifThreatened = threats[layerFor(state, 0, maxMoves)];
  if (!ifThreatened.has(key(me.x, me.y))) {
    const pads = cellsOf(state, ['M']);
    const spot = nearest(state, pads, threats, maxMoves);
    return spot ? spot.move : null;
  }
  for (const [move, [dx, dy]] of Object.entries(DIRS)) {
    const nx = me.x + dx;
    const ny = me.y + dy;
    if (passPlayer(state, nx, ny) && !ifThreatened.has(key(nx, ny))) {
      return move;
    }
  }
  return null;
}

// The input for one state: patches first, then the pad, then the open
// exit, and never a pause.
export function botInput(state) {
  if (!state || state.status !== 'playing' || state.paused) {
    return { move: null, pause: false };
  }
  const threats = threatLayers(state, THREAT_MOVES);
  const pick = (cells) => nearest(state, cells, threats, THREAT_MOVES);
  const pads = cellsOf(state, ['M']);

  let choice = null;
  if (state.open) {
    choice = pick(cellsOf(state, ['X']));
  }
  if (!choice && state.carried.length >= CARRY_MAX) {
    choice = pick(pads);
  }
  if (!choice && state.carried.length > 0
    && state.carried.length + state.merges >= state.level.quorum) {
    choice = pick(pads);
  }
  if (!choice && state.carried.length < CARRY_MAX && state.patches.length > 0) {
    choice = pick(state.patches.map((p) => ({ x: p.x, y: p.y })));
  }
  if (!choice && state.carried.length > 0) {
    choice = pick(pads);
  }
  const move = choice ? choice.move : idleMove(state, threats, THREAT_MOVES);
  return { move: move ?? null, pause: false };
}
