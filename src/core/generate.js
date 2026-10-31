// Quorum Run — generated levels and the daily run (DESIGN.md §19).
//
// Everything here is pure: layouts are built only from the seeded PRNG of
// §3 (mulberry32 on a 32-bit unsigned state) started at `seed >>> 0`, so
// the same seed and options always give the same level. The PRNG is the
// exact algorithm of §3, inlined to keep this module self-contained.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Orthogonal steps; the drift start characters for up, right, down, left.
const STEP = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DRIFT_CHARS = ['^', '>', 'v', '<'];

// 32-bit FNV-1a over the string's UTF-16 code units.
export function hashSeed(text) {
  const s = String(text);
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

// The seed of a run for the given date, or null for other text.
export function dailySeed(date) {
  if (typeof date !== 'string' || !DATE_RE.test(date)) return null;
  return hashSeed('quorum-run:' + date);
}

// §3's PRNG: mulberry32. `rngNext(seed)` -> { value, seed };
// `rngInt(seed, n)` -> { value: Math.floor(v * n), seed }.
function rngNext(seed) {
  const t = (seed + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

function rngInt(seed, n) {
  const r = rngNext(seed);
  return { value: Math.floor(r.value * n), seed: r.seed };
}

// one = () => draw(n): the next integer in [0, n), advancing the stream.
function drawer(seed) {
  let state = seed >>> 0;
  return function draw(n) {
    const r = rngInt(state, n);
    state = r.seed;
    return r.value;
  };
}

const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const keyOf = (W, x, y) => y * W + x;

// A level definition out of an option value, or the default.
function pick(value, fallback, lo, hi) {
  const n = typeof value === 'number' && Number.isFinite(value)
    ? Math.floor(value)
    : fallback;
  return Math.min(hi, Math.max(lo, n));
}

const WALL_SHAPES = [
  (d) => [[0, 0]],                                                     // a stone
  (d) => d === 0 ? [[0, 0], [1, 0]] : [[0, 0], [0, 1]],                // a bar
  (d) => d === 0 ? [[0, 0], [1, 0], [2, 0]] : [[0, 0], [0, 1], [0, 2]],// a longer bar
];

// One randomized layout attempt. `mode` 0 is normal (walls and all the
// spacing rules); 1 drops the walls and keeps only the musts; 2 makes any
// feasible placement. Returns a level definition, or null to retry.
function buildAttempt(W, H, conf, draw, mode) {
  const x1 = W - 2; // last interior x
  const y1 = H - 2; // last interior y

  // The interior cells, in reading order; walls then features take them.
  const free = [];
  for (let y = 1; y <= y1; y++) for (let x = 1; x <= x1; x++) free.push({ x, y });

  const walls = new Set();
  if (mode === 0) {
    let clusters = Math.round((x1 * y1) / 60) + draw(2);
    clusters = Math.min(Math.max(0, clusters), 13);
    for (let c = 0; c < clusters; c++) {
      const cells = WALL_SHAPES[draw(WALL_SHAPES.length)](draw(2));
      const ax = 1 + draw(x1);
      const ay = 1 + draw(y1);
      for (const [dx, dy] of cells) {
        const x = ax + dx;
        const y = ay + dy;
        if (x >= 1 && x <= x1 && y >= 1 && y <= y1) walls.add(keyOf(W, x, y));
      }
    }
    for (let i = free.length - 1; i >= 0; i--) {
      if (walls.has(keyOf(W, free[i].x, free[i].y))) free.splice(i, 1);
    }
  }

  // Take a cell matching pred: some tries at random, then a scan. The cell
  // leaves the free list.
  function take(pred) {
    for (let i = 0; i < 25 && free.length > 0; i++) {
      const idx = draw(free.length);
      if (pred(free[idx])) return free.splice(idx, 1)[0];
    }
    for (let i = 0; i < free.length; i++) {
      if (pred(free[i])) return free.splice(i, 1)[0];
    }
    return null;
  }

  const open = (c) => {
    let n = 0;
    for (const [dx, dy] of STEP) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (x >= 1 && x <= x1 && y >= 1 && y <= y1 && !walls.has(keyOf(W, x, y))) n++;
    }
    return n;
  };

  // The player starts on a reasonably open cell.
  const start =
    take((c) => open(c) === 4) ||
    take((c) => open(c) >= 3) ||
    take(() => true);
  if (!start) return null;

  // The exit sits away from the start.
  const xMin = Math.max(3, Math.round((W + H) / 3.5));
  const exit =
    take((c) => dist(c, start) >= xMin) ||
    take((c) => dist(c, start) >= 2) ||
    take(() => true);
  if (!exit) return null;

  // Merge pads keep off both the start and the exit.
  const padCount = mode === 2 ? 1 : Math.max(1, Math.min(3, 1 + Math.floor((x1 * y1) / 90)));
  const pads = [];
  for (let i = 0; i < padCount; i++) {
    const pad =
      take((c) => dist(c, start) >= 2 && dist(c, exit) >= 2) ||
      take((c) => dist(c, start) + dist(c, exit) >= 3) ||
      take(() => true);
    if (!pad) return null;
    pads.push(pad);
  }

  // Drifts stay at least 3 steps (Manhattan) from the player.
  const drifts = [];
  for (let i = 0; i < conf.drifts; i++) {
    const drift =
      take((c) => dist(c, start) >= 3 && drifts.every((e) => dist(c, e) >= 3)) ||
      take((c) => dist(c, start) >= 3) ||
      (mode === 2 ? take(() => true) : null);
    if (!drift) return null;
    const dir = draw(4);
    drifts.push({ cell: drift, dir });
  }

  // Patch spawn points spread over the rest.
  const patches = [];
  for (let i = 0; i < conf.spawns; i++) {
    const p =
      take((c) => patches.every((q) => dist(c, q) >= 2) && dist(c, start) >= 2) ||
      take((c) => patches.every((q) => dist(c, q) >= 2)) ||
      take(() => true);
    if (!p) return null;
    patches.push(p);
  }

  // Everything placed must be reachable from the start.
  if (mode === 0) {
    const reached = new Set([keyOf(W, start.x, start.y)]);
    const queue = [start];
    while (queue.length > 0) {
      const c = queue.shift();
      for (const [dx, dy] of STEP) {
        const x = c.x + dx;
        const y = c.y + dy;
        if (x < 1 || x > x1 || y < 1 || y > y1) continue;
        const k = keyOf(W, x, y);
        if (walls.has(k) || reached.has(k)) continue;
        reached.add(k);
        queue.push({ x, y });
      }
    }
    const ok = (c) => reached.has(keyOf(W, c.x, c.y));
    if (!ok(exit) || !pads.every(ok) || !patches.every(ok) || !drifts.every((d) => ok(d.cell))) {
      return null;
    }
  }

  // Draw the map.
  const grid = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      row.push(border || (mode === 0 && walls.has(keyOf(W, x, y))) ? '#' : '.');
    }
    grid.push(row.join(''));
  }
  const put = (c, ch) => {
    grid[c.y] = grid[c.y].substring(0, c.x) + ch + grid[c.y].substring(c.x + 1);
  };
  put(start, '@');
  put(exit, 'X');
  pads.forEach((p) => put(p, 'M'));
  patches.forEach((p) => put(p, 'P'));
  drifts.forEach((d) => put(d.cell, DRIFT_CHARS[d.dir]));

  return {
    name: `Generated ${conf.seedInt}`,
    quorum: conf.quorum,
    par: Math.max(30, 24 + W + H + 6 * conf.drifts + 3 * conf.quorum),
    driftPeriod: 2,
    spawnEvery: 12,
    map: grid,
  };
}

// A level definition built only from the PRNG of §3 started at `seed >>> 0`.
// Options (all optional): width 15 (7 to 32), height 11 (7 to 24),
// drifts 2, spawns 4, quorum 5. Sizes out of range throw a RangeError.
export function generateLevel(seed, options) {
  const o = options || {};
  const width = o.width === undefined ? 15 : o.width;
  if (!Number.isInteger(width) || width < 7 || width > 32) {
    throw new RangeError(`width must be an integer from 7 to 32, got ${width}`);
  }
  const height = o.height === undefined ? 11 : o.height;
  if (!Number.isInteger(height) || height < 7 || height > 24) {
    throw new RangeError(`height must be an integer from 7 to 24, got ${height}`);
  }
  const area = (width - 2) * (height - 2);
  const conf = {
    seedInt: seed >>> 0,
    drifts: pick(o.drifts, 2, 0, Math.max(0, Math.floor((area - 4) / 3))),
    spawns: 0, // below
    quorum: pick(o.quorum, 5, 1, 1000),
  };
  conf.spawns = pick(o.spawns, 4, 1, Math.max(1, Math.floor((area - conf.drifts - 4) / 2)));

  const draw = drawer(seed >>> 0);
  for (let mode = 0; mode <= 2; mode++) {
    const tries = mode === 0 ? 48 : 8;
    for (let t = 0; t < tries; t++) {
      const def = buildAttempt(width, height, conf, draw, mode);
      if (def) return def;
    }
  }
  return null; // unreachable: mode 2 always places the counts.
}
