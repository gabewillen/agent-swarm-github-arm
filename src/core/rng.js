// Quorum Run - the seeded PRNG (DESIGN.md §3): mulberry32 on a 32-bit
// unsigned state. Every draw replaces the state, which lives in
// state.seed, so a game is a pure function of its seed.

// One draw: { value in [0, 1), seed: the next state }.
export function rngNext(seed) {
  const t = (seed + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

// One draw of an integer in [0, n).
export function rngInt(seed, n) {
  const { value, seed: next } = rngNext(seed);
  return { value: Math.floor(value * n), seed: next };
}
