// Particle effects (DESIGN.md §23).
//
// Particles live in grid units: the centre of cell (cx, cy) is
// (cx + 0.5, cy + 0.5). Every function is pure and takes its randomness
// from the seed handed in with §3's PRNG, so the same seed makes the
// same burst.
//
// This module mirrors the bits of the shared contract it needs, exactly
// as pinned by DESIGN.md and its acceptance tests, so it loads on its
// own whatever the landing order of the other modules:
//   - §3 rngNext, the mulberry32 draw;
//   - §2 CONFLICT_TICKS = 10, a conflict's life in ticks;
//   - §11 PALETTE.accent = '#ffd400', PALETTE.danger = '#ff6b4a',
//     PALETTE.agents = ['#c79bff', '#6aa8ff', '#ff9f45', '#4ade80'].

export const PARTICLE_TTL = 12;

const ACCENT = '#ffd400';
const DANGER = '#ff6b4a';
const AGENT_COLORS = ['#c79bff', '#6aa8ff', '#ff9f45', '#4ade80'];
const CONFLICT_TICKS = 10;

// §3: one mulberry32 draw from a 32-bit unsigned state.
function rngNext(seed) {
  const t = (seed + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

// `count` particles born at (x, y): angle and speed from two draws of
// rngNext each, ttl PARTICLE_TTL, going out as { particles, seed }.
export function burst(x, y, color, count, seed) {
  const particles = [];
  let s = seed >>> 0;
  for (let i = 0; i < count; i++) {
    const a = rngNext(s);
    const b = rngNext(a.seed);
    s = b.seed;
    const ang = a.value * 2 * Math.PI;
    const v = 0.05 + b.value * 0.1;
    particles.push({
      x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
      ttl: PARTICLE_TTL, color,
    });
  }
  return { particles, seed: s };
}

// One tick on: drift by (vx, vy), then gravity pulls vy down by 0.01,
// ttl drops by one, spent particles (ttl 0) are gone.
export function stepParticles(particles) {
  const out = [];
  for (const p of particles) {
    const ttl = p.ttl - 1;
    if (ttl <= 0) continue;
    out.push({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.01, ttl });
  }
  return out;
}

// The bursts for the state's events, in event order, each bled from the
// same seed chain:
//   pickup 6 in the last carried patch's agent colour at the player,
//   merge 12 in the accent colour at the player,
//   drop and hit 10 in the danger colour at the player,
//   conflict 8 in the danger colour at the centre of each conflict that
//   still has its full ttl (the ones born this step).
// Other events make nothing.
export function particlesFor(state, seed) {
  const events = Array.isArray(state.events) ? state.events : [];
  const conflicts = Array.isArray(state.conflicts) ? state.conflicts : [];
  const carried = Array.isArray(state.carried) ? state.carried : [];
  const player = state.player ?? { x: 0, y: 0 };
  const px = player.x + 0.5;
  const py = player.y + 0.5;
  const pickupColor = carried.length
    ? AGENT_COLORS[carried[carried.length - 1]] : ACCENT;
  let particles = [];
  let s = seed >>> 0;
  const add = (x, y, color, count) => {
    const r = burst(x, y, color, count, s);
    particles = particles.concat(r.particles);
    s = r.seed;
  };
  for (const ev of events) {
    if (ev === 'conflict') {
      for (const c of conflicts) {
        if (c.ttl === CONFLICT_TICKS) add(c.x + 0.5, c.y + 0.5, DANGER, 8);
      }
    } else if (ev === 'pickup') {
      add(px, py, pickupColor, 6);
    } else if (ev === 'merge') {
      add(px, py, ACCENT, 12);
    } else if (ev === 'drop' || ev === 'hit') {
      add(px, py, DANGER, 10);
    }
  }
  return { particles, seed: s };
}

// One circle op (§11) of kind particle per particle, in screen space.
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
