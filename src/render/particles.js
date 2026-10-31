// Particle effects over the grid (§23). Particles live in grid units: a
// cell's centre is at (x + 0.5, y + 0.5). Everything is pure: bursts draw
// from the PRNG of §3 and return the state that must be carried on.

import { rngNext } from '../core/rng.js';
import { CONFLICT_TICKS } from '../core/constants.js';
import { PALETTE } from './palette.js';

export const PARTICLE_TTL = 12;

// A burst of `count` particles at (x, y): each particle takes two draws of
// rngNext, an angle a = value * 2 * PI and a speed v = 0.05 + value * 0.1.
export function burst(x, y, color, count, seed) {
  const particles = [];
  let s = seed >>> 0;
  for (let i = 0; i < count; i++) {
    const angle = rngNext(s);
    const speed = rngNext(angle.seed);
    const a = angle.value * 2 * Math.PI;
    const v = 0.05 + speed.value * 0.1;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      ttl: PARTICLE_TTL,
      color,
    });
    s = speed.seed;
  }
  return { particles, seed: s };
}

// One tick on: each particle drifts, falls slightly, ages; the spent are gone.
export function stepParticles(particles) {
  const out = [];
  for (const p of particles) {
    const ttl = p.ttl - 1;
    if (ttl <= 0) continue;
    out.push({
      x: p.x + p.vx,
      y: p.y + p.vy,
      vx: p.vx,
      vy: p.vy + 0.01,
      ttl,
      color: p.color,
    });
  }
  return out;
}

// Bursts for a state's events, in event order. Pickup, merge, drop, and hit
// burst at the player's cell centre; a conflict bursts at each conflict that
// was just added (the ones keeping their full ttl). Other events make none.
export function particlesFor(state, seed) {
  const particles = [];
  let s = seed >>> 0;
  const px = state.player.x + 0.5;
  const py = state.player.y + 0.5;
  for (const event of state.events || []) {
    if (event === 'pickup') {
      const carried = state.carried || [];
      const color = carried.length
        ? PALETTE.agents[carried[carried.length - 1]]
        : PALETTE.accent;
      const b = burst(px, py, color, 6, s);
      particles.push(...b.particles);
      s = b.seed;
    } else if (event === 'merge') {
      const b = burst(px, py, PALETTE.accent, 12, s);
      particles.push(...b.particles);
      s = b.seed;
    } else if (event === 'drop' || event === 'hit') {
      const b = burst(px, py, PALETTE.danger, 10, s);
      particles.push(...b.particles);
      s = b.seed;
    } else if (event === 'conflict') {
      for (const c of state.conflicts || []) {
        if (c.ttl === CONFLICT_TICKS) {
          const b = burst(c.x + 0.5, c.y + 0.5, PALETTE.danger, 8, s);
          particles.push(...b.particles);
          s = b.seed;
        }
      }
    }
  }
  return { particles, seed: s };
}

// Draw operations, one circle per particle, in screen space.
export function particleOps(particles, layout) {
  const ops = [];
  for (const p of particles) {
    ops.push({
      op: 'circle',
      kind: 'particle',
      x: layout.ox + p.x * layout.cell,
      y: layout.oy + p.y * layout.cell,
      r: Math.max(1, layout.cell / 12),
      color: p.color,
    });
  }
  return ops;
}
