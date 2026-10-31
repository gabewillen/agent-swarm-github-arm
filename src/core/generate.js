// DESIGN.md §19: generated levels and the daily run. Pure: every choice
// comes from the PRNG of §3 started at `seed >>> 0`, never Math.random, so
// the same seed and options give back the same level.

import { rngInt } from './rng.js';

const DRIFT_CHARS = ['^', '>', 'v', '<'];

// FNV-1a over the string's UTF-16 code units.
export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// The seed of the daily run of a YYYY-MM-DD date, or null for text that
// is not of that form.
export function dailySeed(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return hashSeed('quorum-run:' + date);
}

// Generates a level definition from the seed. Options and defaults:
// width 15 (7..32), height 11 (7..24), drifts 2, spawns 4, quorum 5.
export function generateLevel(seed, options) {
  const opts = options ?? {};
  const width = opts.width ?? 15;
  const height = opts.height ?? 11;
  const drifts = Math.max(0, Math.trunc(opts.drifts ?? 2));
  const spawns = Math.max(1, Math.trunc(opts.spawns ?? 4));
  const quorum = Math.max(1, Math.trunc(opts.quorum ?? 5));
  if (!Number.isInteger(width) || width < 7 || width > 32) {
    throw new RangeError(`generateLevel: width must be an integer from 7 to 32, got ${width}`);
  }
  if (!Number.isInteger(height) || height < 7 || height > 24) {
    throw new RangeError(`generateLevel: height must be an integer from 7 to 24, got ${height}`);
  }

  const inner = width - 2;   // interior cells across
  const innerH = height - 2; // interior cells down
  const area = inner * innerH;
  const name = `Generated ${seed >>> 0}`;
  // Par scales with the walk: room to roam plus a patch per merge again.
  const par = Math.max(30, Math.round((width * height) / 2) + quorum * 8);

  let s = seed >>> 0;
  const draw = (n) => {
    const r = rngInt(s, n);
    s = r.seed;
    return r.value;
  };

  // Lays out one attempt: returns the level definition, or null when the
  // random walls left too little room to place everything. Every draw of
  // every attempt comes from the one stream, so retries stay deterministic.
  const attempt = (no) => {
    // Wall pillars, thinned as attempts pile up so a level lays itself
    // out; the last attempts are plain rooms.
    const grid = new Array(area).fill(0);
    const wallCount = no < 100 ? Math.floor(area * (0.03 + 0.09 * draw(1000) / 1000)) : 0;
    for (let i = 0; i < wallCount; i++) grid[draw(area)] = 1;

    // The player starts on a random interior floor cell.
    let playerIdx = draw(area);
    while (grid[playerIdx] === 1) playerIdx = draw(area);
    const px = (playerIdx % inner) + 1;
    const py = Math.floor(playerIdx / inner) + 1;

    // The cells the player can reach by floor.
    const reach = [playerIdx];
    const seen = new Array(area).fill(false);
    seen[playerIdx] = true;
    for (let qi = 0; qi < reach.length; qi++) {
      const x = (reach[qi] % inner) + 1;
      const y = Math.floor(reach[qi] / inner) + 1;
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        if (nx < 1 || ny < 1 || nx > inner || ny > innerH) continue;
        const j = (ny - 1) * inner + (nx - 1);
        if (grid[j] === 1 || seen[j]) continue;
        seen[j] = true;
        reach.push(j);
      }
    }

    // Placing: distinct reachable floor cells; drifts also a Manhattan
    // step of at least 3 away from the player.
    const taken = new Set([playerIdx]);
    const place = (ok) => {
      const list = reach.filter((i) => {
        if (taken.has(i)) return false;
        return ok({ x: (i % inner) + 1, y: Math.floor(i / inner) + 1 });
      });
      if (list.length === 0) return null;
      const i = list[draw(list.length)];
      taken.add(i);
      return { x: (i % inner) + 1, y: Math.floor(i / inner) + 1 };
    };
    const far = (c) => Math.abs(c.x - px) + Math.abs(c.y - py) >= 3;
    const anywhere = () => true;

    const driftSpots = [];
    for (let i = 0; i < drifts; i++) {
      const c = place(far);
      if (c === null) return null;
      driftSpots.push({ ...c, dir: draw(4) });
    }
    const mergeSpots = [];
    const mergeCount = 1 + draw(3); // 1 to 3 merge pads
    for (let i = 0; i < mergeCount; i++) {
      const c = place(anywhere);
      if (c === null) return null;
      mergeSpots.push(c);
    }
    const spawnSpots = [];
    for (let i = 0; i < spawns; i++) {
      const c = place(anywhere);
      if (c === null) return null;
      spawnSpots.push(c);
    }
    const exit = place(anywhere);
    if (exit === null) return null;

    // Draw the map.
    const rows = [];
    for (let y = 0; y < height; y++) rows.push(new Array(width).fill('#'));
    for (let i = 0; i < area; i++) {
      const x = (i % inner) + 1;
      const y = Math.floor(i / inner) + 1;
      rows[y][x] = grid[i] === 1 ? '#' : '.';
    }
    rows[py][px] = '@';
    rows[exit.y][exit.x] = 'X';
    for (const c of mergeSpots) rows[c.y][c.x] = 'M';
    for (const c of spawnSpots) rows[c.y][c.x] = 'P';
    for (const c of driftSpots) rows[c.y][c.x] = DRIFT_CHARS[c.dir];
    const map = rows.map((row) => row.join(''));

    return { name, quorum, par, driftPeriod: 2, spawnEvery: 12, map };
  };

  for (let no = 0; no < 200; no++) {
    const def = attempt(no);
    if (def !== null) return def;
  }
  throw new Error('generateLevel: too little room to place the level pieces');
}
