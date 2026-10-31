// The autopilot (DESIGN.md §9): a pure, deterministic planner that plays
// Quorum Run from the state alone — fetch patches (up to three), merge them
// on a pad, and take the exit once the quorum lands — while never walking
// into a drift, a conflict, or a swap it can foresee.
//
// The planner is a breadth-first search over (cell, tick) pairs, run on an
// exact forecast of the drifts: drifts move only by their recorded direction
// and the level's terrain, which the state holds, so the next HORIZON ticks
// of drift and conflict behaviour replay from the state exactly.
import { CARRY_MAX, DIRS, CLOCKWISE, CONFLICT_TICKS } from './constants.js';

const ACTIONS = [...CLOCKWISE, null]; // up, right, down, left, stay
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const HORIZON = 40;     // ticks of lookahead
const BUDGET = 9000;    // search nodes before falling back
const DETOUR_WHEN_OPEN = 6; // longest merge detour still worth it after quorum
const DETOUR_FULL = 24;     // detour allowed while the hands are full
const FETCH_SLACK = 1;      // part-load: fetch while the pad isn't this much closer

const keyOf = (level, x, y) => y * level.width + x;

function tileOf(state, x, y) {
  const row = state.level.tiles[y];
  return row === undefined || x < 0 || x >= row.length ? '#' : row[x];
}

// One exact forecast snapshot per future tick t (the state's tick + t):
// `blockers` holds the conflicts as the player and the drifts see them while
// acting that tick, and `old`/`new` pair each drift's cells before and after.
function foresee(state, upto) {
  const level = state.level;
  const period = level.driftPeriod;
  const drifts = state.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  let conflicts = state.conflicts.map((c) => ({ ...c }));
  const out = [null];
  for (let t = 1; t <= upto; t++) {
    // conflicts age at the tick's start (§6 step 5); drifts move on step 10
    // against those aged conflicts; collisions extend the list (step 11).
    conflicts = conflicts.map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 })).filter((c) => c.ttl > 0);
    const blockers = new Set(conflicts.map((c) => keyOf(level, c.x, c.y)));
    const old = drifts.map((d) => keyOf(level, d.x, d.y));
    const moved = (state.tick + t) % period === 0;
    if (moved) {
      for (let i = 0; i < drifts.length; i++) {
        const d = drifts[i];
        const base = CLOCKWISE.indexOf(d.dir);
        let landing = false;
        for (let k = 0; k < 4 && !landing; k++) {
          const dir = CLOCKWISE[(base + k) % 4];
          const [dx, dy] = DIRS[dir];
          const tx = d.x + dx;
          const ty = d.y + dy;
          const ch = tileOf(state, tx, ty);
          if (ch !== '#' && ch !== 'H' && ch !== 'X' && !blockers.has(keyOf(level, tx, ty))) {
            drifts[i] = { x: tx, y: ty, dir };
            landing = true;
          }
        }
      }
      // collisions, in reading order (§6 step 11): a cell with two or more.
      const stack = new Map();
      drifts.forEach((d, i) => {
        const key = keyOf(level, d.x, d.y);
        const is = stack.get(key);
        if (is) is.push(i);
        else stack.set(key, [i]);
      });
      const cells = [...stack.keys()].sort((a, b) => {
        const ay = Math.floor(a / level.width);
        const by = Math.floor(b / level.width);
        return ay - by || (a % level.width) - (b % level.width);
      });
      for (const key of cells) {
        const is = stack.get(key);
        if (is.length < 2) continue;
        for (const i of is) drifts[i] = { ...drifts[i], dir: REVERSE[drifts[i].dir] };
        if (!conflicts.some((c) => keyOf(level, c.x, c.y) === key)) {
          conflicts.push({ x: key % level.width, y: Math.floor(key / level.width), ttl: CONFLICT_TICKS });
        }
      }
    }
    out.push({ moved, blockers, old, new: drifts.map((d) => keyOf(level, d.x, d.y)) });
  }
  return out;
}

// The breadth-first search over (cell, tick). A move may only end on a cell
// the terrain and that tick's conflicts allow, where no drift ends the tick,
// and never swapping cells with a drift. The open exit is a goal (it ships
// on arrival) and never transit. Returns { move, t } of the found path.
function search(state, goalTest, upto, allowExit) {
  const level = state.level;
  const W = level.width;
  const hh = level.height;
  const p = state.player;
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.x >= W || p.y < 0 || p.y >= hh) return null;
  if (goalTest(p.x, p.y)) return { move: null, t: 0 };
  const forecast = foresee(state, upto);
  if ((upto + 1) * W * hh > 400000) return null;
  const seen = new Uint8Array((upto + 1) * W * hh);
  const parent = new Int32Array(BUDGET);
  const spotX = new Int16Array(BUDGET);
  const spotY = new Int16Array(BUDGET);
  const at = new Int16Array(BUDGET);
  const first = new Int8Array(BUDGET);

  const passable = (x, y, t) => {
    const ch = tileOf(state, x, y);
    if (ch === '#' || ch === undefined) return false;
    if ((ch === 'X' || ch === 'H') && !state.open) return false;
    if (ch === 'X' && !allowExit) return false;
    return !forecast[t].blockers.has(keyOf(level, x, y));
  };

  // may the player at (x, y), acting into tick t + 1, end the step on (tx, ty)?
  // A terminal arrival (the open exit) ships before hits apply.
  const safeEdge = (x, y, t, tx, ty, terminal) => {
    if (terminal) return true;
    const snap = forecast[t + 1];
    if (snap.new.includes(keyOf(level, tx, ty))) return false;
    if (snap.moved) {
      for (let i = 0; i < snap.new.length; i++) {
        if (snap.new[i] === keyOf(level, x, y) && snap.old[i] === keyOf(level, tx, ty)) return false;
      }
    }
    return true;
  };

  let count = 0;
  const push = (x, y, t, par, act) => {
    if (count >= BUDGET) return -1;
    const k = count++;
    parent[k] = par;
    spotX[k] = x;
    spotY[k] = y;
    at[k] = t;
    first[k] = act;
    seen[(t * hh + y) * W + x] = 1;
    return k;
  };

  const root = push(p.x, p.y, 0, -1, 0);
  let head = 0;
  while (head < count && count < BUDGET) {
    const k = head++;
    const t = at[k];
    if (t >= upto) continue;
    const x = spotX[k];
    const y = spotY[k];
    for (let act = 0; act < 5; act++) {
      let tx = x;
      let ty = y;
      let terminal = false;
      if (act < 4) {
        const [dx, dy] = DIRS[ACTIONS[act]];
        tx = x + dx;
        ty = y + dy;
        if (!passable(tx, ty, t + 1)) continue;
        terminal = allowExit && tileOf(state, tx, ty) === 'X';
      }
      if (!safeEdge(x, y, t, tx, ty, terminal)) continue;
      const idx = ((t + 1) * hh + ty) * W + tx;
      if (seen[idx]) continue;
      const child = push(tx, ty, t + 1, k, act);
      if (child < 0) { head = count; break; } // budget spent
      if (goalTest(tx, ty)) {
        let node = child;
        while (parent[node] !== root) node = parent[node];
        return { move: ACTIONS[first[node]], t: t + 1 };
      }
    }
  }
  return null;
}

// The last-resort input: the first action keeping the next tick safe.
function fallback(state) {
  const snap = foresee(state, 1)[1];
  const level = state.level;
  const { x, y } = state.player;
  for (const act of ACTIONS) {
    let tx = x;
    let ty = y;
    if (act !== null) {
      const [dx, dy] = DIRS[act];
      tx = x + dx;
      ty = y + dy;
      const ch = tileOf(state, tx, ty);
      if (ch === '#' || ch === undefined) continue;
      if ((ch === 'X' || ch === 'H') && !state.open) continue;
      if (snap.blockers.has(keyOf(level, tx, ty))) continue;
    }
    if (snap.new.includes(keyOf(level, tx, ty))) continue;
    let swap = false;
    if (snap.moved) {
      for (let i = 0; i < snap.new.length; i++) {
        if (snap.new[i] === keyOf(level, x, y) && snap.old[i] === keyOf(level, tx, ty)) swap = true;
      }
    }
    if (swap) continue;
    return { move: act, pause: false };
  }
  return { move: null, pause: false };
}

export function botInput(state) {
  try {
    if (!state || !state.level || state.status !== 'playing' || !state.player) {
      return { move: null, pause: false };
    }
    const go = (goalTest, allowExit = false) => {
      const found = search(state, goalTest, HORIZON, allowExit);
      return found ? { move: found.move, pause: false, t: found.t } : null;
    };
    const onPatch = (x, y) => state.patches.some((q) => q.x === x && q.y === y);
    const onTile = (ch) => (x, y) => tileOf(state, x, y) === ch;
    const campAt = (x, y) => state.level.spawns.some((sp) => Math.abs(sp.x - x) + Math.abs(sp.y - y) === 1);
    const n = Array.isArray(state.carried) ? state.carried.length : 0;
    const merge = () => go(onTile('M'));
    const exit = () => (state.open ? go(onTile('X'), true) : null);

    if (state.open) {
      if (n === 0) return { ...(exit() ?? fallback(state)) };
      // carrying after the quorum: a nearby pad first, then ship.
      const pad = merge();
      const worth = pad && (n >= CARRY_MAX ? pad.t <= DETOUR_FULL : pad.t <= DETOUR_WHEN_OPEN);
      if (worth) return { move: pad.move, pause: false };
      return { ...(exit() ?? fallback(state)) };
    }
    if (n >= CARRY_MAX) return { ...(merge() ?? fallback(state)) };
    const fetch = state.patches.length > 0 ? go(onPatch) : null;
    if (n === 0) {
      if (fetch) return { move: fetch.move, pause: false };
      return { ...(go(campAt) ?? fallback(state)) };
    }
    // part-load: fetch while patches stay cheap to reach, else merge.
    const pad = merge();
    if (fetch && (!pad || fetch.t <= pad.t + FETCH_SLACK)) return { move: fetch.move, pause: false };
    if (pad) return { move: pad.move, pause: false };
    if (fetch) return { move: fetch.move, pause: false };
    return { ...(go(campAt) ?? fallback(state)) };
  } catch {
    return { move: null, pause: false };
  }
}
