// Lab helpers for bot tests. Lives outside tests/, so it may use Node APIs.
// It loads src/core/bot.js copying it into a temp dir with a minimal
// constants.js when the real one has not landed yet, and it can build
// §5-style states by hand for the sections of the rules that the bot must
// respect. Integration tests use the real game.js and data/levels.js when
// they exist on disk and are skipped otherwise.
import { cpSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOT = 'src/core/bot.js';

// bot.js's only import; the stub spells DESIGN.md §2 verbatim.
const CONSTANTS = `export const CARRY_MAX = 3;
export const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
export const CLOCKWISE = ['up', 'right', 'down', 'left'];
`;

let botPromise = null;

export function loadBot() {
  if (!botPromise) botPromise = importBot();
  return botPromise;
}

async function importBot() {
  const real = join(ROOT, BOT);
  if (existsSync(join(ROOT, 'src/core/constants.js'))) {
    return import(pathToFileURL(real).href);
  }
  // A temp twin of src/core/ so the real bot.js can resolve its import.
  const dir = mkdtempSync(join(tmpdir(), 'quorum-bot-'));
  cpSync(join(ROOT, BOT), join(dir, 'bot.js'));
  writeFileSync(join(dir, 'constants.js'), CONSTANTS);
  return import(pathToFileURL(join(dir, 'bot.js')).href);
}

// A copy of DESIGN.md §4's parseLevel shape, just enough for bot states.
const DRIFT_CHARS = { '^': 'up', '>': 'right', 'v': 'down', '<': 'left' };

export function miniParse(map) {
  let start = null;
  const spawns = [];
  const drifts = [];
  const tiles = map.map((row, y) => {
    let out = '';
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '@') { start = { x, y }; out += '.'; }
      else if (ch === 'P') { spawns.push({ x, y }); out += '.'; }
      else if (DRIFT_CHARS[ch]) { drifts.push({ x, y, dir: DRIFT_CHARS[ch] }); out += '.'; }
      else out += ch;
    }
    return out;
  });
  return {
    name: 'lab', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000,
    width: tiles[0].length, height: tiles.length, tiles, start,
    spawns, drifts,
  };
}

// A state of §5's shape with sensible defaults, fresh patches per spawn.
export function mkState(map, over = {}, seed = 1) {
  const level = miniParse(map);
  const patches = over.patches !== undefined ? over.patches
    : level.spawns.map((s) => ({ x: s.x, y: s.y, color: 0 }));
  return {
    seed, tick: 0, levelTicks: 0, levels: [], levelIndex: 0, level,
    player: { ...level.start }, carried: [], patches,
    drifts: level.drifts.map((d) => ({ ...d })), conflicts: [],
    score: 0, lives: 3, merges: 0, open: false, invuln: 0,
    status: 'playing', paused: false, events: [], ...over,
  };
}

// Frozen copies for purity checks: any mutation the bot does would show.
export function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

// DESIGN.md §3's PRNG, for building reproducible test maps.
export function mulberry(seed) {
  const t = (seed + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

export function mulberryInt(seed, n) {
  const r = mulberry(seed);
  return { value: Math.floor(r.value * n), seed: r.seed };
}

export function fileExists(rel) {
  return existsSync(join(ROOT, rel));
}
