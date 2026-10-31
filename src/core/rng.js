// Quorum Run's seeded PRNG (DESIGN.md §3): mulberry32 on a 32-bit unsigned
// state. Every draw replaces the caller's state; the game state holds the
// PRNG state in state.seed. Nightly, bullet-free, and Math.random stays out.

export function rngNext(seed) {
  const t = (seed + 0x6D2B79F5) >>> 0; // the next state
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  r ^= r >>> 14;
  const value = r >>> 0;
  return { value: value / 4294967296, seed: t };
}

// rngInt draws an integer in [0, n): rngInt(seed, n) floors value * n of
// the draw above and passes the new state through.
export function rngInt(seed, n) {
  const r = rngNext(seed);
  return { value: Math.floor(r.value * n), seed: r.seed };
}
