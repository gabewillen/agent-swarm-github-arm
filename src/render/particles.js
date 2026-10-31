// Particle effects (DESIGN.md §23). Particles live in grid units: a cell's
// centre is `x + 0.5`, `y + 0.5`. All functions are pure.
import { CONFLICT_TICKS } from '../core/constants.js';
import { rngNext } from '../core/rng.js';
import { PALETTE } from './palette.js';

export const PARTICLE_TTL = 12;

// `count` particles at `(x, y)` from the seed: an angle draw, then a speed
// draw, two draws of `rngNext` per particle.
export function burst(x, y, color, count, seed) {
  const particles = [];
  let s = seed >>> 0;
  for (let i = 0; i < count; i++) {
    const angle = rngNext(s);
    s = angle.seed;
    const speed = rngNext(s);
    s = speed.seed;
    const a = angle.value * 2 * Math.PI;
    const v = 0.05 + speed.value * 0.1;
    particles.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      ttl: PARTICLE_TTL,
      color,
    });
  }
  return { particles, seed: s };
}

// One tick on: move, fall, age; spent particles are gone.
export function stepParticles(particles) {
  return particles
    .map((p) => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.01, ttl: p.ttl - 1 }))
    .filter((p) => p.ttl > 0);
}

// Bursts for the state's events, in event order, each at the player's cell
// centre; conflicts burst at the centre of each conflict fresh this step.
export function particlesFor(state, seed) {
  const particles = [];
  let s = seed >>> 0;
  const add = (x, y, color, count) => {
    const r = burst(x, y, color, count, s);
    s = r.seed;
    for (const p of r.particles) particles.push(p);
  };
  for (const event of state.events) {
    if (event === 'pickup') {
      const carried = state.carried;
      if (carried.length > 0) {
        add(state.player.x + 0.5, state.player.y + 0.5, PALETTE.agents[carried[carried.length - 1]], 6);
      }
    } else if (event === 'merge') {
      add(state.player.x + 0.5, state.player.y + 0.5, PALETTE.accent, 12);
    } else if (event === 'drop' || event === 'hit') {
      add(state.player.x + 0.5, state.player.y + 0.5, PALETTE.danger, 10);
    } else if (event === 'conflict') {
      for (const c of state.conflicts) {
        if (c.ttl === CONFLICT_TICKS) add(c.x + 0.5, c.y + 0.5, PALETTE.danger, 8);
      }
    }
  }
  return { particles, seed: s };
}

// One circle op per particle, in screen space.
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
