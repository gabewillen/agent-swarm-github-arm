import test from 'node:test';
import assert from 'node:assert/strict';
import { load, game, mulberry } from './helpers.mjs';

const parts = () => load('render/particles.js');

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

test('stepParticles moves, falls, and ages', async () => {
  const { stepParticles } = await parts();
  const p = Object.freeze({ x: 1, y: 1, vx: 0.1, vy: -0.05, ttl: 5, color: '#ffd400' });
  const [q] = stepParticles([p]);
  assert.ok(Math.abs(q.x - 1.1) < 1e-12);
  assert.ok(Math.abs(q.y - 0.95) < 1e-12);
  assert.ok(Math.abs(q.vy - -0.04) < 1e-12);
  assert.equal(q.ttl, 4);
  assert.equal(p.ttl, 5);
});

test('stepParticles drops spent particles', async () => {
  const { stepParticles } = await parts();
  assert.deepEqual(stepParticles([{ x: 0, y: 0, vx: 0, vy: 0, ttl: 1, color: '#ffd400' }]), []);
});

test('a burst is gone after PARTICLE_TTL steps', async () => {
  const { burst, stepParticles } = await parts();
  let ps = burst(0, 0, '#ffd400', 5, 1).particles;
  for (let i = 0; i < 11; i++) ps = stepParticles(ps);
  assert.equal(ps.length, 5);
  assert.equal(stepParticles(ps).length, 0);
});

test('particlesFor: a merge bursts 12 accent particles at the player', async () => {
  const { particlesFor } = await parts();
  const s = await game(['#######', '#@.P.M#', '#..X..#', '#######']);
  const r = particlesFor({ ...s, player: { x: 5, y: 1 }, events: ['merge'] }, 4);
  assert.equal(r.particles.length, 12);
  for (const p of r.particles) {
    assert.equal(p.color, '#ffd400');
    assert.equal(p.x, 5.5);
    assert.equal(p.y, 1.5);
  }
});

test('particlesFor: pickup in the carried colour, drop and hit in danger', async () => {
  const { particlesFor } = await parts();
  const s = await game(['#######', '#@.P.M#', '#..X..#', '#######']);
  const r = particlesFor({ ...s, carried: [0, 3], events: ['pickup', 'hit'] }, 4);
  assert.equal(r.particles.length, 16);
  assert.ok(r.particles.slice(0, 6).every((p) => p.color === '#4ade80'));
  assert.ok(r.particles.slice(6).every((p) => p.color === '#ff6b4a'));
});

test('particlesFor: conflicts burst at each new conflict', async () => {
  const { particlesFor } = await parts();
  const s = await game(['#######', '#@.P.M#', '#..X..#', '#######']);
  const r = particlesFor({ ...s, conflicts: [{ x: 2, y: 2, ttl: 10 }, { x: 4, y: 2, ttl: 3 }], events: ['conflict'] }, 4);
  assert.equal(r.particles.length, 8);
  assert.ok(r.particles.every((p) => p.x === 2.5 && p.y === 2.5));
});

test('particlesFor: no events, no particles, same seed', async () => {
  const { particlesFor } = await parts();
  const s = await game(['#######', '#@.P.M#', '#..X..#', '#######']);
  assert.deepEqual(particlesFor({ ...s, events: ['spawn', 'pause'] }, 4), { particles: [], seed: 4 });
});

test('particleOps draws circles in screen space', async () => {
  const { particleOps } = await parts();
  const ops = particleOps([{ x: 2, y: 3, vx: 0, vy: 0, ttl: 4, color: '#c79bff' }], { cell: 24, ox: 10, oy: 50 });
  assert.deepEqual(ops, [{ op: 'circle', kind: 'particle', x: 58, y: 122, r: 2, color: '#c79bff' }]);
  assert.equal(particleOps([{ x: 0, y: 0, vx: 0, vy: 0, ttl: 1, color: '#c79bff' }], { cell: 6, ox: 0, oy: 0 })[0].r, 1);
});
