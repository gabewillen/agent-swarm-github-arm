// The bot (DESIGN.md §9): a pure, deterministic autopilot that plays
// Quorum Run - fetches patches, carries them to a merge pad, dodges
// drifts, and ships the level once the quorum opens. Nothing but state
// analysis: no game step, no clock, no DOM.

import { CARRY_MAX, CLOCKWISE, DIRS } from './constants.js';

export function botInput(state) {
  if (!state || state.status !== 'playing' || !state.level || !state.player) {
    return { move: null, pause: false };
  }
  const level = state.level;
  const width = level.width;
  const height = level.height;
  const tiles = level.tiles;

  const terrain = (x, y) => (x < 0 || x >= width || y < 0 || y >= height) ? '#' : tiles[y][x];
  const passable = (x, y) => {
    const t = terrain(x, y);
    if (t === '.' || t === 'M') return true;
    if (t === 'H' || t === 'X') return state.open === true;
    return false;
  };

  const conflicts = state.conflicts || [];
  const conflictAt = (x, y) => conflicts.some((c) => c.x === x && c.y === y);
  const patches = state.patches || [];
  const drifts = state.drifts || [];
  const player = state.player;

  // The map's points of interest.
  let exit = null;
  const pads = [];
  const spawns = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = terrain(x, y);
      if (t === 'X') exit = { x, y };
      if (t === 'M') pads.push({ x, y });
      if (t === 'P') spawns.push({ x, y });
    }
  }

  // Where to go: the exit once it is open, otherwise patches (while the
  // hands have room), otherwise a merge pad; with nothing to do, wait by
  // the nearest spawn point for the next patch.
  let targets = [];
  if (state.open) {
    targets = exit ? [exit] : [];
  } else if (state.carried.length >= CARRY_MAX) {
    targets = pads;
  } else if (patches.length > 0) {
    targets = patches;
  } else if (state.carried.length > 0) {
    targets = pads;
  } else if (spawns.length > 0) {
    targets = spawns;
  } else {
    return { move: null, pause: false };
  }

  // Breadth-first distances over cells that are passable to the player
  // and not blocked by a conflict; conflicts without a chance of passage
  // are re-admitted so a path never vanishes entirely.
  const blockedAt = (x, y) => !passable(x, y) || conflictAt(x, y);
  const bfs = (hard) => {
    const start = player.x + ',' + player.y;
    const dist = new Map([[start, 0]]);
    const prev = new Map();
    const queue = [[player.x, player.y]];
    const passNow = (x, y) => (hard ? !passable(x, y) || terrain(x, y) === '#' : blockedAt(x, y));
    while (queue.length) {
      const [x, y] = queue.shift();
      const d = dist.get(x + ',' + y);
      for (const dir of CLOCKWISE) {
        const nx = x + DIRS[dir][0];
        const ny = y + DIRS[dir][1];
        const key = nx + ',' + ny;
        if (dist.has(key) || passNow(nx, ny)) continue;
        dist.set(key, d + 1);
        prev.set(key, x + ',' + y);
        queue.push([nx, ny]);
      }
    }
    return { dist, prev, start };
  };

  // Drifts move deterministically, so their next cells are known: the
  // conflict block (ttl 1 ages away first) is mirrored for the phase of
  // the imminent step, kept only when that phase runs at all.
  let predicted = null;
  const phaseNow = level.driftPeriod > 0
    && (state.tick + 1) % level.driftPeriod === 0;
  if (phaseNow) {
    const kept = conflicts.filter((c) => c.ttl > 1);
    const keptAt = (x, y) => kept.some((c) => c.x === x && c.y === y);
    predicted = drifts.map((d) => {
      const at = CLOCKWISE.indexOf(d.dir) >= 0 ? CLOCKWISE.indexOf(d.dir) : 0;
      for (let i = 0; i < 4; i++) {
        const dir = CLOCKWISE[(at + i) % 4];
        const nx = d.x + DIRS[dir][0];
        const ny = d.y + DIRS[dir][1];
        const t = terrain(nx, ny);
        if (t !== '#' && t !== 'H' && t !== 'X' && !keptAt(nx, ny)) {
          return { x: nx, y: ny, pre: { x: d.x, y: d.y } };
        }
      }
      return { x: d.x, y: d.y, pre: { x: d.x, y: d.y } };
    });
  }

  // A cell is lethal to step into when a drift sits on it, would reach it
  // as the player arrives, or would swap into the player's back.
  const fatal = (x, y) => {
    if (conflictAt(x, y)) return true;
    if (drifts.some((d) => d.x === x && d.y === y)) return true;
    if (predicted) {
      if (predicted.some((d) => d.x === x && d.y === y)) return true;
      if (predicted.some((d) => d.pre.x === x && d.pre.y === y
        && d.x === player.x && d.y === player.y)) return true;
    }
    return false;
  };

  // The first move towards the nearest of the targets.
  let stepMove = null;
  for (const allowConflicts of [false, true]) {
    const { dist, prev, start } = bfs(allowConflicts);
    let best = null;
    for (const t of targets) {
      if (!t) continue;
      const d = dist.get(t.x + ',' + t.y);
      if (d !== undefined && (best === null || d < best.d
        || (d === best.d && t.x * width + t.y < best.x * width + best.y))) {
        best = { d, x: t.x, y: t.y };
      }
    }
    if (!best) continue;
    // walk the chain back to the cell the player should enter
    let key = best.x + ',' + best.y;
    let previous = prev.get(key);
    while (previous !== undefined && previous !== start) {
      key = previous;
      previous = prev.get(key);
    }
    const [tx, ty] = key.split(',').map(Number);
    for (const dir of CLOCKWISE) {
      if (player.x + DIRS[dir][0] === tx && player.y + DIRS[dir][1] === ty) {
        stepMove = dir;
        break;
      }
    }
    break;
  }

  // Own the plan first, then wait, then any safe step.
  const pool = [];
  if (stepMove) pool.push(stepMove);
  pool.push(null);
  for (const dir of CLOCKWISE) if (dir !== stepMove) pool.push(dir);
  for (const move of pool) {
    if (move === null || !fatal(player.x + DIRS[move][0], player.y + DIRS[move][1])) {
      return { move, pause: false };
    }
  }
  // Cornered: stay; a dropped patch beats nothing at all.
  return { move: null, pause: false };
}
