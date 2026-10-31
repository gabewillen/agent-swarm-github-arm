// Particle effects (DESIGN.md §23): short-lived sparks in grid units, so
// they land wherever the board was drawn. A cell's centre is x + 0.5.
// All randomness comes from the seed handed in, so replays stay identical.

import { rngNext } from '../core/rng.js';
import { CONFLICT_TICKS } from '../core/constants.js';
import { PALETTE } from './palette.js';

export const PARTICLE_TTL = 12;

// burst makes count particles at (x, y), each from two draws: an angle,
// then a speed, both on the PRNG given.
export function burst(x, y, color, count, seed) {
  let s = seed;
  const particles = [];
  for (let i = 0; i < count; i++) {
    const a = rngNext(s);
    s = a.seed;
    const angle = a.value * 2 * Math.PI;
    const v = rngNext(s);
    s = v.seed;
    const speed = 0.05 + v.value * 0.1;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ttl: PARTICLE_TTL,
      color,
    });
  }
  return { particles, seed: s };
}

// stepParticles advances every particle one tick: movement first, then
// gravity on vy, then a shorter life; those at 0 are gone.
export function stepParticles(particles) {
  const out = [];
  for (const p of particles) {
    if (p.ttl <= 0) continue;
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

// particlesFor seeds bursts for the state's events, in event order, each
// at the player's cell centre: pickups in the agent colour of the last
// carried patch, merges in the accent, drops and hits in danger, and
// conflicts 8 sparks at the centre of every fresh conflict.
export function particlesFor(state, seed) {
  let s = seed;
  const out = [];
  const add = (x, y, color, count) => {
    const r = burst(x, y, color, count, s);
    for (const p of r.particles) out.push(p);
    s = r.seed;
  };
  const ph = (state?.player?.x ?? 0) + 0.5;
  const pv = (state?.player?.y ?? 0) + 0.5;
  for (const e of state?.events ?? []) {
    if (e === 'pickup') {
      const carried = state.carried ?? [];
      const color = carried.length > 0 ? carried[carried.length - 1] : 0;
      add(ph, pv, PALETTE.agents[color] ?? PALETTE.text, 6);
    } else if (e === 'merge') {
      add(ph, pv, PALETTE.accent, 12);
    } else if (e === 'drop' || e === 'hit') {
      add(ph, pv, PALETTE.danger, 10);
    } else if (e === 'conflict') {
      for (const c of state.conflicts ?? []) {
        if (c.ttl === CONFLICT_TICKS) add(c.x + 0.5, c.y + 0.5, PALETTE.danger, 8);
      }
    }
  }
  return { particles: out, seed: s };
}

// particleOps maps particles to circle ops in screen space.
export function particleOps(particles, lay) {
  return particles.map((p) => ({
    op: 'circle',
    kind: 'particle',
    x: lay.ox + p.x * lay.cell,
    y: lay.oy + p.y * lay.cell,
    r: Math.max(1, lay.cell / 12),
    color: p.color,
  }));
}
