// Particle effects (DESIGN.md §23): the little bursts a step's events make.
// Particles live in grid units, so a cell's centre is (x + 0.5, y + 0.5),
// and they are drawn as circles in screen space (§11's layout). Everything
// here is pure: arrays in, new arrays out, nothing touched on the way.

import { rngNext } from '../core/rng.js';
import { CONFLICT_TICKS } from '../core/constants.js';
import { PALETTE } from './palette.js';

// Ticks a particle lives after it bursts.
export const PARTICLE_TTL = 12;

// burst(x, y, color, count, seed) -> { particles, seed }
//
// `count` particles born at (x, y), each from two draws of the PRNG: an
// angle a (value * 2π) around the point, then a speed on it (0.05 to 0.15
// cells per tick), so vx = cos(a) * v and vy = sin(a) * v. The seed threads
// through both draws of every particle and comes back as the last state.
export function burst(x, y, color, count, seed) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    const angle = rngNext(seed);
    const speed = rngNext(angle.seed);
    const v = 0.05 + speed.value * 0.1;
    seed = speed.seed;
    const a = angle.value * 2 * Math.PI;
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ttl: PARTICLE_TTL, color });
  }
  return { particles, seed };
}

// stepParticles(particles) -> the particles one tick on.
//
// Each glides by its velocity, gains a little downward pull, and ages: ttl
// down by one, and those at ttl 0 are gone. The input list is not changed.
export function stepParticles(particles) {
  const out = [];
  for (const p of particles) {
    const q = { x: p.x + p.vx, y: p.y + p.vy, vx: p.vx, vy: p.vy + 0.01, ttl: p.ttl - 1, color: p.color };
    if (q.ttl > 0) out.push(q);
  }
  return out;
}

// particlesFor(state, seed) -> { particles, seed }
//
// The state's events, in order, become bursts at the player's cell centre:
// a pickup in the agent colour of the last carried patch, a merge in the
// accent colour, a drop or a hit in the danger colour. A conflict bursts
// instead at the centre of each of the state's conflicts that is new this
// step (ttl still CONFLICT_TICKS), and only once, however many conflict
// events the step had. Every other event makes nothing.
export function particlesFor(state, seed) {
  const particles = [];
  let conflictsBurst = false;
  for (const event of state.events) {
    if (event === 'conflict') {
      if (conflictsBurst) continue; // one burst per new conflict, not per event
      conflictsBurst = true;
      for (const c of state.conflicts) {
        if (c.ttl !== CONFLICT_TICKS) continue;
        const b = burst(c.x + 0.5, c.y + 0.5, PALETTE.danger, 8, seed);
        particles.push(...b.particles);
        seed = b.seed;
      }
      continue;
    }
    let color;
    let count;
    if (event === 'pickup') {
      const last = state.carried[state.carried.length - 1];
      color = PALETTE.agents[last] ?? PALETTE.accent;
      count = 6;
    } else if (event === 'merge') {
      color = PALETTE.accent;
      count = 12;
    } else if (event === 'drop' || event === 'hit') {
      color = PALETTE.danger;
      count = 10;
    } else {
      continue;
    }
    const b = burst(state.player.x + 0.5, state.player.y + 0.5, color, count, seed);
    particles.push(...b.particles);
    seed = b.seed;
  }
  return { particles, seed };
}

// particleOps(particles, layout) -> draw ops (§11)
//
// One circle op of kind 'particle' per particle, at its position in screen
// space, sized a twelfth of a cell (at least 1 pixel), in its colour.
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
