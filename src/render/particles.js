// Quorum Run particle effects (DESIGN.md §23). Particles live in grid
// units (a cell's centre is x + 0.5, y + 0.5); every function is pure.
import { rngNext } from '../core/rng.js';
import { CONFLICT_TICKS } from '../core/constants.js';
import { PALETTE } from './palette.js';

export const PARTICLE_TTL = 12;

// `count` particles at (x, y), each from two draws of rngNext: an angle
// a = value * 2 * Math.PI, then a speed v = 0.05 + value * 0.1. Returns
// { particles, seed } with the seed after the last draw.
export function burst(x, y, color, count, seed) {
  const particles = [];
  let s = seed;
  for (let i = 0; i < count; i++) {
    const a = rngNext(s);
    const b = rngNext(a.seed);
    s = b.seed;
    const ang = a.value * 2 * Math.PI;
    const v = 0.05 + b.value * 0.1;
    particles.push({
      x, y,
      vx: Math.cos(ang) * v,
      vy: Math.sin(ang) * v,
      ttl: PARTICLE_TTL,
      color,
    });
  }
  return { particles, seed: s };
}

// One tick on: x += vx, y += vy, then vy += 0.01, ttl down by one; those
// at ttl 0 are gone.
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

// Bursts for the state's events, in event order, each a burst at the
// player's cell centre: pickup 6 in the agent colour of the last carried
// patch, merge 12 in PALETTE.accent, drop and hit 10 in PALETTE.danger;
// and for conflict, 8 in PALETTE.danger at the centre of each conflict
// with ttl CONFLICT_TICKS. Other events make none.
export function particlesFor(state, seed) {
  const particles = [];
  let s = seed;
  const at = (x, y, color, count) => {
    const r = burst(x, y, color, count, s);
    particles.push(...r.particles);
    s = r.seed;
  };
  for (const event of state.events || []) {
    if (event === 'conflict') {
      for (const c of state.conflicts || []) {
        if (c.ttl === CONFLICT_TICKS) at(c.x + 0.5, c.y + 0.5, PALETTE.danger, 8);
      }
    } else if (event === 'pickup') {
      const last = (state.carried || [])[state.carried.length - 1] ?? 0;
      at(state.player.x + 0.5, state.player.y + 0.5, PALETTE.agents[last], 6);
    } else if (event === 'merge') {
      at(state.player.x + 0.5, state.player.y + 0.5, PALETTE.accent, 12);
    } else if (event === 'drop' || event === 'hit') {
      at(state.player.x + 0.5, state.player.y + 0.5, PALETTE.danger, 10);
    }
  }
  return { particles, seed: s };
}

// One circle op of kind particle per particle, in screen space.
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
