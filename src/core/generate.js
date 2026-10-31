// §19 — generated levels and the daily run. Pure data in, plain data out:
// no DOM, no clock, no ambient randomness, nothing Node-only. Every random choice
// comes from the PRNG of §3 started at `seed >>> 0`, so the same seed and
// options build the same level, and most seeds build a different one.

// The PRNG of §3 (mulberry32 on a 32-bit unsigned state), verbatim, so this
// module stands alone; `value` is in [0, 1) and `seed` the next state.
function rngValue(state) {
  const t = (state + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

const FNV_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

// `hashSeed(text)` is 32-bit FNV-1a over the string's UTF-16 code units:
// start at the basis; for each code unit, xor it in, then multiply by the
// prime and keep the unsigned 32 bits.
export function hashSeed(text) {
  let h = FNV_BASIS;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

// `dailySeed(date)` hashes 'quorum-run:' + `date`; a string that is not of
// the YYYY-MM-DD shape, or whose month or day is out of range, gives null.
export function dailySeed(date) {
  if (typeof date !== 'string' || !DATE_SHAPE.test(date)) return null;
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return hashSeed('quorum-run:' + date);
}

// Drift characters in DIRS order (up, right, down, left).
const DIR_CHARS = ['^', '>', 'v', '<'];
const DEFAULTS = { width: 15, height: 11, drifts: 2, spawns: 4, quorum: 5 };

function optionInt(raw, fallback, low, high, what) {
  const v = raw === undefined ? fallback : raw;
  if (!Number.isInteger(v)) {
    throw new RangeError(`generateLevel: ${what} must be an integer, got ${String(raw)}`);
  }
  if (v < low || v > high) {
    throw new RangeError(`generateLevel: ${what} ${v} is out of range ${low}..${high}`);
  }
  return v;
}

// The layout is an open floor with a sparse scatter of single-cell wall
// pillars. Pillars are never 4-adjacent and never split the floor, so the
// player's start reaches every pad, spawn point, and the exit; drifts start
// at least 3 steps away, and the exit at least 3 from the start. The one
// draw order below fixes determinism.
export function generateLevel(seed, options) {
  const o = options ?? {};
  const width = optionInt(o.width, DEFAULTS.width, 7, 32, 'width');
  const height = optionInt(o.height, DEFAULTS.height, 7, 24, 'height');
  const drifts = optionInt(o.drifts, DEFAULTS.drifts, 0, Infinity, 'drifts');
  const spawns = optionInt(o.spawns, DEFAULTS.spawns, 1, Infinity, 'spawns');
  const quorum = optionInt(o.quorum, DEFAULTS.quorum, 1, Infinity, 'quorum');

  const iw = width - 2; // interior cells across
  const ih = height - 2; // interior cells down
  const area = iw * ih;
  const pillarMax = Math.floor(area / 32);
  if (pillarMax + drifts + spawns + 4 > area) {
    throw new RangeError(`generateLevel: ${width}x${height} is too small for ${drifts} drifts and ${spawns} spawn points`);
  }

  let s = seed >>> 0;
  const draw = (n) => {
    const r = rngValue(s);
    s = r.seed;
    return Math.floor(r.value * n);
  };

  // Free interior cells, in reading order (map coordinates x: 1..iw, y: 1..ih).
  const free = [];
  for (let y = 1; y <= ih; y++) {
    for (let x = 1; x <= iw; x++) free.push({ x, y });
  }
  const keyOf = (c) => (c.y - 1) * iw + (c.x - 1);
  const pillarKeys = new Set();
  const pillars = [];
  const pillarAt = (x, y) => x >= 1 && x <= iw && y >= 1 && y <= ih && pillarKeys.has(keyOf({ x, y }));

  // True when the floor (interior minus pillars) is one 4-connected piece,
  // so the §4 unreachable check can never fire for the level.
  const floorConnected = () => {
    let source = -1;
    for (let i = 0; i < area && source < 0; i++) {
      if (!pillarKeys.has(i)) source = i;
    }
    if (source < 0) return false;
    const seen = new Set([source]);
    const stack = [source];
    while (stack.length) {
      const i = stack.pop();
      const x = i % iw;
      const y = (i - x) / iw;
      const near = [];
      if (x > 0) near.push(i - 1);
      if (x < iw - 1) near.push(i + 1);
      if (y > 0) near.push(i - iw);
      if (y < ih - 1) near.push(i + iw);
      for (const n of near) {
        if (pillarKeys.has(n) || seen.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
    return seen.size === area - pillarKeys.size;
  };

  // Pillars: one per accepted cell, never 4-adjacent to another, and only
  // when the floor stays connected. Each attempt is exactly one draw.
  const pillarCount = draw(pillarMax + 1);
  for (let i = 0; i < pillarCount; i++) {
    for (let attempt = 0; attempt < 24 && free.length > 0; attempt++) {
      const c = free[draw(free.length)];
      const adjacent = pillarAt(c.x - 1, c.y) || pillarAt(c.x + 1, c.y)
        || pillarAt(c.x, c.y - 1) || pillarAt(c.x, c.y + 1);
      if (adjacent) continue;
      pillarKeys.add(keyOf(c));
      if (floorConnected()) {
        free.splice(free.indexOf(c), 1);
        pillars.push(c);
        break;
      }
      pillarKeys.delete(keyOf(c));
    }
  }

  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  // Pick and remove a free cell; a distance filter that nothing satisfies
  // falls back to any free cell (unreachable for the layouts above).
  const take = (filter) => {
    let list = filter ? free.filter(filter) : free;
    if (list.length === 0) list = free;
    const c = list[draw(list.length)];
    free.splice(free.indexOf(c), 1);
    return c;
  };

  const start = take();
  const exit = take((c) => dist(c, start) >= 3);
  const padCount = 1 + draw(2); // one or two merge pads
  const pads = [];
  for (let i = 0; i < padCount; i++) pads.push(take((c) => dist(c, start) >= 2));
  const spawnCells = [];
  for (let i = 0; i < spawns; i++) spawnCells.push(take());
  const driftDefs = [];
  for (let i = 0; i < drifts; i++) {
    const c = take((c) => dist(c, start) >= 3);
    driftDefs.push({ x: c.x, y: c.y, dir: DIR_CHARS[draw(4)] });
  }

  const grid = [];
  for (let y = 0; y < ih; y++) grid.push(new Array(iw).fill('.'));
  const put = (c, ch) => { grid[c.y - 1][c.x - 1] = ch; };
  for (const c of pillars) put(c, '#');
  put(start, '@');
  put(exit, 'X');
  for (const c of pads) put(c, 'M');
  for (const c of spawnCells) put(c, 'P');
  for (const d of driftDefs) put(d, d.dir);

  const map = ['#'.repeat(width)];
  for (let y = 0; y < ih; y++) map.push('#' + grid[y].join('') + '#');
  map.push('#'.repeat(width));

  assertSane(map, spawns, drifts);

  return {
    name: `Generated ${seed >>> 0}`,
    quorum,
    par: 30 + width + height + 2 * quorum, // at least 30
    driftPeriod: 2,
    spawnEvery: 12,
    map,
  };
}

// The map above meets §4's shape rules by construction; this only turns a
// generation bug into a loud failure instead of a quietly bad level.
function assertSane(map, spawnCount, driftCount) {
  const fail = (why) => { throw new Error(`generateLevel: broken map (${why})`); };
  const h = map.length;
  const w = map[0].length;
  if (h < 1 || w < 1 || !map.every((row) => typeof row === 'string' && row.length === w)) {
    fail('shape');
  }
  let starts = 0;
  let exits = 0;
  let pads = 0;
  let spawns = 0;
  let drifts = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = map[y][x];
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        if (ch !== '#') fail('border');
      } else if (ch === '@') {
        starts++;
        sx = x;
        sy = y;
      } else if (ch === 'X') {
        exits++;
      } else if (ch === 'M') {
        pads++;
      } else if (ch === 'P') {
        spawns++;
      } else if ('^>v<'.includes(ch)) {
        drifts++;
      } else if (ch !== '.' && ch !== '#') {
        fail(`char ${JSON.stringify(ch)}`);
      }
    }
  }
  if (starts !== 1 || exits !== 1 || pads < 1 || spawns !== spawnCount || drifts !== driftCount) {
    fail('counts');
  }
  // Every P, M, and X must be reachable from the @ through non-wall cells.
  const w2 = w;
  const seen = new Set([sy * w2 + sx]);
  const stack = [sy * w2 + sx];
  while (stack.length) {
    const i = stack.pop();
    const x = i % w2;
    const y = (i - x) / w2;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w2 + nx;
      if (seen.has(j) || map[ny][nx] === '#') continue;
      seen.add(j);
      stack.push(j);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = map[y][x];
      if ((ch === 'P' || ch === 'M' || ch === 'X') && !seen.has(y * w2 + x)) {
        fail(`unreachable ${ch} at ${x},${y}`);
      }
    }
  }
}
