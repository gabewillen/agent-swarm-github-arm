// Shared helpers for the acceptance tests. Every test loads the module it
// exercises inside its own body, so a missing or broken module fails only
// the tests that need it and the total stays the same.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function load(rel) {
  return import(new URL(`../src/${rel}`, import.meta.url).href);
}

export function readRepo(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

export function srcFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.js')) out.push(relative(ROOT, p));
    }
  };
  walk(join(ROOT, 'src'));
  return out.sort();
}

// The test suite's own copy of DESIGN.md §3's PRNG, to compute expected
// values.
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

// A level definition with sensible defaults.
export function lvl(map, extra = {}) {
  return { name: 'test', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000, map, ...extra };
}

export async function game(map, extra = {}, seed = 1) {
  const { init } = await load('core/game.js');
  return init(seed, { levels: [lvl(map, extra)] });
}

export const NONE = { move: null, pause: false };
export const mv = (move) => ({ move, pause: false });

export async function play(state, moves) {
  const { step } = await load('core/game.js');
  let s = state;
  for (const m of moves) s = step(s, typeof m === 'string' || m === null ? mv(m) : m);
  return s;
}

export function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

// A minimal fake 2D context that records calls.
export function fakeCtx() {
  const calls = [];
  const ctx = { calls };
  for (const name of ['fillRect', 'beginPath', 'arc', 'fill', 'fillText', 'strokeRect', 'clearRect', 'stroke', 'moveTo', 'lineTo', 'save', 'restore']) {
    ctx[name] = (...args) => calls.push({ name, args, fillStyle: ctx.fillStyle, font: ctx.font });
  }
  return ctx;
}
