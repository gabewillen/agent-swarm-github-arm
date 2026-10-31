// Quorum Run: the seeded PRNG (DESIGN.md §3).
//
// mulberry32 on a 32-bit unsigned state, kept in the state's `seed`.
// Every draw replaces the seed: `rngNext(seed)` returns the next value in
// [0, 1) and the state to continue from, and `rngInt(seed, n)` an integer
// in [0, n). Pure: the same seed always draws the same values.

const STATES = 4294967296; // 2^32 values in a uint32

export function rngNext(seed) {
  const t = (seed + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / STATES, seed: t };
}

export function rngInt(seed, n) {
  const { value, seed: s } = rngNext(seed);
  return { value: Math.floor(value * n), seed: s };
}
