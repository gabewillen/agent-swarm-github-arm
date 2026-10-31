// Quorum Run — particle effects (DESIGN.md §23).
// Particles live in grid units: a cell's centre is x + 0.5, y + 0.5.
import { rngNext } from '../core/rng.js';
import { CONFLICT_TICKS } from '../core/constants.js';
import { PALETTE } from './palette.js';

export const PARTICLE_TTL = 12;

// burst(x, y, color, count, seed): count particles at (x, y), each from
// two draws of rngNext: an angle a = value * 2 * Math.PI, then a speed
// v = 0.05 + value * 0.1, so vx = Math.cos(a) * v and vy = Math.sin(a) * v.
// Returns { particles, seed } with the seed after the draws.
export function burst(x, y, color, count, seed) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    const a = rngNext(seed);
    const b = rngNext(a.seed);
    seed = b.seed;
    const ang = a.value * 2 * Math.PI;
    const v = 0.05 + b.value * 0.1;
    particles.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, ttl: PARTICLE_TTL, color });
  }
  return { particles, seed };
}

// stepParticles(particles): one tick on. Never mutates the input; returns
// the survivors. x += vx, y += vy, then vy += 0.01, ttl down by one, and
// those at ttl 0 are gone.
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

// Which burst, how many particles, and in what colour each event makes.
const EVENT_COUNTS = {
  pickup: 6,
  merge: 12,
  drop: 10,
  hit: 10,
};

// particlesFor(state, seed): bursts for the state's events, in event
// order, each at the player's cell centre — pickup 6 in the agent colour
// of the last carried patch, merge 12 in PALETTE.accent, drop and hit 10
// in PALETTE.danger; and for conflict, 8 in PALETTE.danger at the centre
// of each new conflict (one whose ttl is CONFLICT_TICKS). Other events
// make none. Returns { particles, seed }.
export function particlesFor(state, seed) {
  let particles = [];
  for (const ev of state.events) {
    if (ev === 'conflict') {
      for (const c of state.conflicts) {
        if (c.ttl === CONFLICT_TICKS) {
          const r = burst(c.x + 0.5, c.y + 0.5, PALETTE.danger, 8, seed);
          particles = particles.concat(r.particles);
          seed = r.seed;
        }
      }
      continue;
    }
    const count = EVENT_COUNTS[ev];
    if (!count) continue;
    let color = PALETTE.danger;
    if (ev === 'merge') color = PALETTE.accent;
    if (ev === 'pickup') {
      const carried = state.carried;
      color = carried.length
        ? PALETTE.agents[carried[carried.length - 1]]
        : PALETTE.accent;
    }
    const r = burst(state.player.x + 0.5, state.player.y + 0.5, color, count, seed);
    particles = particles.concat(r.particles);
    seed = r.seed;
  }
  return { particles, seed };
}

// particleOps(particles, layout): one circle op of kind 'particle' per
// particle, in screen space, in its colour.
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
