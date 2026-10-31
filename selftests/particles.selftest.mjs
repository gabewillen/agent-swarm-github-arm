// agent-27's own regression tests for src/render/particles.js (§23).
// These hand-build states, so they run even while src/core/game.js is
// still being built by another agent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry } from '../tests/helpers.mjs';

const parts = () => import('../src/render/particles.js');

test.skip('game-dependent particlesFor state', () => {});

test('PARTICLE_TTL is 12', async () => {
  assert.equal((await parts()).PARTICLE_TTL, 12);
});

test('burst makes count particles from the seed exactly', async () => {
  const { burst } = await parts();
  const r = burst(2.5, 3.5, '#ffd400', 3, 99);
  assert.equal(r.particles.length, 3);
  let s = 99;
  r.particles.forEach((p) => {
    const a = mulberry(s);
    const b = mulberry(a.seed);
    s = b.seed;
    const ang = a.value * 2 * Math.PI;
    const v = 0.05 + b.value * 0.1;
    assert.deepEqual(p, { x: 2.5, y: 3.5, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, ttl: 12, color: '#ffd400' });
  });
  assert.equal(r.seed, s);
});

test('burst of 0 makes nothing and keeps the seed', async () => {
  const { burst } = await parts();
  assert.deepEqual(burst(1, 1, '#c79bff', 0, 7), { particles: [], seed: 7 });
});

test('stepParticles moves, falls, and ages, without mutating', async () => {
  const { stepParticles } = await parts();
  const p = Object.freeze({ x: 1, y: 1, vx: 0.1, vy: -0.05, ttl: 5, color: '#ffd400' });
  const before = structuredClone(p);
  const [q] = stepParticles([p]);
  assert.ok(Math.abs(q.x - 1.1) < 1e-12);
  assert.ok(Math.abs(q.y - 0.95) < 1e-12);
  assert.ok(Math.abs(q.vy - -0.04) < 1e-12);
  assert.equal(q.ttl, 4);
  assert.deepEqual(p, before);
});

test('stepParticles drops spent particles', async () => {
  const { stepParticles } = await parts();
  assert.deepEqual(stepParticles([{ x: 0, y: 0, vx: 0, vy: 0, ttl: 1, color: '#ffd400' }]), []);
  assert.deepEqual(stepParticles([]), []);
});

test('a burst is gone after PARTICLE_TTL steps', async () => {
  const { burst, stepParticles } = await parts();
  let ps = burst(0, 0, '#ffd400', 5, 1).particles;
  for (let i = 0; i < 11; i++) ps = stepParticles(ps);
  assert.equal(ps.length, 5);
  assert.equal(stepParticles(ps).length, 0);
});

const state = { player: { x: 5, y: 1 }, carried: [], conflicts: [], events: [] };

test('particlesFor: a merge bursts 12 accent particles at the player', async () => {
  const { particlesFor } = await parts();
  const r = particlesFor({ ...state, events: ['merge'] }, 4);
  assert.equal(r.particles.length, 12);
  for (const p of r.particles) {
    assert.equal(p.color, '#ffd400');
    assert.equal(p.x, 5.5);
    assert.equal(p.y, 1.5);
  }
  assert.notEqual(r.seed, 4);
});

test('particlesFor: pickup in the carried colour, drop and hit in danger', async () => {
  const { particlesFor } = await parts();
  const r = particlesFor({ ...state, carried: [0, 3], events: ['pickup', 'hit'] }, 4);
  assert.equal(r.particles.length, 16);
  r.particles.slice(0, 6).forEach((p) => {
    assert.equal(p.color, '#4ade80');
    assert.equal(p.x, 5.5);
    assert.equal(p.y, 1.5);
  });
  assert.ok(r.particles.slice(6).every((p) => p.color === '#ff6b4a'));

  const drop = particlesFor({ ...state, carried: [1], events: ['drop'] }, 4);
  assert.ok(drop.particles.every((p) => p.color === '#ff6b4a'));
  const pick0 = particlesFor({ ...state, carried: [1, 11, 0], events: ['pickup'] }, 4);
  assert.ok(pick0.particles.every((p) => p.color === '#c79bff'));
});

test('particlesFor: conflicts burst at each new conflict only', async () => {
  const { particlesFor } = await parts();
  const r = particlesFor({
    ...state,
    conflicts: [{ x: 2, y: 2, ttl: 10 }, { x: 4, y: 2, ttl: 3 }, { x: 6, y: 0, ttl: 10 }],
    events: ['conflict'],
  }, 4);
  assert.equal(r.particles.length, 16);
  const cells = new Set(r.particles.map((p) => `${p.x},${p.y}`));
  assert.deepEqual([...cells].sort(), ['2.5,2.5', '6.5,0.5']);
});

test('particlesFor: no events, no particles, same seed', async () => {
  const { particlesFor } = await parts();
  assert.deepEqual(particlesFor({ ...state, events: ['spawn', 'pause', 'resume', 'quorum', 'won', 'lost', 'level'] }, 4), { particles: [], seed: 4 });
  const empty = particlesFor({ ...state }, 9);
  assert.deepEqual(empty, { particles: [], seed: 9 });
  // §23 doesn't name a colour for a pickup with nothing carried; the
  // merged module (via PR #524) shows the accent, so we test that.
  const noPickup = particlesFor({ ...state, carried: [], events: ['pickup'] }, 9);
  assert.equal(noPickup.particles.length, 6);
  assert.ok(noPickup.particles.every((p) => p.color === '#ffd400'));
});

test('particlesFor: events fire in event order with the seed chained', async () => {
  const { burst, particlesFor } = await parts();
  const r = particlesFor({ ...state, carried: [2], conflicts: [{ x: 2, y: 2, ttl: 10 }], events: ['pickup', 'merge', 'conflict'] }, 100);
  let s = 100;
  const expected = [];
  const at = (x, y, color, count) => {
    const b = burst(x, y, color, count, s);
    expected.push(...b.particles);
    s = b.seed;
  };
  at(5.5, 1.5, '#ff9f45', 6);
  at(5.5, 1.5, '#ffd400', 12);
  at(2.5, 2.5, '#ff6b4a', 8);
  assert.deepEqual(r, { particles: expected, seed: s });
});

test('particleOps draws circles in screen space', async () => {
  const { particleOps } = await parts();
  const ops = particleOps([{ x: 2, y: 3, vx: 0, vy: 0, ttl: 4, color: '#c79bff' }], { cell: 24, ox: 10, oy: 50 });
  assert.deepEqual(ops, [{ op: 'circle', kind: 'particle', x: 58, y: 122, r: 2, color: '#c79bff' }]);
  assert.equal(particleOps([{ x: 0, y: 0, vx: 0, vy: 0, ttl: 1, color: '#c79bff' }], { cell: 6, ox: 0, oy: 0 })[0].r, Math.max(1, 0.5));
  assert.deepEqual(particleOps([], { cell: 24, ox: 0, oy: 0 }), []);
});
