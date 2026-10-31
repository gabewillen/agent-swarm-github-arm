// Particle effects (DESIGN.md §23).
//
// Particles live in grid units: a cell's centre is (x + 0.5, y + 0.5). The
// module is pure data, like the core: no canvas, no DOM, no clock. It draws
// randomness from the PRNG of §3 through the seed it is given and returns the
// seed after its draws, so the caller owns the stream.

import { rngNext } from '../core/rng.js';
import { PALETTE } from './palette.js';
import { CONFLICT_TICKS } from '../core/constants.js';

export const PARTICLE_TTL = 12;

// The fall every tick adds to a particle's vertical speed, in cells per tick.
const GRAVITY = 0.01;

/** `count` particles at `(x, y)`, each from two draws: an angle, then a speed. */
export function burst(x, y, color, count, seed) {
  const particles = [];
  let s = seed >>> 0;
  for (let i = 0; i < count; i++) {
    const a = rngNext(s);
    const b = rngNext(a.seed);
    s = b.seed;
    const angle = a.value * 2 * Math.PI;
    const v = 0.05 + b.value * 0.1;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      ttl: PARTICLE_TTL,
      color,
    });
  }
  return { particles, seed: s };
}

/** The particles one tick on: they move, fall, and age; the spent ones go. */
export function stepParticles(particles) {
  const out = [];
  for (const p of particles) {
    const ttl = p.ttl - 1;
    if (ttl <= 0) continue;
    out.push({
      x: p.x + p.vx,
      y: p.y + p.vy,
      vx: p.vx,
      vy: p.vy + GRAVITY,
      ttl,
      color: p.color,
    });
  }
  return out;
}

// The agent colour of the patch that is last in hand, or the first agent's
// when nothing is carried (a `pickup` event always carries at least one).
function carriedColor(carried) {
  if (!Array.isArray(carried) || carried.length === 0) return PALETTE.agents[0];
  const c = Math.floor(carried[carried.length - 1]);
  return c >= 0 && c < PALETTE.agents.length ? PALETTE.agents[c] : PALETTE.agents[0];
}

/** The particles the state's events make, in event order, with the seed after. */
export function particlesFor(state, seed) {
  const events = Array.isArray(state.events) ? state.events : [];
  const conflicts = Array.isArray(state.conflicts) ? state.conflicts : [];
  const cx = state.player ? state.player.x + 0.5 : 0.5;
  const cy = state.player ? state.player.y + 0.5 : 0.5;
  let s = seed >>> 0;
  const particles = [];

  const add = (x, y, color, count) => {
    const r = burst(x, y, color, count, s);
    s = r.seed;
    for (const p of r.particles) particles.push(p);
  };

  for (const event of events) {
    if (event === 'pickup') add(cx, cy, carriedColor(state.carried), 6);
    else if (event === 'merge') add(cx, cy, PALETTE.accent, 12);
    else if (event === 'drop' || event === 'hit') add(cx, cy, PALETTE.danger, 10);
    else if (event === 'conflict') {
      // Only a conflict that just appeared: one that is already aging out.
      for (const c of conflicts) {
        if (c && c.ttl === CONFLICT_TICKS) add(c.x + 0.5, c.y + 0.5, PALETTE.danger, 8);
      }
    }
  }
  return { particles, seed: s };
}

/** Screen-space circle ops for the particles, in the given view layout. */
export function particleOps(particles, layout) {
  const r = Math.max(1, layout.cell / 12);
  return particles.map((p) => ({
    op: 'circle',
    kind: 'particle',
    x: layout.ox + p.x * layout.cell,
    y: layout.oy + p.y * layout.cell,
    r,
    color: p.color,
  }));
}
