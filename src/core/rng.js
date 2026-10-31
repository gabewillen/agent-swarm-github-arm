// Quorum Run: the seeded PRNG, mulberry32 on a 32-bit unsigned state (§3).
// rngNext(seed) returns { value, seed }: value in [0, 1) and the next state;
// rngInt(seed, n) returns { value, seed } with value an integer in [0, n).
// The game state holds the PRNG state in state.seed; every draw replaces it.

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
