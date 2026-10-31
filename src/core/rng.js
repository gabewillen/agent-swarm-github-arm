// DESIGN.md §3: mulberry32 on a 32-bit unsigned state, the pack's only
// source of randomness everywhere downstream.
// rngNext(seed) returns { value, seed } with value in [0, 1); every draw
// replaces the state the caller holds.
export function rngNext(seed) {
  const t = (seed + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

// rngInt(seed, n) is an integer in [0, n) drawn from rngNext(seed).
export function rngInt(seed, n) {
  const { value, seed: s } = rngNext(seed);
  return { value: Math.floor(value * n), seed: s };
}
