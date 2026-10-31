// DESIGN.md §3 — the seeded PRNG: mulberry32 on a 32-bit unsigned state.
// Every draw returns the next state, so randomness lives only in the game
// state's `seed` and nothing here reads the clock or Math.random.

export function rngNext(seed) {
  const t = (seed + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return { value, seed: t };
}

// An integer in [0, n) and the next state.
export function rngInt(seed, n) {
  const { value, seed: next } = rngNext(seed);
  return { value: Math.floor(value * n), seed: next };
}
