// Local hardening for §23 particles (DESIGN.md), beyond the acceptance
// tests: a second, independent look so a queue merge can't quietly
// regress the area. Green means exit 0.
import assert from 'node:assert/strict';
import { PARTICLE_TTL, burst, stepParticles, particlesFor, particleOps } from '../src/render/particles.js';
import { rngNext } from '../src/core/rng.js';
import { CONFLICT_TICKS } from '../src/core/constants.js';
import { PALETTE } from '../src/render/palette.js';
import { init } from '../src/core/game.js';

const lvl = (map, extra = {}) => ({ name: 'local-check', quorum: 1, par: 100, driftPeriod: 1, spawnEvery: 1000, map, ...extra });
const state = init(1, { levels: [lvl(['#######', '#@.P.M#', '#..X..#', '#######'])] });

// --- burst -----------------------------------------------------------------
// Deterministic: the same seed makes the same burst.
assert.deepEqual(burst(2.5, 3.5, PALETTE.accent, 5, 99), burst(2.5, 3.5, PALETTE.accent, 5, 99));

// Shape: count particles, all at (x, y), ttl PARTICLE_TTL, colour kept,
// speed strictly inside [0.05, 0.15), drawn in order from the seed.
{
  const { particles, seed } = burst(2.5, 3.5, PALETTE.agents[1], 4, 7);
  assert.equal(particles.length, 4);
  let s = 7;
  for (const p of particles) {
    const a = rngNext(s);
    const b = rngNext(a.seed);
    s = b.seed;
    assert.equal(p.x, 2.5);
    assert.equal(p.y, 3.5);
    assert.equal(p.ttl, PARTICLE_TTL);
    assert.equal(p.color, PALETTE.agents[1]);
    assert.equal(p.vx, Math.cos(a.value * 2 * Math.PI) * (0.05 + b.value * 0.1));
    assert.equal(p.vy, Math.sin(a.value * 2 * Math.PI) * (0.05 + b.value * 0.1));
    assert.ok(Math.hypot(p.vx, p.vy) >= 0.05 - 1e-12 && Math.hypot(p.vx, p.vy) < 0.15 + 1e-12);
  }
  assert.equal(seed, s);
}

// Zero count makes no particles and spends no draws: the seed passes through.
assert.deepEqual(burst(0, 0, PALETTE.accent, 0, 4242), { particles: [], seed: 4242 });

// --- stepParticles ---------------------------------------------------------
// Purity: the input is never touched.
{
  const p = Object.freeze({ x: 1, y: 1, vx: 0.1, vy: -0.05, ttl: 5, color: PALETTE.accent });
  const qs = stepParticles([p]);
  assert.deepEqual(p, { x: 1, y: 1, vx: 0.1, vy: -0.05, ttl: 5, color: PALETTE.accent });
  // Order: x += vx and y += vy use the old vy; gravity lands after.
  assert.deepEqual(qs, [{ x: 1.1, y: 0.95, vx: 0.1, vy: -0.04, ttl: 4, color: PALETTE.accent }]);
}

// Random ordinals settle: gravity is +0.01 per tick, position integrates.
{
  let ps = burst(0, 0, PALETTE.accent, 7, 3).particles;
  const steps = PARTICLE_TTL - 1;
  for (let i = 0; i < steps; i++) ps = stepParticles(ps);
  assert.equal(ps.length, 7);
  for (const p of ps) {
    assert.equal(p.ttl, 1);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
  assert.deepEqual(stepParticles(ps), []);
}

// Empty in, empty out.
assert.deepEqual(stepParticles([]), []);

// --- particlesFor ----------------------------------------------------------
// Every burst kind, in event order, chained over one seed.
{
  const s0 = 1234;
  const s = { ...state, player: { x: 3, y: 1 }, carried: [2, 0, 3], conflicts: [{ x: 4, y: 2, ttl: CONFLICT_TICKS }], events: ['pickup', 'merge', 'drop', 'hit', 'conflict'] };
  const r = particlesFor(s, s0);
  // 6 (pickup) + 12 (merge) + 10 (drop) + 10 (hit) + 8 (conflict).
  assert.equal(r.particles.length, 46);
  assert.deepEqual(r.particles.slice(0, 6).map((p) => p.color).every((c) => c === PALETTE.agents[3]) && r.particles.slice(0, 6).every((p) => p.x === 3.5 && p.y === 1.5), true, 'pickup: last carried colour at the player');
  assert.ok(r.particles.slice(6, 18).every((p) => p.color === PALETTE.accent && p.x === 3.5 && p.y === 1.5));
  assert.ok(r.particles.slice(18, 38).every((p) => p.color === PALETTE.danger && p.x === 3.5 && p.y === 1.5));
  assert.ok(r.particles.slice(38).every((p) => p.color === PALETTE.danger && p.x === 4.5 && p.y === 2.5));

  // The seed equals running the same bursts by hand, chained.
  let hand = s0;
  const chain = (r2) => { hand = r2.seed; };
  chain(burst(3.5, 1.5, PALETTE.agents[3], 6, hand));
  chain(burst(3.5, 1.5, PALETTE.accent, 12, hand));
  chain(burst(3.5, 1.5, PALETTE.danger, 10, hand));
  chain(burst(3.5, 1.5, PALETTE.danger, 10, hand));
  chain(burst(4.5, 2.5, PALETTE.danger, 8, hand));
  assert.equal(r.seed, hand);
}

// Two conflicts born this step: 8 each, in conflict-array order; an older
// conflict (a decayed ttl) bursts none.
{
  const s = { ...state, conflicts: [{ x: 2, y: 1, ttl: CONFLICT_TICKS }, { x: 4, y: 1, ttl: 3 }, { x: 3, y: 3, ttl: CONFLICT_TICKS }], events: ['conflict'] };
  const r = particlesFor(s, 5);
  assert.equal(r.particles.length, 16);
  assert.ok(r.particles.slice(0, 8).every((p) => p.x === 2.5 && p.y === 1.5));
  assert.ok(r.particles.slice(8).every((p) => p.x === 3.5 && p.y === 3.5));
}

// Two conflict events (two cells, reading order): each one bursts every
// newly born conflict it sees — one per cell in the real game, so the
// counts of this module double only in a hand-made state; the acceptance
// shape is one event.
{
  const s = { ...state, conflicts: [{ x: 2, y: 1, ttl: CONFLICT_TICKS }], events: ['conflict', 'conflict'] };
  assert.equal(particlesFor(s, 5).particles.length, 16);
}

// Other events make none; the seed passes through untouched.
for (const events of [[], ['spawn'], ['pause'], ['resume'], ['quorum'], ['level'], ['won'], ['lost']]) {
  const r = particlesFor({ ...state, events }, 777);
  assert.deepEqual(r, { particles: [], seed: 777 });
}

// A paused or non-playing state with empty events makes no particles.
assert.deepEqual(particlesFor({ ...state, events: [] }, 9), { particles: [], seed: 9 });

// --- particleOps -----------------------------------------------------------
{
  const ops = particleOps([{ x: 2, y: 3, vx: 0, vy: 0, ttl: 4, color: PALETTE.agents[0] }], { cell: 24, ox: 10, oy: 50 });
  assert.deepEqual(ops, [{ op: 'circle', kind: 'particle', x: 58, y: 122, r: 2, color: PALETTE.agents[0] }]);
}
// Radius clamps at 1 for small cells and keeps order and colour.
{
  const ps = [{ x: 0, y: 0, vx: 0, vy: 0, ttl: 1, color: PALETTE.agents[0] }, { x: 1.5, y: 2.5, vx: 0, vy: 0, ttl: 2, color: PALETTE.danger }];
  const ops = particleOps(ps, { cell: 6, ox: 0, oy: 0 });
  assert.equal(ops[0].r, 1);
  assert.equal(ops[1].x, 1.5 * 6);
  assert.equal(ops[1].color, PALETTE.danger);
  assert.deepEqual(particleOps([], { cell: 10, ox: 0, oy: 0 }), []);
}

console.log('particles local checks: all pass');
