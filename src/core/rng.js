// Quorum Run's seeded PRNG (DESIGN.md §3): mulberry32 on a 32-bit
// unsigned state. Randomness in the core comes only from calls of these
// on the state's seed, so the whole game replays from one number.

// One draw: value in [0, 1) and the next state.
export function rngNext(seed) {
  const t = (seed + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

// One integer draw: an integer in [0, n) with the state carried over.
export function rngInt(seed, n) {
  const r = rngNext(seed);
  return { value: Math.floor(r.value * n), seed: r.seed };
}
