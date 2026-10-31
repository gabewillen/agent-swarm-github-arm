// §19: generated levels and the daily run. Built only from the PRNG of §3,
// which this module inlines so it has no imports and stays loadable on its
// own. Pure: it touches no DOM and no clock, and draws no randomness of its
// own.

// §3, mulberry32 on a 32-bit unsigned state.
function rngNext(seed) {
  const t = (seed + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

// §3: an integer in [0, n).
function rngInt(seed, n) {
  const r = rngNext(seed);
  return { value: Math.floor(r.value * n), seed: r.seed };
}

// 32-bit FNV-1a over the string's UTF-16 code units.
export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The daily run's seed for a YYYY-MM-DD string, or null for any other text.
export function dailySeed(text) {
  if (typeof text !== 'string' || !DATE_RE.test(text)) return null;
  return hashSeed('quorum-run:' + text);
}

const DIR_NAMES = ['up', 'right', 'down', 'left'];
const DIR_CHARS = { up: '^', right: '>', down: 'v', left: '<' };

export function generateLevel(levelSeed, options) {
  const o = options || {};
  const width = o.width === undefined ? 15 : o.width;
  const height = o.height === undefined ? 11 : o.height;
  if (!Number.isInteger(width) || width < 7 || width > 32) {
    throw new RangeError(`width ${width} is out of range 7 to 32`);
  }
  if (!Number.isInteger(height) || height < 7 || height > 24) {
    throw new RangeError(`height ${height} is out of range 7 to 24`);
  }
  let drifts = countOr(2, o.drifts, 0);
  let spawns = countOr(4, o.spawns, 1);
  const quorum = countOr(5, o.quorum, 1);

  // The map starts all floor inside a wall border; solid pillars remain on
  // the even-even lattice, each kept with its own draw. Pillars never
  // disconnect the floor, so every later cell placed on it is reachable.
  let seed = levelSeed >>> 0;
  const draw = (n) => {
    const r = rngInt(seed, n);
    seed = r.seed;
    return r.value;
  };
  const grid = [];
  for (let y = 0; y < height; y++) grid.push(new Array(width).fill('#'));
  for (let y = 1; y <= height - 2; y++) {
    for (let x = 1; x <= width - 2; x++) {
      grid[y][x] = (x % 2 === 0 && y % 2 === 0 && draw(100) < 45) ? '#' : '.';
    }
  }
  const floor = [];
  for (let y = 1; y <= height - 2; y++) {
    for (let x = 1; x <= width - 2; x++) {
      if (grid[y][x] === '.') floor.push({ x, y });
    }
  }
  // Shuffle the floor cells with a Fisher-Yates pass; every placement then
  // takes the first acceptable cell in this order, with looser fallbacks.
  for (let i = floor.length - 1; i > 0; i--) {
    const j = draw(i + 1);
    const t = floor[i];
    floor[i] = floor[j];
    floor[j] = t;
  }

  const key = (x, y) => y * width + x;
  // Distances from a cell over the floor, by BFS.
  const distances = (from) => {
    const dist = new Map();
    dist.set(key(from.x, from.y), 0);
    const queue = [from];
    while (queue.length > 0) {
      const c = queue.shift();
      const d = dist.get(key(c.x, c.y)) + 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx === 0) === (dy === 0)) continue;
          const x = c.x + dx;
          const y = c.y + dy;
          const k = key(x, y);
          if (y < 0 || y >= height || x < 0 || x >= width) continue;
          if (grid[y][x] !== '.' || dist.has(k)) continue;
          dist.set(k, d);
          queue.push({ x, y });
        }
      }
    }
    return dist;
  };

  const start = floor[0];
  grid[start.y][start.x] = '@';
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  // The exit is the reachable cell farthest from the start; ties keep the
  // first in shuffle order.
  const dist = distances(start);
  let exit = null;
  let exitDist = 0;
  for (const c of floor) {
    const d = dist.get(key(c.x, c.y));
    if (d !== undefined && d > exitDist) {
      exit = c;
      exitDist = d;
    }
  }
  grid[exit.y][exit.x] = 'X';
  const used = [start, exit];

  const away = (list, min) => (c) => {
    for (const u of list) {
      if (manhattan(c, u) < min) return false;
    }
    return true;
  };
  const notUsed = (c) => {
    for (const u of used) {
      if (u.x === c.x && u.y === c.y) return false;
    }
    return true;
  };

  // The merge pad sits at least 3 floor steps from the start, away from the
  // exit; patches spread out; drifts start at least 3 steps from the player
  // (§19, kept at every level of fallback) and, when the room allows it,
  // away from the exit and the pad so they cannot camp on them.
  const mergeRules = [
    (c) => notUsed(c) && (dist.get(key(c.x, c.y)) ?? 0) >= 3 && away([exit], 2)(c),
    (c) => notUsed(c),
  ];
  const patchRules = [
    (c) => notUsed(c) && away(used, 2)(c),
    (c) => notUsed(c) && away([start, exit, merge], 2)(c),
    (c) => notUsed(c),
  ];
  const driftRules = [
    (c) => notUsed(c) && manhattan(c, start) >= 3 && away(used, 2)(c),
    (c) => notUsed(c) && manhattan(c, start) >= 3,
    (c) => notUsed(c),
  ];
  const takeRules = (rules) => {
    for (const rule of rules) {
      const cell = floor.find(rule);
      if (cell) return cell;
    }
    return null;
  };

  // A merge pad, then the spawn points and drifts, each placed by the first
  // rule, in fallback order, that has a cell left.
  const merge = takeRules(mergeRules);
  used.push(merge);
  const room = floor.length - used.length;
  drifts = Math.max(0, Math.min(drifts, room - spawns));
  spawns = Math.max(1, Math.min(spawns, room - drifts));
  drifts = Math.max(0, Math.min(drifts, room - spawns));
  const patches = [];
  for (let i = 0; i < spawns; i++) {
    const cell = takeRules(patchRules);
    used.push(cell);
    patches.push(cell);
  }
  const driftCells = [];
  for (let i = 0; i < drifts; i++) {
    const cell = takeRules(driftRules);
    used.push(cell);
    driftCells.push(cell);
  }

  for (const c of patches) grid[c.y][c.x] = 'P';
  // The rules above always find a cell while used stays under floor.length.
  grid[merge.y][merge.x] = 'M';
  for (const c of driftCells) {
    grid[c.y][c.x] = DIR_CHARS[DIR_NAMES[draw(4)]];
  }

  // §19: par at least 30, scaled a little by the route and the quorum.
  const par = Math.max(30, exitDist * 3 + quorum * 10);
  return {
    name: `Generated ${levelSeed >>> 0}`,
    quorum,
    par,
    driftPeriod: 2,
    spawnEvery: 12,
    map: grid.map((row) => row.join('')),
  };
}

function countOr(defaultValue, value, min) {
  if (value === undefined) return defaultValue;
  return Number.isInteger(value) ? Math.max(min, value) : defaultValue;
}
