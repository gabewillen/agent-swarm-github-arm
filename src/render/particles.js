// Particle effects of Quorum Run (DESIGN.md §23). Particles live in grid
// units: a cell's centre is (x + 0.5, y + 0.5). A particle is
// { x, y, vx, vy, ttl, color }, and every function here is pure: nothing
// changes what it is given, and randomness comes only from the given seed.

import { CONFLICT_TICKS } from '../core/constants.js';
import { rngNext } from '../core/rng.js';
import { PALETTE } from './palette.js';

// The lifetime of a particle, in ticks.
export const PARTICLE_TTL = 12;

// A burst of `count` particles starting at (x, y): each one from two draws
// of the PRNG, first an angle, then a speed, both spread about the start.
export function burst(x, y, color, count, seed) {
  const particles = [];
  let s = seed;
  for (let i = 0; i < count; i++) {
    const angle = rngNext(s);
    const speed = rngNext(angle.seed);
    s = speed.seed;
    const a = angle.value * 2 * Math.PI;
    const v = 0.05 + speed.value * 0.1;
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ttl: PARTICLE_TTL, color });
  }
  return { particles, seed: s };
}

// One tick on: every particle drifts, falls a little, and ages; those at
// ttl 0 are gone. Returns a new array, leaving the input alone.
export function stepParticles(particles) {
  const out = [];
  for (const p of particles) {
    const ttl = p.ttl - 1;
    if (ttl <= 0) continue;
    out.push({ x: p.x + p.vx, y: p.y + p.vy, vx: p.vx, vy: p.vy + 0.01, ttl, color: p.color });
  }
  return out;
}

// The bursts the state's events call for, each at the player's cell centre,
// in event order. Conflicts burst at their own cell centres, and only the
// fresh ones. Events that make no debris make no particles at all.
export function particlesFor(state, seed) {
  const particles = [];
  let s = seed;
  const at = (x, y, color, count) => {
    const r = burst(x, y, color, count, s);
    particles.push(...r.particles);
    s = r.seed;
  };
  const events = state && state.events ? state.events : [];
  for (const event of events) {
    if (event === 'pickup') {
      const carried = state.carried || [];
      const last = carried.length ? PALETTE.agents[carried[carried.length - 1]] : PALETTE.accent;
      at(state.player.x + 0.5, state.player.y + 0.5, last, 6);
    } else if (event === 'merge') {
      at(state.player.x + 0.5, state.player.y + 0.5, PALETTE.accent, 12);
    } else if (event === 'drop' || event === 'hit') {
      at(state.player.x + 0.5, state.player.y + 0.5, PALETTE.danger, 10);
    } else if (event === 'conflict') {
      for (const c of state.conflicts || []) {
        if (c.ttl === CONFLICT_TICKS) at(c.x + 0.5, c.y + 0.5, PALETTE.danger, 8);
      }
    }
  }
  return { particles, seed: s };
}

// The particles as draw ops: one `circle` op of kind `particle` per
// particle, in screen space over the level's layout.
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
