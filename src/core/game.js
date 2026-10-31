// The rules of Quorum Run: state shape (DESIGN.md §5), the step function and
// its event stream (§6), and tileAt. Pure: randomness only from state.seed,
// plain JSON states, the given state is never changed.
import { LEVELS } from '../data/levels.js';
import { parseLevel } from './level.js';
import { rngInt } from './rng.js';
import {
  START_LIVES, CARRY_MAX, INVULN_TICKS, CONFLICT_TICKS,
  PATCH_BASE, SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, CLOCKWISE,
} from './constants.js';

const DIR_INDEX = { up: 0, right: 1, down: 2, left: 3 };
const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// Loading a level (at init and on reaching an open exit) sets level, player,
// patches, and drifts and resets the per-level fields; score, lives, tick,
// status and the PRNG state are kept.
function loadLevel(state) {
  const level = parseLevel(state.levels[state.levelIndex]);
  let seed = state.seed;
  const patches = level.spawns.map((p) => {
    const r = rngInt(seed, COLORS);
    seed = r.seed;
    return { x: p.x, y: p.y, color: r.value };
  });
  return {
    ...state,
    seed,
    levelTicks: 0,
    level,
    player: { x: level.start.x, y: level.start.y },
    carried: [],
    patches,
    drifts: level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir })),
    conflicts: [],
    merges: 0,
    open: false,
    invuln: 0,
  };
}

export function init(seed, options = {}) {
  return loadLevel({
    seed: seed >>> 0,
    tick: 0,
    levels: options.levels ?? LEVELS,
    levelIndex: options.level ?? 0,
    score: 0,
    lives: START_LIVES,
    merges: 0,
    open: false,
    invuln: 0,
    events: [],
    status: 'playing',
    paused: false,
  });
}

export function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined) return '#';
  return x < 0 || x >= row.length ? '#' : row[x];
}

function conflictAt(conflicts, x, y) {
  return conflicts.some((c) => c.x === x && c.y === y);
}

export function step(state, input) {
  if (!state || state.status !== 'playing') return { ...state, events: [] };
  const pause = !!(input && input.pause === true);
  if (pause) {
    return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  }
  if (state.paused) return { ...state, events: [] };
  const move = input && typeof input.move === 'string' && DIR_INDEX[input.move] !== undefined
    ? input.move : null;

  const level = state.level;
  // 4. the tick counters grow; 5. conflicts age.
  const tick = state.tick + 1;
  const levelTicks = state.levelTicks + 1;
  const conflicts = state.conflicts
    .map((c) => ({ ...c, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. the player's move.
  const from = { x: state.player.x, y: state.player.y };
  let px = from.x;
  let py = from.y;
  if (move !== null) {
    const step = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }[move];
    const tx = from.x + step[0];
    const ty = from.y + step[1];
    const t = tileAt(state, tx, ty);
    if (t !== '#' && !conflictAt(conflicts, tx, ty) && (t === '.' || t === 'M' || (state.open && (t === 'X' || t === 'H')))) {
      px = tx;
      py = ty;
    }
  }
  const player = { x: px, y: py };

  // 7. pickup, 8. merge (quorum), 9. exit — with a running score/carried copy.
  const patches = state.patches.slice();
  const carried = state.carried.slice();
  const events = [];
  const pi = patches.findIndex((p) => p.x === px && p.y === py);
  if (pi >= 0 && carried.length < CARRY_MAX) {
    carried.push(patches[pi].color);
    patches.splice(pi, 1);
    events.push('pickup');
  }
  let score = state.score;
  let merges = state.merges;
  let open = state.open;
  if (tileAt(state, px, py) === 'M' && carried.length > 0) {
    const n = carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && carried.every((c) => c === carried[0])) gain += SAME_COLOR_BONUS * n;
    score += gain;
    merges += n;
    events.push('merge');
    carried.length = 0;
    if (merges >= level.quorum && !open) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. the exit: ship or win, and the step ends here.
  if (open && tileAt(state, px, py) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    if (state.levelIndex + 1 < state.levels.length) {
      const next = { ...state, tick: state.tick + 1, levelIndex: state.levelIndex + 1, score };
      const loaded = loadLevel(next);
      return { ...loaded, events: [...events, 'level'] };
    }
    return {
      ...state,
      tick,
      player,
      carried,
      patches,
      conflicts,
      score,
      merges,
      open,
      events: [...events, 'won'],
      status: 'won',
    };
  }

  // 10. drifts move.
  const driftMoveTick = tick % level.driftPeriod === 0;
  let drifts = state.drifts.map((d) => ({ ...d }));
  const before = drifts.map((d) => ({ x: d.x, y: d.y }));
  if (driftMoveTick) {
    const wall = (x, y) => {
      const t = tileAt(state, x, y);
      return t === '#' || t === 'H' || t === 'X';
    };
    for (let i = 0; i < drifts.length; i++) {
      const d = drifts[i];
      const base = DIR_INDEX[d.dir];
      let done = false;
      for (let k = 0; k < 4 && !done; k++) {
        const dir = CLOCKWISE[(base + k) % 4];
        const [dx, dy] = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }[dir];
        const tx = d.x + dx;
        const ty = d.y + dy;
        if (!wall(tx, ty) && !conflictAt(conflicts, tx, ty)) {
          drifts[i] = { x: tx, y: ty, dir };
          done = true;
        }
      }
    }
    // 11. collisions in reading order.
    const at = new Map();
      drifts.forEach((d, i) => {
        const key = `${d.y},${d.x}`;
        if (!at.has(key)) at.set(key, []);
        at.get(key).push(i);
      });
      const cells = [...at.keys()]
        .map((key) => key.split(',').map(Number))
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      for (const [cy, cx] of cells) {
        const stack = at.get(`${cy},${cx}`);
        if (stack.length < 2) continue;
        for (const i of stack) drifts[i] = { ...drifts[i], dir: REVERSE[drifts[i].dir] };
        if (!conflictAt(conflicts, cx, cy)) conflicts.push({ x: cx, y: cy, ttl: CONFLICT_TICKS });
        events.push('conflict');
      }
  }

  // 12. hits.
  let lives = state.lives;
  let invuln = state.invuln;
  let status = 'playing';
  if (invuln > 0) {
    invuln -= 1;
  } else {
    let hit = drifts.some((d) => d.x === px && d.y === py);
    if (!hit && driftMoveTick) {
      for (let i = 0; i < drifts.length && !hit; i++) {
        if (drifts[i].x === from.x && drifts[i].y === from.y
            && before[i].x === px && before[i].y === py) hit = true;
      }
    }
    if (hit && carried.length > 0) {
      carried.length = 0;
      invuln = INVULN_TICKS;
      events.push('drop');
    } else if (hit) {
      lives -= 1;
      events.push('hit');
      if (lives <= 0) {
        status = 'lost';
        events.push('lost');
      } else {
        player.x = level.start.x;
        player.y = level.start.y;
        invuln = INVULN_TICKS;
      }
    }
  }

  // 13. spawn.
  let seed = state.seed;
  if (status === 'playing' && levelTicks % level.spawnEvery === 0
      && patches.length + carried.length < level.spawns.length) {
    const has = new Set(patches.map((p) => `${p.x},${p.y}`));
    const driftAt = new Set(drifts.map((d) => `${d.x},${d.y}`));
    const free = level.spawns.filter((sp) => !has.has(`${sp.x},${sp.y}`)
      && !(sp.x === px && sp.y === py) && !driftAt.has(`${sp.x},${sp.y}`));
    if (free.length > 0) {
      const r1 = rngInt(seed, free.length);
      seed = r1.seed;
      const r2 = rngInt(seed, COLORS);
      seed = r2.seed;
      const spot = free[r1.value];
      patches.push({ x: spot.x, y: spot.y, color: r2.value });
      events.push('spawn');
    }
  }

  return {
    ...state,
    seed,
    tick,
    levelTicks,
    player,
    carried: carried.slice(),
    patches,
    drifts,
    conflicts,
    score,
    lives,
    merges,
    open,
    invuln,
    status,
    events,
  };
}
