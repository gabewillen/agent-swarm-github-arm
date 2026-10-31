// §23 Particles: pure helpers, grid-unit space (a cell's centre is x + 0.5).
import { rngNext } from '../core/rng.js';
import { CONFLICT_TICKS } from '../core/constants.js';
import { PALETTE } from './palette.js';

export const PARTICLE_TTL = 12;

// count particles leaving (x, y); two rngNext draws each: angle, then speed.
export function burst(x, y, color, count, seed) {
  const particles = [];
  let s = seed;
  for (let i = 0; i < count; i++) {
    const a = rngNext(s);
    const b = rngNext(a.seed);
    const ang = a.value * 2 * Math.PI;
    const v = 0.05 + b.value * 0.1;
    particles.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, ttl: PARTICLE_TTL, color });
    s = b.seed;
  }
  return { particles, seed: s };
}

// One tick: drift by velocity, gravity on vy, age; spent particles go.
export function stepParticles(particles) {
  const out = [];
  for (const p of particles) {
    const ttl = p.ttl - 1;
    if (ttl <= 0) continue;
    out.push({ x: p.x + p.vx, y: p.y + p.vy, vx: p.vx, vy: p.vy + 0.01, ttl, color: p.color });
  }
  return out;
}

// Particles for a step's events, in event order, threaded through one seed.
export function particlesFor(state, seed) {
  const list = [];
  let s = seed;
  const px = state.player.x + 0.5;
  const py = state.player.y + 0.5;
  const carried = state.carried;
  for (const ev of state.events) {
    const bursts = [];
    if (ev === 'merge') bursts.push([px, py, PALETTE.accent, 12]);
    else if (ev === 'drop' || ev === 'hit') bursts.push([px, py, PALETTE.danger, 10]);
    else if (ev === 'pickup' && carried.length > 0) {
      bursts.push([px, py, PALETTE.agents[carried[carried.length - 1]], 6]);
    } else if (ev === 'conflict') {
      for (const c of state.conflicts) {
        if (c.ttl === CONFLICT_TICKS) bursts.push([c.x + 0.5, c.y + 0.5, PALETTE.danger, 8]);
      }
    }
    for (const [bx, by, color, n] of bursts) {
      const r = burst(bx, by, color, n, s);
      list.push(...r.particles);
      s = r.seed;
    }
  }
  return { particles: list, seed: s };
}

// Draw ops in screen space, one circle per particle.
export function particleOps(particles, layout) {
  return particles.map((p) => ({
    op: 'circle',
    kind: 'particle',
    x: layout.ox + p.x * layout.cell,
    y: layout.oy + p.y * layout.cell,
    r: Math.max(1, layout.cell / 12),
    color: p.color,
  }));
}
