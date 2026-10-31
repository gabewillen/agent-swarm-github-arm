// A lab replica of DESIGN.md §5–§7: init and step, built straight from the
// design so the bot can be exercised before src/core/game.js lands. It is
// NOT the shipped game: lab only. It reuses the real constants and PRNG.
import {
  CARRY_MAX, INVULN_TICKS, CONFLICT_TICKS, PATCH_BASE, SAME_COLOR_BONUS,
  TIME_BONUS_PER_TICK, COLORS, START_LIVES, DIRS,
} from '../src/core/constants.js';
import { rngInt } from '../src/core/rng.js';
import { miniParse } from './lab.mjs';

const BACK = { up: 'down', down: 'up', left: 'right', right: 'left' };

function turnOrder(dir) {
  const all = ['up', 'right', 'down', 'left'];
  const i = all.indexOf(dir);
  return i < 0 ? all : all.slice(i).concat(all.slice(0, i));
}

function drawPatches(seed, spawns) {
  const patches = [];
  for (const sp of spawns) {
    const d = rngInt(seed, COLORS);
    seed = d.seed;
    patches.push({ x: sp.x, y: sp.y, color: d.value });
  }
  return { patches, seed };
}

// init(seed, { levels, level }) per §5.
export function repInit(seed, options = {}) {
  const levels = options.levels || [];
  const levelIndex = options.level === undefined ? 0 : options.level;
  const def = levels[levelIndex];
  const level = miniParse(def.map);
  level.quorum = def.quorum;
  level.par = def.par;
  level.driftPeriod = def.driftPeriod;
  level.spawnEvery = def.spawnEvery;
  level.name = def.name;
  const drew = drawPatches(seed >>> 0, level.spawns);
  return {
    seed: drew.seed,
    tick: 0,
    levelTicks: 0,
    levels,
    levelIndex,
    level,
    player: { ...level.start },
    carried: [],
    patches: drew.patches,
    drifts: level.drifts.map((d) => ({ ...d })),
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
}

// step(state, input) per §6.
export function repStep(s, input) {
  if (s.status !== 'playing') return { ...s, events: [] };
  const pause = !!(input && input.pause);
  const move = input && DIRS[input.move] ? input.move : null;
  if (pause) return { ...s, paused: !s.paused, events: [s.paused ? 'resume' : 'pause'] };
  if (s.paused) return { ...s, events: [] };

  const level = s.level;
  let seed = s.seed >>> 0;
  const tick = s.tick + 1;
  let levelTicks = s.levelTicks + 1;
  const events = [];
  let player = { ...s.player };
  const prevPlayer = { ...s.player };
  let carried = s.carried.slice();
  let patches = s.patches.map((p) => ({ ...p }));
  let drifts = s.drifts.map((d) => ({ ...d }));
  const born = drifts.map((d) => ({ ...d }));
  let conflicts = s.conflicts.map((c) => ({ ...c }));
  let score = s.score;
  let lives = s.lives;
  let merges = s.merges;
  let open = s.open;
  let invuln = s.invuln;
  let status = s.status;
  let levelIndex = s.levelIndex;
  let curLevel = level;

  // 5. conflicts age
  conflicts = conflicts
    .map((c) => ({ ...c, ttl: c.ttl - 1 }))
    .filter((c) => c.ttl > 0);
  const conflictAt = (x, y) => conflicts.some((c) => c.x === x && c.y === y);
  const driftAt = (x, y) => drifts.some((d) => d.x === x && d.y === y);
  const tile = (x, y) => {
    const row = level.tiles[y];
    return row === undefined || x < 0 || x >= row.length ? '#' : row[x];
  };

  // 6. the player moves
  if (move) {
    const nx = player.x + DIRS[move][0];
    const ny = player.y + DIRS[move][1];
    const t = tile(nx, ny);
    const passable = t !== '#' && (t === '.' || t === 'M' ||
      (open && (t === 'H' || t === 'X'))) && !conflictAt(nx, ny);
    if (passable) player = { x: nx, y: ny };
  }

  // 7. pickup
  const pi = patches.findIndex((p) => p.x === player.x && p.y === player.y);
  if (pi >= 0 && carried.length < CARRY_MAX) {
    carried.push(patches[pi].color);
    patches.splice(pi, 1);
    events.push('pickup');
  }

  // 8. merge
  if (tile(player.x, player.y) === 'M' && carried.length > 0) {
    const n = carried.length;
    const same = n >= 2 && carried.every((c) => c === carried[0]);
    score += PATCH_BASE * n * n + (same ? SAME_COLOR_BONUS * n : 0);
    merges += n;
    carried = [];
    events.push('merge');
    if (merges >= level.quorum && !open) {
      open = true;
      events.push('quorum');
    }
  }

  // 9. exit
  if (open && tile(player.x, player.y) === 'X') {
    score += Math.max(0, level.par - levelTicks) * TIME_BONUS_PER_TICK;
    const next = levelIndex + 1;
    if (next < s.levels.length) {
      const def = s.levels[next];
      curLevel = miniParse(def.map);
      curLevel.quorum = def.quorum;
      curLevel.par = def.par;
      curLevel.driftPeriod = def.driftPeriod;
      curLevel.spawnEvery = def.spawnEvery;
      curLevel.name = def.name;
      const drew = drawPatches(seed, curLevel.spawns);
      patches = drew.patches;
      seed = drew.seed;
      levelIndex = next;
      player = { ...curLevel.start };
      carried = [];
      drifts = curLevel.drifts.map((d) => ({ ...d }));
      conflicts = [];
      merges = 0;
      open = false;
      invuln = 0;
      events.push('level');
      levelTicks = 0;
    } else {
      status = 'won';
      events.push('won');
    }
    // §6 step 9: either way the step ends here.
    return {
      ...s, seed, tick, levelTicks, level: curLevel, levelIndex, player,
      carried, patches, drifts, conflicts, score, lives, merges, open,
      invuln, status, events,
    };
  }

  // 10. drifts move
  const movedTick = tick % level.driftPeriod === 0;
  if (movedTick) {
    for (const d of drifts) {
      for (const dir of turnOrder(d.dir)) {
        const nx = d.x + DIRS[dir][0];
        const ny = d.y + DIRS[dir][1];
        const t = tile(nx, ny);
        if (t === '#' || t === 'H' || t === 'X') continue;
        if (conflictAt(nx, ny)) continue;
        d.x = nx;
        d.y = ny;
        d.dir = dir;
        break;
      }
    }
  }

  // 11. drift collisions, only when drifts moved
  if (movedTick) {
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const here = drifts.filter((d) => d.x === x && d.y === y);
        if (here.length < 2) continue;
        for (const d of here) d.dir = BACK[d.dir] || d.dir;
        if (!conflicts.some((c) => c.x === x && c.y === y)) {
          conflicts.push({ x, y, ttl: CONFLICT_TICKS });
        }
        events.push('conflict');
      }
    }
  }

  // 12. hits
  if (invuln > 0) {
    invuln -= 1;
  } else {
    const swap = movedTick && drifts.some((d, i) =>
      d.x === prevPlayer.x && d.y === prevPlayer.y &&
      born[i].x === player.x && born[i].y === player.y &&
      !(born[i].x === d.x && born[i].y === d.y));
    const hit = driftAt(player.x, player.y) || swap;
    if (hit) {
      if (carried.length > 0) {
        carried = [];
        invuln = INVULN_TICKS;
        events.push('drop');
      } else {
        lives -= 1;
        events.push('hit');
        if (lives === 0) {
          status = 'lost';
          events.push('lost');
        } else {
          player = { ...level.start };
          invuln = INVULN_TICKS;
        }
      }
    }
  }

  // 13. spawns
  if (status === 'playing' && levelTicks % level.spawnEvery === 0 &&
      patches.length + carried.length < level.spawns.length) {
    const free = level.spawns.filter((sp) =>
      !patches.some((p) => p.x === sp.x && p.y === sp.y) &&
      !(sp.x === player.x && sp.y === player.y) &&
      !drifts.some((d) => d.x === sp.x && d.y === sp.y));
    if (free.length) {
      const a = rngInt(seed, free.length);
      seed = a.seed;
      const c = rngInt(seed, COLORS);
      seed = c.seed;
      patches.push({ x: free[a.value].x, y: free[a.value].y, color: c.value });
      events.push('spawn');
    }
  }

  return {
    ...s, seed, tick, levelTicks, level: curLevel, levelIndex, player,
    carried, patches, drifts, conflicts, score, lives, merges, open,
    invuln, status, events,
  };
}
