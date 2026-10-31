// Quorum Run — the bot: an autopilot that plays by the same rules as the
// player (DESIGN.md §9). Pure and deterministic: it reads a state and
// answers with one input, never touching the PRNG, the clock, or the DOM.
//
// Strategy: head for the nearest patch, carry up to a full hand so short
// trips earn more, merge at the nearest pad, and take the exit once the
// quorum opens it. Routes come from breadth-first searches that dodge the
// cells drifts could reach within a couple of ticks when a calm route
// exists, and walk through when none does.

import { CARRY_MAX } from './constants.js';

const DIRS = ['up', 'right', 'down', 'left'];
const DXY = [
  [0, -1], // up
  [1, 0], // right
  [0, 1], // down
  [-1, 0], // left
];

// How many cells of warning a drift's surroundings get.
const LOOKAHEAD = 2;

// A breadth-first route over the grid. Marks are the cells worth
// reaching; blocked are the cells the route may not enter. Gated tiles
// (a hold or the exit) only pass when the quorum has opened them.
// Returns { dist, first }: the distance to the nearest mark and the
// first move's direction index, or { dist: -1, first: -1 } with no route.
function find(width, height, tiles, start, marks, blocked, open) {
  const nonRoute = { dist: -1, first: -1 };
  const si = start.y * width + start.x;
  if (si < 0 || si >= width * height) return nonRoute;
  const n = width * height;
  const seen = new Uint8Array(n);
  const first = new Int8Array(n).fill(-1);
  const dist = new Int32Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  seen[si] = 1;
  queue[tail++] = si;
  while (head < tail) {
    const i = queue[head++];
    if (marks[i]) return { dist: dist[i], first: first[i] };
    const x = i % width;
    const y = (i / width) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DXY[d][0];
      const ny = y + DXY[d][1];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (seen[j] || blocked[j]) continue;
      const ch = tiles[ny][nx];
      if (ch === '#') continue;
      if ((ch === 'H' || ch === 'X') && !open) continue;
      seen[j] = 1;
      dist[j] = dist[i] + 1;
      first[j] = first[i] === -1 ? d : first[i];
      queue[tail++] = j;
    }
  }
  return nonRoute;
}

// The cells a drift could plausibly stand on soon: a flood of about
// LOOKAHEAD steps from each drift through non-wall tiles.
function driftRisk(tiles, width, height, drifts) {
  const risk = new Uint8Array(width * height);
  if (!drifts || drifts.length === 0) return risk;
  for (const d of drifts) {
    if (d.x < 0 || d.y < 0 || d.x >= width || d.y >= height) continue;
    if (tiles[d.y][d.x] === '#') continue;
    if (risk[d.y * width + d.x]) continue;
    let frontier = [d.y * width + d.x];
    risk[frontier[0]] = 1;
    for (let depth = 0; depth < LOOKAHEAD && frontier.length > 0; depth++) {
      const next = [];
      for (const i of frontier) {
        const x = i % width;
        const y = (i / width) | 0;
        for (let k = 0; k < 4; k++) {
          const nx = x + DXY[k][0];
          const ny = y + DXY[k][1];
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (tiles[ny][nx] === '#') continue;
          const j = ny * width + nx;
          if (risk[j]) continue;
          risk[j] = 1;
          next.push(j);
        }
      }
      frontier = next;
    }
  }
  return risk;
}

// botInput(state) decides one move: fetch patches, merge them, dodge
// drifts, take the exit once it is open.
export function botInput(state) {
  const noMove = { move: null, pause: false };
  if (!state || state.status !== 'playing' || !state.level || !state.player) return noMove;
  const level = state.level;
  const width = level.width;
  const height = level.height;
  const tiles = level.tiles;
  if (!width || !height || !tiles || tiles.length !== height) return noMove;
  const player = state.player;
  if (player.x < 0 || player.y < 0 || player.x >= width || player.y >= height) return noMove;

  const open = state.open === true;
  const carried = Array.isArray(state.carried) ? state.carried.length : 0;
  const n = width * height;

  // Cells nobody should enter right now: conflicts block outright, and
  // the cells under every drift are a contact hit.
  const hard = new Uint8Array(n);
  if (state.conflicts) {
    for (const c of state.conflicts) {
      if (c.x >= 0 && c.y >= 0 && c.x < width && c.y < height) hard[c.y * width + c.x] = 1;
    }
  }
  const driftAt = new Uint8Array(n);
  if (state.drifts) {
    for (const d of state.drifts) {
      if (d.x >= 0 && d.y >= 0 && d.x < width && d.y < height) driftAt[d.y * width + d.x] = 1;
    }
  }
  const risky = new Uint8Array(n);
  const soft = driftRisk(tiles, width, height, state.drifts);
  for (let i = 0; i < n; i++) risky[i] = hard[i] || driftAt[i] || soft[i] ? 1 : 0;

  // Targets: patches at their spawn cells, merge pads, and the exit.
  const patches = new Uint8Array(n);
  if (state.patches) {
    for (const p of state.patches) {
      if (p.x >= 0 && p.y >= 0 && p.x < width && p.y < height) patches[p.y * width + p.x] = 1;
    }
  }
  const pads = new Uint8Array(n);
  const exits = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    const row = tiles[y];
    for (let x = 0; x < width; x++) {
      if (row[x] === 'M') pads[y * width + x] = 1;
      else if (row[x] === 'X') exits[y * width + x] = 1;
    }
  }

  // Routes: prefer a calm one that stays out of the risk flood, but take
  // any route when there is no calm way through.
  const plainCache = new Map();
  const safeCache = new Map();
  const plain = (marks) => {
    if (!plainCache.has(marks)) plainCache.set(marks, find(width, height, tiles, player, marks, hard, open));
    return plainCache.get(marks);
  };
  const safe = (marks) => {
    if (!safeCache.has(marks)) safeCache.set(marks, find(width, height, tiles, player, marks, risky, open));
    return safeCache.get(marks);
  };
  const moveTo = (marks) => {
    const calm = safe(marks);
    if (calm.first >= 0) return DIRS[calm.first];
    const any = plain(marks);
    if (any.first >= 0) return DIRS[any.first];
    return null;
  };

  // Note the hard cells in the plain route too: never step onto a drift.
  // Above, `hard` holds conflicts; fold drift cells into it now that the
  // risk flood has been computed, so both route grades avoid them.
  for (let i = 0; i < n; i++) hard[i] = hard[i] || driftAt[i] ? 1 : 0;

  let plan = null;
  if (open) {
    plan = moveTo(exits);
    if (plan === null) plan = moveTo(patches) ?? moveTo(pads);
  } else if (carried >= CARRY_MAX) {
    plan = moveTo(pads);
  } else if (carried === 0) {
    plan = moveTo(patches) ?? moveTo(pads);
  } else {
    // One or two in hand: fetch another only when it is strictly closer
    // than the nearest pad, so every trip earns a fuller merge.
    const dPad = plain(pads).dist;
    const dPatch = plain(patches).dist;
    if (dPatch >= 0 && (dPad < 0 || dPatch < dPad)) plan = moveTo(patches) ?? moveTo(pads);
    else plan = moveTo(pads);
  }
  return plan === null ? noMove : { move: plan, pause: false };
}
