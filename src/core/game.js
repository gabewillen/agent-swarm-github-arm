// The rules (DESIGN.md §5 to §7): state, one step, and the terrain lookup.
// Pure: no DOM, no clock, no global randomness — every draw is from the
// state's seed. step never changes the state or input it is given.
import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE,
  SAME_COLOR_BONUS, TIME_BONUS_PER_TICK, COLORS, DIRS, CLOCKWISE,
} from './constants.js';
import { rngInt } from './rng.js';
import { parseLevel } from './level.js';
import { LEVELS } from '../data/levels.js';

const REVERSE = { up: 'down', down: 'up', left: 'right', right: 'left' };
// loadLevelInto(st, levelIndex) loads the level at levelIndex for state
// st: the parsed level, the player at the start, one patch per spawn with
// fresh colour draws, copies of the drifts, and the per-level fields back
// to zero. Keeps score, lives, tick, levelIndex, levels, and the seed
// except for the fresh draws.
function loadLevelInto(st, levelIndex) {
  const level = parseLevel(st.levels[levelIndex]);
  st.levelIndex = levelIndex;
  st.level = level;
  st.player = { x: level.start.x, y: level.start.y };
  st.patches = [];
  for (const sp of level.spawns) {
    const r = rngInt(st.seed, COLORS);
    st.patches.push({ x: sp.x, y: sp.y, color: r.value });
    st.seed = r.seed;
  }
  st.drifts = level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  st.carried = [];
  st.conflicts = [];
  st.merges = 0;
  st.open = false;
  st.invuln = 0;
  st.levelTicks = 0;
}

// init(seed, options) returns the first state.
export function init(seed, options) {
  const opts = (typeof options === 'object' && options !== null) ? options : {};
  const levels = Array.isArray(opts.levels) ? opts.levels : LEVELS;
  let levelIndex = 0;
  if (Number.isInteger(opts.level) && opts.level >= 0) {
    levelIndex = Math.min(opts.level, levels.length - 1);
  }
  const st = {
    seed: (typeof seed === 'number' ? seed : 0) >>> 0,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level: null,
    player: { x: 0, y: 0 },
    carried: [],
    patches: [],
    drifts: [],
    conflicts: [],
    score: 0,
    lives: START_LIVES,
    merges: 0,
    open: false,
    invuln: 0,
    status: 'playing',
    paused: false,
    events: [],
  };
  loadLevelInto(st, levelIndex);
  return st;
}

// tileAt(state, x, y) is the level's terrain at a cell, '#' outside it.
export function tileAt(state, x, y) {
  const row = state.level.tiles[y];
  if (row === undefined) return '#';
  return row[x] ?? '#';
}

// A shallow copy of the fields step may change. The level, the level
// definitions, and lying patches' cells are read-only in a step.
function fresh(state) {
  return {
    seed: state.seed,
    tick: state.tick,
    levelTicks: state.levelTicks,
    levels: state.levels,
    levelIndex: state.levelIndex,
    level: state.level,
    player: { x: state.player.x, y: state.player.y },
    carried: state.carried,
    patches: state.patches,
    drifts: state.drifts,
    conflicts: state.conflicts,
    score: state.score,
    lives: state.lives,
    merges: state.merges,
    open: state.open,
    invuln: state.invuln,
    status: state.status,
    paused: state.paused,
    events: [],
  };
}

// step(state, input) returns the next state (§6, in order).
export function step(state, input) {
  const i = (input && typeof input === 'object') ? input : {};
  const move = DIRS[i.move] ? i.move : null;
  const pause = i.pause === true;

  // 1. not playing
  if (state.status !== 'playing') return fresh(state);

  // 2. a pause request flips paused and ends the step
  if (pause) {
    const out = fresh(state);
    out.paused = !state.paused;
    out.events = [state.paused ? 'resume' : 'pause'];
    return out;
  }

  // 3. paused: nothing moves
  if (state.paused) return fresh(state);

  // 4. the step ticks and its events start
  const s = fresh(state);
  s.tick = state.tick + 1;
  s.levelTicks = state.levelTicks + 1;

  // 5. conflicts age
  s.conflicts = state.conflicts
    .map((c) => ({ x: c.x, y: c.y, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);

  // 6. the player moves one cell when the target is passable
  const prev = { x: state.player.x, y: state.player.y };
  if (move) {
    const [dx, dy] = DIRS[move];
    const tx = prev.x + dx;
    const ty = prev.y + dy;
    const t = tileAt(s, tx, ty);
    const gated = t === 'H' || t === 'X';
    const onConflict = s.conflicts.some((c) => c.x === tx && c.y === ty);
    if (t !== '#' && (!gated || s.open) && !onConflict) {
      s.player = { x: tx, y: ty };
    }
  }

  // 7. pickup
  if (s.carried.length < CARRY_MAX) {
    const idx = s.patches.findIndex((p) => p.x === s.player.x && p.y === s.player.y);
    if (idx >= 0) {
      const patch = s.patches[idx];
      s.patches = s.patches.filter((_, j) => j !== idx);
      s.carried = [...s.carried, patch.color];
      s.events.push('pickup');
    }
  }

  // 8. merge
  if (tileAt(s, s.player.x, s.player.y) === 'M' && s.carried.length > 0) {
    const n = s.carried.length;
    let gain = PATCH_BASE * n * n;
    if (n >= 2 && s.carried.every((c) => c === s.carried[0])) {
      gain += SAME_COLOR_BONUS * n;
    }
    s.score += gain;
    s.merges += n;
    s.carried = [];
    s.events.push('merge');
    if (!s.open && s.merges >= s.level.quorum) {
      s.open = true;
      s.events.push('quorum');
    }
  }

  // 9. exit: the step ends here
  if (s.open && tileAt(s, s.player.x, s.player.y) === 'X') {
    s.score += Math.max(0, s.level.par - s.levelTicks) * TIME_BONUS_PER_TICK;
    const nextIndex = s.levelIndex + 1;
    if (nextIndex < s.levels.length) {
      loadLevelInto(s, nextIndex);
      s.events.push('level');
    } else {
      s.status = 'won';
      s.events.push('won');
    }
    return s;
  }

  // 10. drifts move on their ticks, each in its own clockwise order
  const drifting = s.tick % s.level.driftPeriod === 0;
  if (drifting) {
    const openConflict = (x, y) => s.conflicts.some((c) => c.x === x && c.y === y);
    s.drifts = s.drifts.map((d) => {
      const from = CLOCKWISE.indexOf(d.dir);
      for (let k = 0; k < 4; k++) {
        const dir = CLOCKWISE[(from + k) % 4];
        const [dx, dy] = DIRS[dir];
        const tx = d.x + dx;
        const ty = d.y + dy;
        const t = tileAt(s, tx, ty);
        if (t !== '#' && t !== 'H' && t !== 'X' && !openConflict(tx, ty)) {
          return { x: tx, y: ty, dir };
        }
      }
      return { x: d.x, y: d.y, dir: d.dir };
    });

    // 11. collisions: per crowded cell, in reading order
    const counts = new Map();
    for (const d of s.drifts) {
      const key = d.x + ',' + d.y;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const crowded = [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .map(([key]) => {
        const at = key.split(',');
        return { x: Number(at[0]), y: Number(at[1]) };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);
    for (const at of crowded) {
      for (const d of s.drifts) {
        if (d.x === at.x && d.y === at.y) d.dir = REVERSE[d.dir];
      }
      if (!s.conflicts.some((c) => c.x === at.x && c.y === at.y)) {
        s.conflicts = [...s.conflicts, { x: at.x, y: at.y, ttl: CONFLICT_TICKS }];
      }
      s.events.push('conflict');
    }
  }

  // 12. hits
  if (s.invuln > 0) {
    s.invuln -= 1;
  } else {
    const onPlayer = s.drifts.some((d) => d.x === s.player.x && d.y === s.player.y);
    let swapped = false;
    if (!onPlayer) {
      for (let j = 0; j < s.drifts.length && !swapped; j++) {
        if (s.drifts[j].x === prev.x && s.drifts[j].y === prev.y
          && state.drifts[j].x === s.player.x && state.drifts[j].y === s.player.y) {
          swapped = true;
        }
      }
    }
    if (onPlayer || swapped) {
      if (s.carried.length > 0) {
        s.carried = [];
        s.invuln = INVULN_TICKS;
        s.events.push('drop');
      } else {
        s.lives -= 1;
        s.events.push('hit');
        if (s.lives <= 0) {
          s.status = 'lost';
          s.events.push('lost');
        } else {
          s.player = { x: s.level.start.x, y: s.level.start.y };
          s.invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. spawns
  if (s.levelTicks % s.level.spawnEvery === 0
    && s.patches.length + s.carried.length < s.level.spawns.length) {
    const tileOpen = (x, y) => !s.patches.some((p) => p.x === x && p.y === y)
      && !(s.player.x === x && s.player.y === y)
      && !s.drifts.some((d) => d.x === x && d.y === y);
    const free = s.level.spawns.filter((sp) => tileOpen(sp.x, sp.y));
    if (free.length > 0) {
      const picked = rngInt(s.seed, free.length);
      const spot = free[picked.value];
      const colored = rngInt(picked.seed, COLORS);
      s.patches = [...s.patches, { x: spot.x, y: spot.y, color: colored.value }];
      s.seed = colored.seed;
      s.events.push('spawn');
    }
  }

  return s;
}
