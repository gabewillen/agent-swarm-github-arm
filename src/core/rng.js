// The seeded PRNG (DESIGN.md §3): mulberry32 on a 32-bit unsigned state.
// rngNext(seed) returns { value, seed } with value in [0, 1) and the next
// state; rngInt(seed, n) returns an integer in [0, n) on the same draw.
// Randomness in the game comes only from the state's seed: every draw
// replaces it.

export function rngNext(seed) {
  const t = (seed + 0x6D2B79F5) >>> 0; // the next state
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

export function rngInt(seed, n) {
  const r = rngNext(seed);
  return { value: Math.floor(r.value * n), seed: r.seed };
}
