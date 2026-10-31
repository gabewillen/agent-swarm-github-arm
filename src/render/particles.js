// §23 Particles — short-lived burst effects for Quorum Run.
// Particles live in grid units: a cell's centre is (x + 0.5, y + 0.5).
// Pure functions throughout; randomness comes from the given seed (§3).

import { rngNext } from '../core/rng.js';
import { CONFLICT_TICKS } from '../core/constants.js';
import { PALETTE } from './palette.js';

export const PARTICLE_TTL = 12;

// burst(x, y, color, count, seed) -> { particles, seed }
// count particles born at (x, y), ttl PARTICLE_TTL, in color. Each particle
// costs two draws of rngNext in this order: an angle a = value * 2 * PI,
// then a speed v = 0.05 + value * 0.1, so vx = cos(a) * v, vy = sin(a) * v.
export function burst(x, y, color, count, seed) {
  let s = seed >>> 0;
  const particles = [];
  for (let i = 0; i < count; i++) {
    const angleDraw = rngNext(s);
    const speedDraw = rngNext(angleDraw.seed);
    s = speedDraw.seed;
    const a = angleDraw.value * 2 * Math.PI;
    const v = 0.05 + speedDraw.value * 0.1;
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ttl: PARTICLE_TTL, color });
  }
  return { particles, seed: s };
}

// stepParticles(particles) -> new array one tick later: x += vx, y += vy,
// then gravity vy += 0.01, ttl down by one, and those at ttl 0 gone.
// Never changes its argument.
export function stepParticles(particles) {
  const out = [];
  for (const p of particles) {
    const ttl = p.ttl - 1;
    if (ttl <= 0) continue;
    out.push({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.01, ttl });
  }
  return out;
}

// particlesFor(state, seed) -> { particles, seed }
// A burst for each burst-worthy event, in event order. Player-centred
// bursts: pickup 6 in the agent colour of the last carried patch,
// merge 12 in the accent, drop and hit 10 in danger. A conflict event
// bursts 8 in danger at the centre of each conflict still at
// CONFLICT_TICKS (a freshly created one). Anything else makes nothing.
export function particlesFor(state, seed) {
  let s = seed >>> 0;
  const particles = [];
  const conflicts = Array.isArray(state.conflicts) ? state.conflicts : [];
  const px = state.player.x + 0.5;
  const py = state.player.y + 0.5;
  let burstedConflicts = false;
  for (const ev of state.events) {
    if (ev === 'conflict') {
      if (burstedConflicts) continue;
      burstedConflicts = true;
      for (const c of conflicts) {
        if (c.ttl !== CONFLICT_TICKS) continue;
        const r = burst(c.x + 0.5, c.y + 0.5, PALETTE.danger, 8, s);
        s = r.seed;
        particles.push(...r.particles);
      }
      continue;
    }
    let color = null;
    let count = 0;
    if (ev === 'pickup') {
      const carried = Array.isArray(state.carried) ? state.carried : [];
      const last = carried.length ? carried[carried.length - 1] : null;
      color = PALETTE.agents[last] ?? PALETTE.accent;
      count = 6;
    } else if (ev === 'merge') {
      color = PALETTE.accent;
      count = 12;
    } else if (ev === 'drop' || ev === 'hit') {
      color = PALETTE.danger;
      count = 10;
    } else {
      continue; // no other event makes particles
    }
    const r = burst(px, py, color, count, s);
    s = r.seed;
    particles.push(...r.particles);
  }
  return { particles, seed: s };
}

// particleOps(particles, layout) -> one circle op of kind 'particle' per
// particle, from grid units into screen space on layout's cell grid.
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
