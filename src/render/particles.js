// Particle effects (DESIGN.md §23): bursts on game events, one tick of
// drift and gravity each step, and the draw ops the renderer paints.
// Particles live in grid units — a cell's centre is x + 0.5, y + 0.5 —
// so the renderer scales them up through the level layout.
import { rngNext } from '../core/rng.js';
import { CONFLICT_TICKS } from '../core/constants.js';
import { PALETTE } from './palette.js';

export const PARTICLE_TTL = 12;

// A burst of `count` particles at (x, y): two rngNext draws per particle,
// an angle then a speed, so a burst looks the same for the same seed.
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
      x, y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      ttl: PARTICLE_TTL,
      color,
    });
  }
  return { particles, seed: s };
}

// One tick on: drift, then gravity, then age; the spent are gone.
// Pure: the input list and its particles are left alone.
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

// One burst per making event, in event order, sharing the seed.
export function particlesFor(state, seed) {
  const particles = [];
  let s = seed;
  const cx = state.player ? state.player.x + 0.5 : 0.5;
  const cy = state.player ? state.player.y + 0.5 : 0.5;
  for (const ev of state.events ?? []) {
    if (ev === 'pickup') {
      // The last carried patch sets the colour (the pickup that just
      // happened is the last item carried; fall back only defensively).
      const last = state.carried?.length ? state.carried[state.carried.length - 1] : -1;
      const color = Number.isInteger(last) && last >= 0 && last < PALETTE.agents.length
        ? PALETTE.agents[last]
        : PALETTE.accent;
      const b = burst(cx, cy, color, 6, s);
      s = b.seed;
      particles.push(...b.particles);
    } else if (ev === 'merge') {
      const b = burst(cx, cy, PALETTE.accent, 12, s);
      s = b.seed;
      particles.push(...b.particles);
    } else if (ev === 'drop' || ev === 'hit') {
      const b = burst(cx, cy, PALETTE.danger, 10, s);
      s = b.seed;
      particles.push(...b.particles);
    } else if (ev === 'conflict') {
      // Fresh conflicts only: ttl CONFLICT_TICKS marks a new one.
      for (const c of state.conflicts ?? []) {
        if (c.ttl === CONFLICT_TICKS) {
          const b = burst(c.x + 0.5, c.y + 0.5, PALETTE.danger, 8, s);
          s = b.seed;
          particles.push(...b.particles);
        }
      }
    }
  }
  return { particles, seed: s };
}

// One circle op of kind 'particle' per particle, in screen space.
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
