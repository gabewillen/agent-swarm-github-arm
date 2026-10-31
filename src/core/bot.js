// The autopilot of Quorum Run (DESIGN.md §9): one pure call per state,
// `{ move, pause: false }`. It plans over the grid with breadth-first
// searches rooted at what it wants — a patch, a merge pad, the exit —
// banks carried patches, never plans onto a drift or a conflict, and on
// the ticks drifts move it steps around the cells they will occupy. No
// randomness, no clock: two calls on the same state answer the same.

import { CARRY_MAX, DIRS, CLOCKWISE } from './constants.js';

const NIL = { move: null, pause: false };

// The terrain character at a level cell, '#' off the map.
function terrain(level, x, y) {
  const row = level.tiles ? level.tiles[y] : undefined;
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

// Player passability (§6 step 6): walls never, the hold door and the
// exit only once the level is open. Pads and floor are fine.
function playerBlocked(level, x, y, doorsOpen) {
  const t = terrain(level, x, y);
  if (t === '#') return true;
  if (!doorsOpen && (t === 'H' || t === 'X')) return true;
  return false;
}

// Breadth-first distances from a set of source cells to every cell the
// player could step on. Walls, closed doors, conflicts, and the drifts'
// cells are impassable. Result: an array over y * width + x, -1 when
// unreachable, 0 at a source.
function distances(level, sources, doorsOpen, conflicts, driftCells) {
  const w = level.width;
  const h = level.height;
  const dist = new Array(w * h).fill(-1);
  const blocked = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return true;
    if (playerBlocked(level, x, y, doorsOpen)) return true;
    if (conflicts.has(y * w + x)) return true;
    if (driftCells.has(y * w + x)) return true;
    return false;
  };
  const queue = [];
  for (const s of sources) {
    if (s.x < 0 || s.y < 0 || s.x >= w || s.y >= h) continue;
    if (blocked(s.x, s.y)) continue;
    const k = s.y * w + s.x;
    if (dist[k] === -1) {
      dist[k] = 0;
      queue.push(k);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head];
    const x = k % w;
    const y = (k - x) / w;
    const d = dist[k] + 1;
    for (const dir of CLOCKWISE) {
      const [dx, dy] = DIRS[dir];
      const nx = x + dx;
      const ny = y + dy;
      if (blocked(nx, ny)) continue;
      const nk = ny * w + nx;
      if (dist[nk] === -1) {
        dist[nk] = d;
        queue.push(nk);
      }
    }
  }
  return dist;
}

// Mirror of §6 step 10: the cell a drift will stand on after its next
// move. It tries its own direction first, then clockwise; walls, holds
// (open or not), the exit, and conflicts stop it. It ignores the rest.
function driftNext(level, d, conflicts, w) {
  const from = Math.max(0, CLOCKWISE.indexOf(d.dir));
  for (let turn = 0; turn < CLOCKWISE.length; turn++) {
    const dir = CLOCKWISE[(from + turn) % CLOCKWISE.length];
    const [dx, dy] = DIRS[dir];
    const nx = d.x + dx;
    const ny = d.y + dy;
    const t = terrain(level, nx, ny);
    if (t !== '#' && t !== 'H' && t !== 'X' && !conflicts.has(ny * w + nx)) {
      return { x: nx, y: ny };
    }
  }
  return { x: d.x, y: d.y };
}

// The neighbouring cells a legal move could enter this tick, in
// clockwise order for stable tie-breaks. `danger` — the cells a drift
// will occupy after its coming move — excludes cells while given.
function candidates(level, x, y, doorsOpen, conflicts, driftCells, danger) {
  const w = level.width;
  const out = [];
  for (const dir of CLOCKWISE) {
    const [dx, dy] = DIRS[dir];
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= level.height) continue;
    if (playerBlocked(level, nx, ny, doorsOpen)) continue;
    const k = ny * w + nx;
    if (conflicts.has(k) || driftCells.has(k)) continue;
    if (danger !== null && danger.has(k)) continue;
    out.push({ x: nx, y: ny, k });
  }
  return out;
}

// The move name from a cell to its neighbour.
function dirName(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  for (const dir of CLOCKWISE) {
    if (DIRS[dir][0] === dx && DIRS[dir][1] === dy) return dir;
  }
  return null;
}

// One move toward the target of `map`, a distance map rooted there:
// strict progress only — a neighbour at here - 1, the shortest path's
// first step — through cells no drift will occupy when the drifts move
// this coming tick. Without progress: hold position (the caller has
// already dodged the cells a drift would reach).
function firstStepToward(map, level, x, y, doorsOpen, conflicts, driftCells, danger) {
  const w = level.width;
  const here = map[y * w + x];
  if (here <= 0) return null;
  for (const c of candidates(level, x, y, doorsOpen, conflicts, driftCells, danger)) {
    if (map[c.k] === here - 1) return c;
  }
  return null;
}

export function botInput(state) {
  if (!state || !state.level) return NIL;
  const level = state.level;
  const w = level.width;
  const h = level.height;
  const cell = (x, y) => y * w + x;
  const player = state.player ?? { x: 0, y: 0 };
  const playerKey = cell(player.x, player.y);

  // The rigid facts of this tick: conflicts, the drifts' cells, and —
  // when the coming tick sits on the drift period — the cells each
  // drift will occupy after its move.
  const conflicts = new Set();
  for (const c of state.conflicts ?? []) conflicts.add(cell(c.x, c.y));
  const driftCells = new Set();
  const drifts = state.drifts ?? [];
  for (const d of drifts) driftCells.add(cell(d.x, d.y));
  const open = state.open === true;
  const period = Math.max(1, level.driftPeriod ?? 1);
  const movingThisStep = ((state.tick ?? 0) + 1) % period === 0;
  const danger = new Set();
  if (movingThisStep) {
    for (const d of drifts) {
      const n = driftNext(level, d, conflicts, w);
      danger.add(cell(n.x, n.y));
    }
  }

  // The map's features: merge pads in reading order and the one exit.
  const pads = [];
  let exit = null;
  for (let y = 0; y < h; y++) {
    const row = level.tiles[y] ?? '';
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === 'M') pads.push({ x, y });
      else if (ch === 'X' && exit === null) exit = { x, y };
    }
  }
  const spawnCells = new Set();
  for (const sp of level.spawns ?? []) spawnCells.add(cell(sp.x, sp.y));
  const carried = Array.isArray(state.carried) ? state.carried : [];
  const patches = Array.isArray(state.patches) ? state.patches : [];

  // The errand maps, redrawn each call: patches, pads, and the open exit.
  const mapExit = open && exit ? distances(level, [exit], true, conflicts, driftCells) : [];
  const mapPatches = distances(level, patches, open, conflicts, driftCells);
  const mapPads = distances(level, pads, open, conflicts, driftCells);

  // Nearest reachable patch and pad; the arrays' own order breaks
  // distance ties, so the pick stays deterministic.
  let nearestPatch = null;
  for (const p of patches) {
    const d = mapPatches[cell(p.x, p.y)];
    if (d < 0) continue;
    if (nearestPatch === null || d < mapPatches[cell(nearestPatch.x, nearestPatch.y)]) nearestPatch = p;
  }
  let nearestPad = null;
  for (const m of pads) {
    const d = mapPads[cell(m.x, m.y)];
    if (d < 0) continue;
    if (nearestPad === null || d < mapPads[cell(nearestPad.x, nearestPad.y)]) nearestPad = m;
  }

  // The tick's errand, in priority order: leave through an open exit;
  // with full hands, bank them on the nearest pad; empty-handed, fetch
  // the nearest patch; hands between, gather while a patch is strictly
  // the shorter errand, bank otherwise.
  const plan =
    (open && exit && mapExit[playerKey] >= 0)
      ? { x: exit.x, y: exit.y, map: mapExit, doorsOpen: true }
      : (carried.length >= CARRY_MAX && nearestPad)
        ? { x: nearestPad.x, y: nearestPad.y, map: mapPads, doorsOpen: open }
        : (nearestPatch && (carried.length === 0 || !nearestPad
          || mapPatches[cell(nearestPatch.x, nearestPatch.y)] < mapPads[cell(nearestPad.x, nearestPad.y)]))
          ? { x: nearestPatch.x, y: nearestPatch.y, map: mapPatches, doorsOpen: open }
          : (nearestPad && carried.length > 0)
            ? { x: nearestPad.x, y: nearestPad.y, map: mapPads, doorsOpen: open }
            : null;

  // A drift will step onto the player this very tick: leave first.
  // Among the cells no drift will occupy, keep the errand's direction
  // where one exists; otherwise prefer not to park on a spawn point —
  // nothing respawns under a standing courier.
  if (movingThisStep && danger.has(playerKey)) {
    const pool = candidates(level, player.x, player.y, open, conflicts, driftCells, danger);
    if (pool.length === 0) return NIL;
    let pick = null;
    if (plan !== null && plan.map[playerKey] > 0) {
      for (const c of pool) {
        const dv = plan.map[c.k];
        if (dv >= 0 && (pick === null || dv < plan.map[pick.k])) pick = c;
      }
    }
    if (pick === null) {
      const calm = pool.filter((c) => !spawnCells.has(c.k));
      const list = calm.length > 0 ? calm : pool;
      pick = list[0];
      for (const c of list) {
        if (c.y < pick.y || (c.y === pick.y && c.x < pick.x)) pick = c;
      }
    }
    return { move: dirName(player, pick), pause: false };
  }

  if (plan === null) {
    // No errand. Standing on a spawn point starves the spawn cycle, so
    // edge off it once; otherwise hold position.
    if (spawnCells.has(playerKey)) {
      const awayCells = [];
      for (let y = 0; y < h; y++) {
        const row = level.tiles[y] ?? '';
        for (let x = 0; x < row.length; x++) {
          const k = cell(x, y);
          if (row[x] === '#' || spawnCells.has(k) || conflicts.has(k) || driftCells.has(k)) continue;
          awayCells.push({ x, y });
        }
      }
      const away = distances(level, awayCells, open, conflicts, driftCells);
      const stepArg = firstStepToward(away, level, player.x, player.y, open, conflicts, driftCells, movingThisStep ? danger : null);
      if (stepArg !== null) return { move: dirName(player, stepArg), pause: false };
    }
    return NIL;
  }

  const toward = firstStepToward(plan.map, level, player.x, player.y, plan.doorsOpen, conflicts, driftCells, movingThisStep ? danger : null);
  if (toward === null) return NIL;
  return { move: dirName(player, toward), pause: false };
}
