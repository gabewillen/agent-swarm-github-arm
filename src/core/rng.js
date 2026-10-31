// The seeded PRNG (DESIGN.md §3): mulberry32 over a 32-bit unsigned state.
// The game state holds the PRNG state in `state.seed`; every draw replaces
// it. rngNext(seed) returns { value, seed } with value in [0, 1) and seed
// the next state; rngInt(seed, n) returns an integer in [0, n) on the same
// draw.

export function rngNext(seed) {
  const t = (seed + 0x6D2B79F5) >>> 0; // the next state
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

export function rngInt(seed, n) {
  const { value, seed: next } = rngNext(seed);
  return { value: Math.floor(value * n), seed: next };
}
