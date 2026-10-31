// src/render/particles.js — particle effects (DESIGN.md §23).
//
// Particles live in grid units: a cell's centre is (x + 0.5, y + 0.5).
// Everything here is pure and deterministic: randomness comes only from
// the seed handed in, drawn with the shared PRNG of §3.

import { rngNext } from '../core/rng.js';

export const PARTICLE_TTL = 12;

// Colours, exactly §11's PALETTE values: the yellow accent, the danger
// orange-red, and the four agent colours.
const DANGER = '#ff6b4a'; // PALETTE.danger
const ACCENT = '#ffd400'; // PALETTE.accent
const AGENTS = ['#c79bff', '#6aa8ff', '#ff9f45', '#4ade80']; // PALETTE.agents

// §2's CONFLICT_TICKS: a conflict made this step still holds this ttl.
const CONFLICT_TTL = 10;

// How many particles each event kind bursts, and a conflict's batch.
const EVENT_COUNTS = { pickup: 6, merge: 12, drop: 10, hit: 10 };
const CONFLICT_COUNT = 8;

// burst(x, y, color, count, seed) returns { particles, seed }: count
// particles at (x, y), each from two draws of the PRNG — an angle, then a
// speed — which also chains the seed forward.
export function burst(x, y, color, count, seed) {
  const particles = [];
  let s = seed;
  for (let i = 0; i < count; i += 1) {
    const angleDraw = rngNext(s);
    const speedDraw = rngNext(angleDraw.seed);
    s = speedDraw.seed;
    const a = angleDraw.value * 2 * Math.PI;
    const v = 0.05 + speedDraw.value * 0.1;
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ttl: PARTICLE_TTL, color });
  }
  return { particles, seed: s };
}

// stepParticles(particles) is them one tick on: x and y advance, vy gains
// gravity, ttl falls, and particles that reach ttl 0 are gone. The input
// and its particles are untouched.
export function stepParticles(particles) {
  const out = [];
  for (const p of particles) {
    const ttl = p.ttl - 1;
    if (ttl <= 0) continue;
    out.push({ x: p.x + p.vx, y: p.y + p.vy, vx: p.vx, vy: p.vy + 0.01, ttl, color: p.color });
  }
  return out;
}

// particlesFor(state, seed) returns { particles, seed } for the state's
// events, in event order: a burst at the player's cell centre per pickup
// (agent colour of the last carried patch), merge (accent), drop, or hit
// (danger); and per conflict event, a burst of 8 at the centre of every
// conflict still holding CONFLICT_TICKS — the ones made that step.
export function particlesFor(state, seed) {
  const particles = [];
  let s = seed;
  const events = state.events || [];
  const px = (state.player ? state.player.x : 0) + 0.5;
  const py = (state.player ? state.player.y : 0) + 0.5;
  let conflictsDone = false;
  for (const ev of events) {
    if (ev === 'conflict') {
      if (conflictsDone) continue;
      conflictsDone = true;
      for (const c of state.conflicts || []) {
        if (c.ttl === CONFLICT_TTL) {
          const r = burst(c.x + 0.5, c.y + 0.5, DANGER, CONFLICT_COUNT, s);
          for (const p of r.particles) particles.push(p);
          s = r.seed;
        }
      }
      continue;
    }
    const count = EVENT_COUNTS[ev];
    if (count === undefined) continue;
    let color;
    if (ev === 'merge') color = ACCENT;
    else if (ev === 'pickup') {
      const carried = state.carried || [];
      const index = carried.length ? carried[carried.length - 1] : 0;
      color = AGENTS[index] || AGENTS[0];
    } else color = DANGER;
    const r = burst(px, py, color, count, s);
    for (const p of r.particles) particles.push(p);
    s = r.seed;
  }
  return { particles, seed: s };
}

// particleOps(particles, layout) turns particles into circle draw ops in
// screen space, one of kind 'particle' per particle.
export function particleOps(particles, layout) {
  const ops = [];
  const r = Math.max(1, layout.cell / 12);
  for (const p of particles) {
    ops.push({ op: 'circle', kind: 'particle', x: layout.ox + p.x * layout.cell, y: layout.oy + p.y * layout.cell, r, color: p.color });
  }
  return ops;
}
