// Particle effects (DESIGN.md §23). Particles live in grid units: a cell's
// centre is x + 0.5, y + 0.5. Pure throughout; randomness comes only from
// the seed the caller passes, never Math.random.
import { CONFLICT_TICKS } from '../core/constants.js';
import { rngNext } from '../core/rng.js';
import { PALETTE } from './palette.js';

export const PARTICLE_TTL = 12;

// A burst of `count` particles at (x, y), each born of two draws of rngNext:
// first an angle a = value * 2 * PI, then a speed v = 0.05 + value * 0.1.
// Returns { particles, seed } with the PRNG state after every draw.
export function burst(x, y, color, count, seed) {
  let s = seed >>> 0;
  const particles = [];
  for (let i = 0; i < count; i += 1) {
    const angle = rngNext(s);
    const speed = rngNext(angle.seed);
    s = speed.seed;
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
  }
  return { particles, seed: s };
}

// One tick on: drift by velocity, then gravity nudges vy by +0.01, then the
// ttl runs down and the spent ones are gone. Never changes its argument.
export function stepParticles(particles) {
  const next = particles.map((p) => ({
    x: p.x + p.vx,
    y: p.y + p.vy,
    vx: p.vx,
    vy: p.vy + 0.01,
    ttl: p.ttl - 1,
    color: p.color,
  }));
  return next.filter((p) => p.ttl > 0);
}

// Bursts for a step's events, in event order, chained over one seed.
// pickup: 6 particles in the last carried patch's agent colour; merge: 12
// in the accent; drop and hit: 10 in the danger colour, all at the player's
// cell centre; conflict: 8 in the danger colour at the centre of each
// conflict born this step (ttl CONFLICT_TICKS). Other events make none.
export function particlesFor(state, seed) {
  let s = seed >>> 0;
  const particles = [];
  const chain = (r) => {
    particles.push(...r.particles);
    s = r.seed;
  };
  for (const event of state.events || []) {
    if (event === 'pickup') {
      const carried = state.carried || [];
      const colorIndex = carried.length > 0 ? carried[carried.length - 1] : 0;
      chain(burst(state.player.x + 0.5, state.player.y + 0.5, PALETTE.agents[colorIndex], 6, s));
    } else if (event === 'merge') {
      chain(burst(state.player.x + 0.5, state.player.y + 0.5, PALETTE.accent, 12, s));
    } else if (event === 'drop' || event === 'hit') {
      chain(burst(state.player.x + 0.5, state.player.y + 0.5, PALETTE.danger, 10, s));
    } else if (event === 'conflict') {
      for (const c of state.conflicts || []) {
        if (c.ttl === CONFLICT_TICKS) {
          chain(burst(c.x + 0.5, c.y + 0.5, PALETTE.danger, 8, s));
        }
      }
    }
  }
  return { particles, seed: s };
}

// One circle op per particle, translated into screen space by a layout.
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
