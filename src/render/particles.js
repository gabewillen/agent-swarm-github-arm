// Particle effects, DESIGN.md §23.
//
// Particles live in grid units: a cell's centre is (x + 0.5, y + 0.5). A
// particle is { x, y, vx, vy, ttl, color }. Every function is pure and takes
// or returns only plain data. Randomness comes from a seed drawn through the
// shared PRNG of §3, so bursts of the same seed match exactly.
import { rngNext } from '../core/rng.js';
import { CONFLICT_TICKS } from '../core/constants.js';
import { PALETTE } from './palette.js';

export const PARTICLE_TTL = 12;

// `count` particles at (x, y) from two draws per particle: an angle in
// [0, 2π), then a speed in [0.05, 0.15). Returns { particles, seed } with the
// seed after every draw.
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

// One tick on: x += vx, y += vy, then vy += 0.01 (a slow fall), ttl down by
// one; particles at ttl 0 are gone. Never changes its argument.
export function stepParticles(particles) {
  const out = [];
  for (const p of particles) {
    const ttl = p.ttl - 1;
    if (ttl <= 0) continue;
    out.push({ x: p.x + p.vx, y: p.y + p.vy, vx: p.vx, vy: p.vy + 0.01, ttl, color: p.color });
  }
  return out;
}

// Bursts for one step's events, in event order. `pickup` 6 particles in the
// last carried patch's agent colour, `merge` 12 in the accent, `drop` and
// `hit` 10 in danger at the player's cell centre; `conflict` 8 in danger at
// the centre of each conflict fresh out of §6 step 11 (ttl CONFLICT_TICKS).
// Events with no effect make nothing. Returns { particles, seed }.
export function particlesFor(state, seed) {
  const particles = [];
  let s = seed;
  const at = (cell) => ({ x: cell.x + 0.5, y: cell.y + 0.5 });
  for (const event of state.events) {
    if (event === 'pickup') {
      const colorIndex = state.carried.length > 0 ? state.carried[state.carried.length - 1] : undefined;
      const color = colorIndex === undefined ? PALETTE.accent : PALETTE.agents[colorIndex];
      const r = burst(at(state.player).x, at(state.player).y, color, 6, s);
      particles.push(...r.particles);
      s = r.seed;
    } else if (event === 'merge') {
      const r = burst(at(state.player).x, at(state.player).y, PALETTE.accent, 12, s);
      particles.push(...r.particles);
      s = r.seed;
    } else if (event === 'drop' || event === 'hit') {
      const r = burst(at(state.player).x, at(state.player).y, PALETTE.danger, 10, s);
      particles.push(...r.particles);
      s = r.seed;
    } else if (event === 'conflict') {
      for (const conflict of state.conflicts) {
        if (conflict.ttl === CONFLICT_TICKS) {
          const centre = at(conflict);
          const r = burst(centre.x, centre.y, PALETTE.danger, 8, s);
          particles.push(...r.particles);
          s = r.seed;
        }
      }
    }
  }
  return { particles, seed: s };
}

// One `circle` op of kind `particle` per particle, in screen space: pixel
// coordinates from the layout of §11, radius at least 1 pixel.
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
