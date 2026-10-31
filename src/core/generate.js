// Quorum Run — generated levels and the daily run (DESIGN.md §19).
//
// A generated level is built only from the seeded PRNG of §3, started at
// `seed >>> 0`, so the same seed and options always give the same level:
// no `Math.random`, no clocks, just a fixed sequence of `rngInt` draws.
//
// Layout in brief: sprinkle a few small wall clusters, then place the
// drifts, the player, the exit, the merge pads, and the patch spawns on
// floor cells that are all reachable from the player, with every drift a
// Manhattan distance of at least three from the player. Attempts retry
// with sparser walls; the last attempt drops the walls entirely and fits
// the counts to the room, so generation always ends in a valid level.

import { rngInt } from './rng.js';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const DAILY_PREFIX = 'quorum-run:';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULTS = { width: 15, height: 11, drifts: 2, spawns: 4, quorum: 5 };
const WIDTH_RANGE = [7, 32];
const HEIGHT_RANGE = [7, 24];
const DRIFT_CHARS = ['^', '>', 'v', '<'];
const NEIGHBORS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DENSITIES = [0.2, 0.12, 0.05, 0];

export function hashSeed(text) {
  let h = FNV_OFFSET;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

export function dailySeed(date) {
  if (typeof date !== 'string' || !DATE_RE.test(date)) return null;
  return hashSeed(DAILY_PREFIX + date);
}

function dimOption(options, key, fallback, min, max) {
  let v = fallback;
  if (options[key] != null) v = options[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new RangeError(`generateLevel: ${key} must be an integer from ${min} to ${max}`);
  }
  return v;
}

function countOption(options, key, fallback) {
  let v = fallback;
  if (options[key] != null) v = options[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(0, Math.floor(v));
}

export function generateLevel(seed, options) {
  const u32 = seed >>> 0;
  const opts = options ?? {};
  const width = dimOption(opts, 'width', DEFAULTS.width, WIDTH_RANGE[0], WIDTH_RANGE[1]);
  const height = dimOption(opts, 'height', DEFAULTS.height, HEIGHT_RANGE[0], HEIGHT_RANGE[1]);
  const driftsWanted = countOption(opts, 'drifts', DEFAULTS.drifts);
  const spawnsWanted = Math.max(1, countOption(opts, 'spawns', DEFAULTS.spawns));
  const quorum = Math.max(1, countOption(opts, 'quorum', DEFAULTS.quorum));

  let s = u32;
  const pick = (n) => {
    const r = rngInt(s, n);
    s = r.seed;
    return r.value;
  };

  const cells = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) cells.push({ x, y });
  }
  const padCount = width * height >= 150 ? 2 : 1;
  const key = (x, y) => y * width + x;

  for (let attempt = 0; ; attempt++) {
    const density = attempt < DENSITIES.length ? DENSITIES[attempt] : 0;
    const fit = attempt >= DENSITIES.length;

    // The map: `#` border, floor inside.
    const map = [];
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        row.push(x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.');
      }
      map.push(row);
    }
    const isWall = (x, y) => map[y][x] === '#';

    // A few small wall clusters, grown from random cells.
    const wallTarget = Math.round(density * cells.length);
    let walls = 0;
    for (let tries = 0; walls < wallTarget && tries < wallTarget * 4 + 8; tries++) {
      const spot = cells[pick(cells.length)];
      if (isWall(spot.x, spot.y)) continue;
      map[spot.y][spot.x] = '#';
      walls++;
      if (pick(2) === 1) {
        const d = NEIGHBORS[pick(4)];
        const nx = spot.x + d[0];
        const ny = spot.y + d[1];
        if (nx > 0 && ny > 0 && nx < width - 1 && ny < height - 1 && map[ny][nx] === '.') {
          map[ny][nx] = '#';
          walls++;
        }
      }
    }

    // The player stands anywhere; every feature must be reachable from them.
    const start = cells[pick(cells.length)];
    if (isWall(start.x, start.y)) continue;

    const dist = new Map();
    const queue = [start];
    dist.set(key(start.x, start.y), 0);
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i];
      const d = dist.get(key(c.x, c.y));
      for (const [dx, dy] of NEIGHBORS) {
        const nx = c.x + dx;
        const ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (isWall(nx, ny) || dist.has(key(nx, ny))) continue;
        dist.set(key(nx, ny), d + 1);
        queue.push({ x: nx, y: ny });
      }
    }
    // Wall off pockets the player could never reach.
    for (const c of cells) {
      if (!isWall(c.x, c.y) && !dist.has(key(c.x, c.y))) map[c.y][c.x] = '#';
    }
    const reach = cells.filter((c) => dist.has(key(c.x, c.y)));
    const dv = (c) => dist.get(key(c.x, c.y)) ?? -1;

    // Count budget: player + exit + merge pads must all leave room.
    const need = 2 + padCount;
    let spawnN = spawnsWanted;
    let driftN = driftsWanted;
    if (fit) spawnN = Math.max(1, Math.min(spawnN, Math.max(0, reach.length - need)));
    if (reach.length < need + spawnN) continue;

    const taken = new Set([key(start.x, start.y)]);
    const open = () => reach.filter((c) => !taken.has(key(c.x, c.y)));
    const take = (pools) => {
      for (const ok of pools) {
        const pool = open().filter(ok);
        if (pool.length > 0) {
          const c = pool[pick(pool.length)];
          taken.add(key(c.x, c.y));
          return c;
        }
      }
      return null;
    };

    let failed = false;
    let exit = null;
    const pads = [];
    const spawns = [];
    const drifts = [];

    const exitCell = take([(c) => dv(c) >= 5, (c) => dv(c) >= 2, () => true]);
    if (exitCell) exit = exitCell;
    else failed = true;
    for (let i = 0; !failed && i < padCount; i++) {
      const pad = take([(c) => dv(c) >= 3, (c) => dv(c) >= 1, () => true]);
      if (pad) pads.push(pad);
      else failed = true;
    }
    for (let i = 0; !failed && i < spawnN; i++) {
      const sp = take([(c) => dv(c) >= 2, () => true]);
      if (sp) spawns.push(sp);
      else failed = true;
    }
    // Drifts sit at least three Manhattan steps from the player.
    if (!failed) {
      let pool = open().filter(
        (c) => Math.abs(c.x - start.x) + Math.abs(c.y - start.y) >= 3,
      );
      if (pool.length < driftN) {
        if (!fit) failed = true;
        else driftN = pool.length;
      }
      for (let i = 0; !failed && i < driftN; i++) {
        const j = pick(pool.length);
        drifts.push(pool.splice(j, 1)[0]);
      }
    }
    if (failed) continue;

    map[start.y][start.x] = '@';
    map[exit.y][exit.x] = 'X';
    for (const pad of pads) map[pad.y][pad.x] = 'M';
    for (const sp of spawns) map[sp.y][sp.x] = 'P';
    for (const d of drifts) map[d.y][d.x] = DRIFT_CHARS[pick(4)];

    const exitDist = dv(exit);
    const par = Math.max(30, Math.min(360, 30 + exitDist * 3 + padCount * 10));

    return {
      name: `Generated ${u32}`,
      quorum,
      par,
      driftPeriod: 2,
      spawnEvery: 12,
      map: map.map((row) => row.join('')),
    };
  }
}
