// A dev-only stand-in for src/core/game.js (owned by another agent), written
// straight from DESIGN.md §4–§7 so the bot can be exercised before the real
// core lands on main. Not part of the shipped game: lives outside src/.
import { rngInt } from '../src/core/rng.js';
import {
  CARRY_MAX, START_LIVES, INVULN_TICKS, CONFLICT_TICKS,
  COLORS, TIME_BONUS_PER_TICK, DIRS, CLOCKWISE,
} from '../src/core/constants.js';

const CHARS = new Set(['#', '.', '@', 'P', 'M', 'X', 'H', '^', '>', 'v', '<']);
const DRIFT_CHARS = { '^': 'up', '>': 'right', v: 'down', '<': 'left' };

export function checkLevel(def) {
  const errors = [];
  const numOk = (v) => Number.isInteger(v) && v > 0;
  if (typeof def?.name !== 'string' || def.name === ''
    || !numOk(def.quorum) || !numOk(def.par) || !numOk(def.driftPeriod) || !numOk(def.spawnEvery)
    || !Array.isArray(def.map) || def.map.length === 0 || def.map.some((r) => typeof r !== 'string')) {
    return { ok: false, errors: ['bad_fields'] };
  }
  const rows = def.map;
  const w = rows[0].length;
  if (rows.some((r) => r.length !== w)) errors.push('ragged');
  if (w > 32 || rows.length > 24) errors.push('too_big');
  for (const row of rows) for (const ch of row) if (!CHARS.has(ch)) { errors.push('bad_char'); break; }
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if ((x === 0 || y === 0 || x === w - 1 || y === rows.length - 1) && ch !== '#') {
        if (!errors.includes('no_border')) errors.push('no_border');
      }
    });
  });
  const count = (ch) => rows.reduce((n, r) => n + [...r].filter((c) => c === ch).length, 0);
  if (count('@') !== 1) errors.push('player_count');
  if (count('X') !== 1) errors.push('exit_count');
  if (count('M') === 0) errors.push('no_merge');
  if (count('P') === 0) errors.push('no_spawn');
  if (!errors.includes('player_count') && count('@') === 1) {
    let sx = -1, sy = -1;
    rows.forEach((row, y) => { const x = row.indexOf('@'); if (x >= 0) { sx = x; sy = y; } });
    const seen = new Set();
    const stack = [[sx, sy]];
    seen.add(sy * w + sx);
    while (stack.length) {
      const [x, y] = stack.pop();
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= rows.length) continue;
        const key = ny * w + nx;
        if (seen.has(key)) continue;
        if (rows[ny][nx] === '#') continue;
        seen.add(key);
        stack.push([nx, ny]);
      }
    }
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < w; x++) {
      if ('PMX'.includes(rows[y][x]) && !seen.has(y * w + x)) {
        if (!errors.includes('unreachable')) errors.push('unreachable');
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function parseLevel(def) {
  const { ok, errors } = checkLevel(def);
  if (!ok) throw new Error('invalid level: ' + errors.join(', '));
  const map = def.map;
  const height = map.length;
  const width = map[0].length;
  let start = null;
  const spawns = [];
  const drifts = [];
  const tiles = map.map((row, y) => {
    const out = [];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '@') { start = { x, y }; out.push('.'); }
      else if (ch === 'P') { spawns.push({ x, y }); out.push('.'); }
      else if (DRIFT_CHARS[ch] !== undefined) { drifts.push({ x, y, dir: DRIFT_CHARS[ch] }); out.push('.'); }
      else out.push(ch);
    }
    return out.join('');
  });
  return {
    name: def.name, quorum: def.quorum, par: def.par, driftPeriod: def.driftPeriod,
    spawnEvery: def.spawnEvery, width, height, tiles, start, spawns, drifts,
  };
}

function tileAt(level, x, y) {
  const row = level.tiles[y];
  if (row === undefined || x < 0 || x >= row.length) return '#';
  return row[x];
}

function passableToPlayer(level, open, conflicts, x, y) {
  const ch = tileAt(level, x, y);
  if (ch === '#') return false;
  if ((ch === 'H' || ch === 'X') && !open) return false;
  if (conflicts.some((c) => c.x === x && c.y === y)) return false;
  return true;
}

function passableToDrift(level, conflicts, x, y) {
  const ch = tileAt(level, x, y);
  if (ch === '#' || ch === 'H' || ch === 'X') return false;
  if (conflicts.some((c) => c.x === x && c.y === y)) return false;
  return true;
}

function loadLevel(state, index) {
  const level = parseLevel(state.levels[index]);
  let seed = state.seed;
  const patches = level.spawns.map((sp) => {
    const r = rngInt(seed, COLORS);
    seed = r.seed;
    return { x: sp.x, y: sp.y, color: r.value };
  });
  state.level = level;
  state.player = { x: level.start.x, y: level.start.y };
  state.patches = patches;
  state.drifts = level.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
  state.carried = [];
  state.conflicts = [];
  state.merges = 0;
  state.open = false;
  state.invuln = 0;
  state.levelTicks = 0;
  state.seed = seed;
}

export function init(seed, options = {}) {
  const state = {
    seed: seed >>> 0, tick: 0, levelTicks: 0,
    levels: options.levels ?? [], levelIndex: options.level ?? 0, level: null,
    player: { x: 0, y: 0 }, carried: [], patches: [], drifts: [], conflicts: [],
    score: 0, lives: START_LIVES, merges: 0, open: false, invuln: 0,
    status: 'playing', paused: false, events: [],
  };
  loadLevel(state, state.levelIndex);
  return state;
}

export function step(state, input) {
  if (state.status !== 'playing') return { ...state, events: [] };
  if (input?.pause) return { ...state, paused: !state.paused, events: [state.paused ? 'resume' : 'pause'] };
  if (state.paused) return { ...state, events: [] };
  const move = input?.move ?? null;
  const s = { ...state, events: [] };
  s.tick += 1;
  s.levelTicks += 1;
  s.conflicts = s.conflicts.map((c) => ({ ...c, ttl: c.ttl - 1 })).filter((c) => c.ttl > 0);
  const level = s.level;
  const playerPre = { ...s.player };
  if (move != null && DIRS[move]) {
    const [dx, dy] = DIRS[move];
    if (passableToPlayer(level, s.open, s.conflicts, s.player.x + dx, s.player.y + dy)) {
      s.player = { x: s.player.x + dx, y: s.player.y + dy };
    }
  }
  const pi = s.patches.findIndex((p) => p.x === s.player.x && p.y === s.player.y);
  if (pi >= 0 && s.carried.length < CARRY_MAX) {
    const [patch] = s.patches.splice(pi, 1);
    s.carried = [...s.carried, patch.color];
    s.events.push('pickup');
  }
  if (tileAt(level, s.player.x, s.player.y) === 'M' && s.carried.length > 0) {
    const n = s.carried.length;
    s.score += 100 * n * n + (n >= 2 && s.carried.every((c) => c === s.carried[0]) ? 50 * n : 0);
    s.merges += n;
    s.carried = [];
    s.events.push('merge');
    if (s.merges >= level.quorum && !s.open) {
      s.open = true;
      s.events.push('quorum');
    }
  }
  if (s.open && tileAt(level, s.player.x, s.player.y) === 'X') {
    s.score += Math.max(0, level.par - s.levelTicks) * TIME_BONUS_PER_TICK;
    if (s.levelIndex + 1 < s.levels.length) {
      s.levelIndex += 1;
      loadLevel(s, s.levelIndex);
      s.events.push('level');
    } else {
      s.status = 'won';
      s.events.push('won');
    }
    return s;
  }
  // step 10: drifts move when tick % driftPeriod === 0 (tick already grown)
  if (s.tick % level.driftPeriod === 0) {
    const before = s.drifts.map((d) => ({ x: d.x, y: d.y, dir: d.dir }));
    const moved = [];
    for (const d of s.drifts) {
      let placed = null;
      const start = CLOCKWISE.indexOf(d.dir);
      for (let i = 0; i < 4; i++) {
        const dir = CLOCKWISE[(start + i) % 4];
        const [dx, dy] = DIRS[dir];
        const nx = d.x + dx, ny = d.y + dy;
        if (passableToDrift(level, s.conflicts, nx, ny)) { placed = { x: nx, y: ny, dir }; break; }
      }
      moved.push(placed ?? { ...d });
    }
    s.drifts = moved;
    // step 11: collisions, cells in reading order
    const byCell = new Map();
    for (const d of moved) {
      const key = d.y * 4096 + d.x;
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key).push(d);
    }
    const cells = [...byCell.keys()].sort((a, b) => a - b);
    for (const key of cells) {
      const list = byCell.get(key);
      if (list.length < 2) continue;
      const x = key % 4096, y = (key / 4096) | 0;
      for (const d of list) d.dir = CLOCKWISE[(CLOCKWISE.indexOf(d.dir) + 2) % 4];
      if (!s.conflicts.some((c) => c.x === x && c.y === y)) {
        s.conflicts = [...s.conflicts, { x, y, ttl: CONFLICT_TICKS }];
        s.events.push('conflict');
      }
    }
    // step 12: hits
    if (s.invuln > 0) {
      s.invuln -= 1;
    } else {
      let hit = s.drifts.some((d) => d.x === s.player.x && d.y === s.player.y);
      for (let i = 0; i < s.drifts.length && !hit; i++) {
        if (s.drifts[i].x === playerPre.x && s.drifts[i].y === playerPre.y
          && before[i].x === s.player.x && before[i].y === s.player.y) hit = true;
      }
      if (hit) {
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
            s.player = { x: level.start.x, y: level.start.y };
            s.invuln = INVULN_TICKS;
          }
        }
      }
    }
  }
  // step 13: spawns
  if (s.status === 'playing' && s.levelTicks % level.spawnEvery === 0
    && s.patches.length + s.carried.length < level.spawns.length) {
    const taken = new Set([
      ...s.patches.map((p) => p.y * level.width + p.x),
      s.player.y * level.width + s.player.x,
      ...s.drifts.map((d) => d.y * level.width + d.x),
    ]);
    const free = level.spawns.filter((sp) => !taken.has(sp.y * level.width + sp.x));
    if (free.length > 0) {
      const r1 = rngInt(s.seed, free.length);
      const at = free[r1.value];
      const r2 = rngInt(r1.seed, COLORS);
      s.patches = [...s.patches, { x: at.x, y: at.y, color: r2.value }];
      s.seed = r2.seed;
      s.events.push('spawn');
    }
  }
  return s;
}
