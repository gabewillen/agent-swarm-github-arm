// Particle effects (DESIGN.md §23). Particles live in grid units: a cell's
// centre is (x + 0.5, y + 0.5). Everything here is pure and render-free.
import { CONFLICT_TICKS } from '../core/constants.js';
import { rngNext } from '../core/rng.js';
import { PALETTE } from './palette.js';

export const PARTICLE_TTL = 12;

// A burst of `count` particles at (x, y): each particle takes two draws of
// the PRNG, an angle then a speed, so bursts are reproducible from a seed.
export function burst(x, y, color, count, seed) {
  const particles = [];
  let s = seed >>> 0;
  for (let i = 0; i < count; i++) {
    const a = rngNext(s);
    const angle = a.value * 2 * Math.PI;
    const b = rngNext(a.seed);
    const v = 0.05 + b.value * 0.1;
    s = b.seed;
    particles.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, ttl: PARTICLE_TTL, color });
  }
  return { particles, seed: s };
}

// One tick on: move, then gravity on vy, then age; particles at ttl 0 go.
// Returns new particles and never changes its argument.
export function stepParticles(particles) {
  const out = [];
  for (const p of particles) {
    const ttl = p.ttl - 1;
    if (ttl <= 0) continue;
    out.push({ x: p.x + p.vx, y: p.y + p.vy, vx: p.vx, vy: p.vy + 0.01, ttl, color: p.color });
  }
  return out;
}

// The bursts the state's events ask for, in event order, each at the
// player's cell centre; conflicts burst once per new conflict cell.
export function particlesFor(state, seed) {
  const particles = [];
  let s = seed >>> 0;
  const burstCells = new Set();
  const px = state.player.x + 0.5;
  const py = state.player.y + 0.5;
  for (const e of state.events) {
    if (e === 'pickup') {
      const carried = state.carried;
      const c = carried.length > 0 ? carried[carried.length - 1] : 0;
      const r = burst(px, py, PALETTE.agents[c], 6, s);
      s = r.seed;
      particles.push(...r.particles);
    } else if (e === 'merge') {
      const r = burst(px, py, PALETTE.accent, 12, s);
      s = r.seed;
      particles.push(...r.particles);
    } else if (e === 'drop' || e === 'hit') {
      const r = burst(px, py, PALETTE.danger, 10, s);
      s = r.seed;
      particles.push(...r.particles);
    } else if (e === 'conflict') {
      for (const cf of state.conflicts) {
        if (cf.ttl === CONFLICT_TICKS && !burstCells.has(cf.x + ',' + cf.y)) {
          burstCells.add(cf.x + ',' + cf.y);
          const r = burst(cf.x + 0.5, cf.y + 0.5, PALETTE.danger, 8, s);
          s = r.seed;
          particles.push(...r.particles);
        }
      }
    }
  }
  return { particles, seed: s };
}

// Screen-space draw ops: one circle per particle, kind 'particle'.
export function particleOps(particles, layout) {
  const r = Math.max(1, layout.cell / 12);
  const ops = [];
  for (const p of particles) {
    ops.push({
      op: 'circle',
      kind: 'particle',
      x: layout.ox + p.x * layout.cell,
      y: layout.oy + p.y * layout.cell,
      r,
      color: p.color,
    });
  }
  return ops;
}
