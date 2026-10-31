// The autopilot (DESIGN.md §9): botInput(state) returns { move, pause: false }
// for the state — pure, deterministic, and rule-aware. It predicts one engine
// step exactly (§6): where each drift will stand after its move and which
// conflicts will still block a cell, so no drift hit is ever taken that a
// different step could have avoided. Between dodges it walks a BFS path to
// its goal: the nearest lying patch, the merge pad once its hands are full or
// its carried patches would settle the quorum, then the open exit; with
// nothing reachable it waits beside a spawn point (never on one: §6 step 13
// only spawns on a spawn point nobody stands on).

import { CARRY_MAX, DIRS, CLOCKWISE } from './constants.js';

const MOVE_ORDER = ['up', 'right', 'down', 'left'];

// The terrain character of a cell; '#' outside the map, as tileAt does (§5).
function tileAt(level, x, y) {
  if (y < 0 || y >= level.height || x < 0 || x >= level.width) return '#';
  const row = level.tiles[y];
  return row === undefined ? '#' : row[x] ?? '#';
}

export function botInput(state) {
  const wait = { move: null, pause: false };
  if (!state || state.status !== 'playing' || state.paused) return wait;
  const level = state.level;
  if (!level || !Number.isInteger(level.width) || !Number.isInteger(level.height)) return wait;
  const w = level.width;
  const h = level.height;
  const n = w * h;
  const player = state.player || { x: 0, y: 0 };
  const px = player.x;
  const py = player.y;
  const here = py * w + px;

  // Conflicts (§6 steps 5 and 11): a ttl of 1 ages away in step 5, before
  // anything moves, so only ttl >= 2 blocks the coming step — for the
  // player's move (step 6) and the drifts' moves (step 10) alike.
  const blocked = new Set();
  for (const c of state.conflicts || []) {
    if (c && c.ttl >= 2) blocked.add(c.y * w + c.x);
  }
  const open = !!state.open;

  // Passable to the player (§6 step 6): no wall, no closed hold or exit,
  // no conflict still standing after this step's ageing.
  function playerOk(x, y) {
    const t = tileAt(level, x, y);
    if (t === '#') return false;
    if ((t === 'H' || t === 'X') && !open) return false;
    return !blocked.has(y * w + x);
  }

  // A BFS field over the whole grid from one cell, explored in a fixed
  // direction order so ties resolve deterministically.
  function field(fromIdx) {
    const f = new Int32Array(n).fill(-1);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    f[fromIdx] = 0;
    queue[tail++] = fromIdx;
    while (head < tail) {
      const cur = queue[head++];
      const cx = cur % w;
      const cy = (cur - cx) / w;
      for (let i = 0; i < 4; i++) {
        const d = DIRS[MOVE_ORDER[i]];
        const nx = cx + d[0];
        const ny = cy + d[1];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const next = ny * w + nx;
        if (f[next] !== -1 || !playerOk(nx, ny)) continue;
        f[next] = f[cur] + 1;
        queue[tail++] = next;
      }
    }
    return f;
  }

  // One field from the player: who is reachable, and how far.
  const reach = field(here);

  // Where each drift will stand after this step (§6 step 10), if the drifts
  // move on this tick: each drift, in array order, tries its own direction
  // and then the next directions clockwise, taking the first target passable
  // to a drift: no wall, no hold, no exit (open or not), no conflict. With no
  // passable direction it stays where it is. `before` and `after` pair up
  // per drift, which is what the swap rule (§6 step 12) reads.
  const period = level.driftPeriod > 0 ? level.driftPeriod : 1;
  const movesNow = ((state.tick || 0) + 1) % period === 0;
  const drifts = state.drifts || [];
  const before = drifts.map((d) => d.y * w + d.x);
  let after;
  if (movesNow) {
    after = [];
    for (const d of drifts) {
      let moved = false;
      const base = Math.max(0, CLOCKWISE.indexOf(d.dir));
      for (let k = 0; k < 4; k++) {
        const dir = DIRS[CLOCKWISE[(base + k) % 4]];
        const nx = d.x + dir[0];
        const ny = d.y + dir[1];
        const t = tileAt(level, nx, ny);
        if (t === '#' || t === 'H' || t === 'X') continue;
        if (blocked.has(ny * w + nx)) continue;
        after.push(ny * w + nx);
        moved = true;
        break;
      }
      if (!moved) after.push(d.y * w + d.x);
    }
  } else {
    after = before.slice();
  }
  const driftGoing = (cell) => {
    for (const c of after) if (c === cell) return true;
    return false;
  };
  const driftSwapping = (cell, from) => {
    if (cell === from) return false;
    for (let i = 0; i < before.length; i++) {
      if (before[i] === cell && after[i] === from) return true;
    }
    return false;
  };

  // The goal cell (§9): the open exit; or the merge pad when the bot's hands
  // are full, or carrying what would settle the level's quorum; else the
  // nearest lying patch; else, with nothing reachable to pick up, a cell
  // beside a spawn point — never a spawn cell itself: a patch can be born
  // only where nobody stands (§6 step 13).
  const carried = state.carried || [];
  const needed = Math.max(1, (level.quorum || 1) - (state.merges || 0));

  const pads = [];
  const exits = [];
  for (let y = 0; y < h; y++) {
    const row = level.tiles[y] || '';
    for (let x = 0; x < row.length; x++) {
      const t = row[x];
      if (t === 'M') pads.push({ x, y });
      else if (t === 'X') exits.push({ x, y });
    }
  }

  function nearestReachable(cells) {
    let best = -1;
    let bestDist = Infinity;
    for (const c of cells) {
      const dd = reach[c.y * w + c.x];
      if (dd !== -1 && dd < bestDist) {
        bestDist = dd;
        best = c.y * w + c.x;
      }
    }
    return best;
  }

  let target;
  if (open) {
    target = nearestReachable(exits);
  } else if (carried.length >= CARRY_MAX || carried.length >= needed) {
    target = nearestReachable(pads);
  } else {
    target = nearestReachable(state.patches || []);
    if (target === -1 && carried.length > 0) target = nearestReachable(pads);
  }
  if (target === -1) {
    const spawnCells = new Set((level.spawns || []).map((s) => s.y * w + s.x));
    const campCells = [];
    for (const s of level.spawns || []) {
      for (const move of MOVE_ORDER) {
        const nx = s.x + DIRS[move][0];
        const ny = s.y + DIRS[move][1];
        if (spawnCells.has(ny * w + nx)) continue;
        campCells.push({ x: nx, y: ny });
      }
    }
    target = nearestReachable(campCells);
  }

  // The walk field: distance from every cell to the goal, so each candidate
  // step is scored by how much of the way it leaves.
  let walk = null;
  if (target !== -1) walk = field(target);

  // Now pick among the move candidates (§6 step 12, read one step ahead):
  // the step down the path if it survives this step's drifts — no drift ends
  // the step on the bot's cell, and no drift that sat on the bot's target
  // moves into the cell the bot just left (a hit both ways) — else the safe
  // step closest to the goal. A direction the player cannot move in is not a
  // candidate (it would waste the step on a stand-still). While invulnerable
  // (§6 step 12), nothing hits, so every move is safe. If nothing is safe,
  // hold course: a hit is coming whatever the bot does.
  const safeFromHits = (state.invuln || 0) > 0;
  let bestMove;
  let bestScore = Infinity;
  let sawSafe = false;
  for (const move of [...MOVE_ORDER, null]) {
    let cell;
    if (move === null) {
      cell = here;
    } else {
      const d = DIRS[move];
      const nx = px + d[0];
      const ny = py + d[1];
      if (!playerOk(nx, ny)) continue;
      cell = ny * w + nx;
    }
    if (!safeFromHits && (driftGoing(cell) || driftSwapping(cell, here))) continue;
    sawSafe = true;
    const score = !walk || walk[cell] === -1 ? Infinity : walk[cell];
    if (score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  if (!sawSafe) return { move: null, pause: false };
  return { move: bestMove ?? null, pause: false };
}
