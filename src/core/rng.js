// The seeded PRNG (DESIGN.md §3): mulberry32 over a 32-bit unsigned state.
// Pure: every draw takes the current state and returns the next one, so the
// game state keeps the PRNG state in `state.seed` and replaces it per draw.

export function rngNext(seed) {
  const t = (seed + 0x6D2B79F5) >>> 0; // the next state
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

// An integer in [0, n) from one draw.
export function rngInt(seed, n) {
  const r = rngNext(seed);
  return { value: Math.floor(r.value * n), seed: r.seed };
}
