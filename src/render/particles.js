// Particle effects (DESIGN.md §23).
//
// Particles live in grid units: a cell's centre is x + 0.5, y + 0.5. All
// randomness comes from the seed the caller passes through, in the same
// mulberry32 stream as the game (§3).
import { rngNext } from '../core/rng.js';
import { CONFLICT_TICKS } from '../core/constants.js';
import { PALETTE } from './palette.js';

export const PARTICLE_TTL = 12;

// burst(x, y, color, count, seed) returns { particles, seed }: count
// particles at (x, y), ttl PARTICLE_TTL, each from two draws of rngNext —
// an angle a = value * 2 * Math.PI, then a speed v = 0.05 + value * 0.1,
// so vx = Math.cos(a) * v and vy = Math.sin(a) * v.
export function burst(x, y, color, count, seed) {
  const particles = [];
  let s = seed;
  for (let i = 0; i < count; i++) {
    const a = rngNext(s);
    const v = rngNext(a.seed);
    s = v.seed;
    const ang = a.value * 2 * Math.PI;
    const speed = 0.05 + v.value * 0.1;
    particles.push({
      x,
      y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      ttl: PARTICLE_TTL,
      color,
    });
  }
  return { particles, seed: s };
}

// stepParticles(particles) moves them one tick on: x += vx, y += vy, then
// vy += 0.01, ttl down by one, and those at ttl 0 gone. Never changes its
// argument.
export function stepParticles(particles) {
  const out = [];
  for (const p of particles) {
    const q = {
      x: p.x + p.vx,
      y: p.y + p.vy,
      vx: p.vx,
      vy: p.vy + 0.01,
      ttl: p.ttl - 1,
      color: p.color,
    };
    if (q.ttl > 0) out.push(q);
  }
  return out;
}

// particlesFor(state, seed) returns { particles, seed } for the state's
// events, in event order, each a burst at the player's cell centre:
// pickup 6 in the agent colour of the last carried patch, merge 12 in
// PALETTE.accent, drop and hit 10 in PALETTE.danger; and for conflict, 8
// in PALETTE.danger at the centre of each conflict still at its full
// ttl (the new ones). Other events make none.
export function particlesFor(state, seed) {
  const particles = [];
  let s = seed;
  const unleash = (x, y, color, count) => {
    const r = burst(x, y, color, count, s);
    for (const p of r.particles) particles.push(p);
    s = r.seed;
  };
  const px = state.player.x + 0.5;
  const py = state.player.y + 0.5;
  for (const event of state.events) {
    if (event === 'pickup') {
      const last = state.carried[state.carried.length - 1];
      unleash(px, py, PALETTE.agents[last] ?? PALETTE.accent, 6);
    } else if (event === 'merge') {
      unleash(px, py, PALETTE.accent, 12);
    } else if (event === 'drop') {
      unleash(px, py, PALETTE.danger, 10);
    } else if (event === 'hit') {
      unleash(px, py, PALETTE.danger, 10);
    } else if (event === 'conflict') {
      for (const c of state.conflicts) {
        if (c.ttl === CONFLICT_TICKS) unleash(c.x + 0.5, c.y + 0.5, PALETTE.danger, 8);
      }
    }
  }
  return { particles, seed: s };
}

// particleOps(particles, layout) returns one circle op of kind particle
// per particle, in screen space, at the layout's origin plus the
// particle's grid position scaled to cells.
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
