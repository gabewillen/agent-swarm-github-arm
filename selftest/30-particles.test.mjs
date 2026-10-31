// agent-46's selfcheck of the particle effects (DESIGN.md §23), mirroring
// tests/30-particles.test.mjs's assertions with hand-built states, so it
// can run before src/core/game.js exists (four of the ten acceptance
// tests need the core through the helpers' `game`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE } from '../src/render/palette.js';
import { CONFLICT_TICKS } from '../src/core/constants.js';

// The module under test. It imports the PRNG of §3, the constants, and the
// palette — nothing owned by the rules.
const { burst, stepParticles, particlesFor, particleOps, PARTICLE_TTL } =
  await import('../src/render/particles.js');

// tests/helpers.mjs's copy of §3's mulberry32, to compute expected values.
function mulberry(seed) {
  const t = (seed + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

// A hand-built state in the shape the rules build (§5): every field the
// particles need, nothing from src/core/game.js.
function fakeState(overrides = {}) {
  return {
    player: { x: 4, y: 1 }, carried: [], conflicts: [], events: [], ...overrides,
  };
}

const TAU = 2 * Math.PI;

test('PARTICLE_TTL is 12', () => {
  assert.equal(PARTICLE_TTL, 12);
});

test('burst makes count particles from the seed exactly', () => {
  const r = burst(2.5, 3.5, PALETTE.accent, 3, 99);
  assert.equal(r.particles.length, 3);
  let s = 99;
  r.particles.forEach((p) => {
    const a = mulberry(s);
    const b = mulberry(a.seed);
    s = b.seed;
    const ang = a.value * TAU;
    const v = 0.05 + b.value * 0.1;
    assert.deepEqual(p, {
      x: 2.5, y: 3.5, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
      ttl: PARTICLE_TTL, color: PALETTE.accent,
    });
  });
  assert.equal(r.seed, s);
});

test('stepParticles moves, falls, and ages without touching its argument', () => {
  const p = Object.freeze({ x: 1, y: 1, vx: 0.1, vy: -0.05, ttl: 5, color: PALETTE.accent });
  const [q] = stepParticles([p]);
  assert.ok(Math.abs(q.x - 1.1) < 1e-12);
  assert.ok(Math.abs(q.y - 0.95) < 1e-12);
  assert.ok(Math.abs(q.vy - -0.04) < 1e-12);
  assert.equal(q.ttl, 4);
  assert.equal(p.ttl, 5);
});

test('stepParticles drops particles at ttl 0', () => {
  assert.deepEqual(
    stepParticles([{ x: 0, y: 0, vx: 0, vy: 0, ttl: 1, color: PALETTE.accent }]), [],
  );
});

test('a burst is gone after PARTICLE_TTL steps', () => {
  let ps = burst(0, 0, PALETTE.accent, 5, 1).particles;
  for (let i = 0; i < 11; i++) ps = stepParticles(ps);
  assert.equal(ps.length, 5);
  assert.equal(stepParticles(ps).length, 0);
});

test('a merge bursts 12 accent particles at the player', () => {
  const r = particlesFor(fakeState({ player: { x: 5, y: 1 }, events: ['merge'] }), 4);
  assert.equal(r.particles.length, 12);
  for (const p of r.particles) {
    assert.equal(p.color, PALETTE.accent);
    assert.equal(p.x, 5.5);
    assert.equal(p.y, 1.5);
  }
});

test('a pickup bursts 6 in the last carried patch colour; a hit 10 in danger', () => {
  const r = particlesFor(fakeState({ carried: [0, 3], events: ['pickup', 'hit'] }), 4);
  assert.equal(r.particles.length, 16);
  assert.ok(r.particles.slice(0, 6).every((p) => p.color === PALETTE.agents[0]));
  assert.ok(r.particles.slice(6).every((p) => p.color === PALETTE.danger));
});

test('a conflict bursts 8 in danger at each fresh conflict cell', () => {
  const r = particlesFor(
    fakeState({
      conflicts: [
        { x: 2, y: 2, ttl: CONFLICT_TICKS }, { x: 4, y: 2, ttl: CONFLICT_TICKS - 7 },
      ],
      events: ['conflict'],
    }),
    4,
  );
  assert.equal(r.particles.length, 8);
  assert.ok(r.particles.every((p) => p.x === 2.5 && p.y === 2.5));
});

test('events with no effect make no particles and spend no seed', () => {
  assert.deepEqual(
    particlesFor(fakeState({ events: ['spawn', 'pause', 'resume', 'lost'] }), 4),
    { particles: [], seed: 4 },
  );
});

test('particleOps draws one circle per particle in screen space', () => {
  const ops = particleOps(
    [{ x: 2, y: 3, vx: 0, vy: 0, ttl: 4, color: PALETTE.agents[0] }],
    { cell: 24, ox: 10, oy: 50 },
  );
  assert.deepEqual(ops, [
    { op: 'circle', kind: 'particle', x: 58, y: 122, r: 2, color: PALETTE.agents[0] },
  ]);
  const small = particleOps(
    [{ x: 0, y: 0, vx: 0, vy: 0, ttl: 1, color: PALETTE.agents[1] }],
    { cell: 6, ox: 0, oy: 0 },
  );
  assert.equal(small[0].r, 1);
});
