// The bot (DESIGN.md §9): a pure, deterministic autopilot that plays by
// the rules of §5 to §7. Each call replans from scratch.
//
// It reads a distance field from the player to choose a goal — a lying
// patch to fetch, a merge pad to unload on, or the exit once the quorum
// has opened it — and a second field from the goal to choose the one
// step. Where the two fields route through cells the drifts will stand
// on at the end of this step, a wider field accepts a riskier pass. The
// player never enters or stands on a cell a drift will occupy, and never
// walks into a wall, a closed hold or exit, or a live conflict.

import { CARRY_MAX, CLOCKWISE, DIRS } from './constants.js';

const FREE = -1;
const IDLE = { move: null, pause: false };

// The terrain character at a cell, or '#' anywhere off the map.
function tileAt(tiles, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return '#';
  return tiles[y][x] ?? '#';
}

// A breadth-first distance field from (sx, sy) over the player's
// passable grid, with `blocked` (cell keys) sealed off. Cells -1 steps
// away are unreachable.
function field(pass, width, height, sx, sy, blocked) {
  const dist = new Int32Array(width * height).fill(FREE);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  dist[sy * width + sx] = 0;
  queue[tail++] = sy * width + sx;
  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % width;
    const cy = (cur / width) | 0;
    const next = dist[cur] + 1;
    for (let i = 0; i < 4; i++) {
      const dir = CLOCKWISE[i];
      const nx = cx + DIRS[dir][0];
      const ny = cy + DIRS[dir][1];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (!pass(nx, ny)) continue;
      const key = ny * width + nx;
      if (dist[key] !== FREE || blocked.has(key)) continue;
      dist[key] = next;
      queue[tail++] = key;
    }
  }
  return dist;
}

// Where each drift will stand when this coming step ends, reading its
// clockwise-try rule out of §6 step 10. The player must not end or stay
// on one of these cells unless immune.
function driftEnds(state, level, width, height, blockedConf) {
  const ends = new Set();
  const moves = (state.tick + 1) % level.driftPeriod === 0;
  for (const d of state.drifts ?? []) {
    let x = d.x;
    let y = d.y;
    if (moves) {
      const start = Math.max(0, CLOCKWISE.indexOf(d.dir));
      for (let turn = 0; turn < 4; turn++) {
        const dir = CLOCKWISE[(start + turn) % 4];
        const nx = x + DIRS[dir][0];
        const ny = y + DIRS[dir][1];
        const tile = tileAt(level.tiles, width, height, nx, ny);
        if (tile === '#' || tile === 'H' || tile === 'X') continue;
        if (blockedConf.has(ny * width + nx)) continue;
        x = nx;
        y = ny;
        break;
      }
    }
    ends.add(y * width + x);
  }
  return ends;
}

export function botInput(state) {
  try {
    return plan(state);
  } catch {
    // A legal idle beats a crash, whatever the state turns out to hold.
    return IDLE;
  }
}

function plan(state) {
  if (!state || state.status !== 'playing') return IDLE;
  const level = state.level;
  const tiles = level?.tiles;
  if (!Array.isArray(tiles) || tiles.length === 0) return IDLE;
  const width = level.width;
  const height = level.height;
  if (!(width > 0 && height > 0)) return IDLE;
  const open = state.open === true;
  const immune = state.invuln > 0;

  // Conflicts that still block the coming step: the step ages them
  // before anything moves, so those at ttl 1 are already gone.
  const blockedConf = new Set();
  for (const c of state.conflicts ?? []) {
    if (Number.isInteger(c.ttl) && c.ttl >= 2) blockedConf.add(c.y * width + c.x);
  }

  // The cell must let the player through: no wall, no closed hold or
  // exit, no blocking conflict.
  const pass = (x, y) => {
    const tile = tileAt(tiles, width, height, x, y);
    if (tile === '#' || ((tile === 'H' || tile === 'X') && !open)) return false;
    return !blockedConf.has(y * width + x);
  };

  const player = state.player;
  const playerKey = player.y * width + player.x;

  // Two fields from the player: one keeps off the drifts' next cells,
  // one routes through anything when no safe way exists. Immunity opens
  // the whole grid.
  const ends = immune ? new Set() : driftEnds(state, level, width, height, blockedConf);
  const away = (x, y) => pass(x, y) && !ends.has(y * width + x);
  const tight = field(away, width, height, player.x, player.y, new Set());
  const loose = field(pass, width, height, player.x, player.y, new Set());

  // Distance to a cell key: the drift-safe route when there is one.
  const reach = (key) => (tight[key] >= 0 ? tight[key] : loose[key]);

  let pad = null;
  let padDist = Infinity;
  let exit = null;
  let exitDist = Infinity;
  for (let y = 0; y < height; y++) {
    const row = tiles[y];
    for (let x = 0; x < width; x++) {
      const tile = row[x];
      if (tile !== 'M' && tile !== 'X') continue;
      const dist = reach(y * width + x);
      if (dist < 0) continue;
      if (tile === 'M' && dist < padDist) {
        padDist = dist;
        pad = { x, y };
      }
      if (tile === 'X' && dist < exitDist) {
        exitDist = dist;
        exit = { x, y };
      }
    }
  }

  let patch = null;
  let patchDist = Infinity;
  for (const p of state.patches ?? []) {
    const dist = reach(p.y * width + p.x);
    if (dist >= 0 && dist < patchDist) {
      patchDist = dist;
      patch = p;
    }
  }

  const carried = (state.carried ?? []).length;
  const merges = state.merges ?? 0;
  const quorum = level.quorum;

  // Choose a goal: ship when the quorum is open, otherwise fetch and
  // merge. A full run of patches goes to the pad at once; so does the
  // handful that completes the quorum; otherwise the nearest errand
  // wins, patches first while the hands are empty.
  let goal = null;
  if (open && exit) goal = exit;
  else if (carried >= CARRY_MAX && pad) goal = pad;
  else if (carried > 0 && pad && merges + carried >= quorum) goal = pad;
  else if (carried < CARRY_MAX && patch && (carried === 0 || !pad || patchDist <= padDist)) {
    goal = { x: patch.x, y: patch.y };
  } else if (carried > 0 && pad) goal = pad;

  if (!goal) return IDLE;
  if (goal.x === player.x && goal.y === player.y) return IDLE;

  // A field from the goal: its value at a neighbour of the player is
  // that neighbour's distance to the goal. One step down from the
  // player's own distance is a step toward it.
  let toGoal = field(away, width, height, goal.x, goal.y, new Set());
  if (toGoal[playerKey] < 0) toGoal = field(pass, width, height, goal.x, goal.y, new Set());
  const homeDist = toGoal[playerKey];
  if (homeDist < 0) return IDLE;

  let forward = null;
  let escape = null;
  for (let i = 0; i < 4; i++) {
    const dir = CLOCKWISE[i];
    const nx = player.x + DIRS[dir][0];
    const ny = player.y + DIRS[dir][1];
    if (!pass(nx, ny)) continue;
    const key = ny * width + nx;
    const dist = toGoal[key];
    if (dist < 0) continue;
    const unsafe = !immune && ends.has(key);
    if (!unsafe && dist < homeDist && (forward === null || dist < forward.dist)) {
      forward = { dir, dist };
    }
    if (escape === null || unsafe < escape.unsafe || (unsafe === escape.unsafe && dist < escape.dist)) {
      escape = { dir, unsafe, dist };
    }
  }

  if (forward) return { move: forward.dir, pause: false };
  // No safe step toward the goal: hold the ground when it is safe, and
  // take the least dangerous way out when the drifts close in.
  if (!immune && ends.has(playerKey)) return escape ? { move: escape.dir, pause: false } : IDLE;
  return IDLE;
}
