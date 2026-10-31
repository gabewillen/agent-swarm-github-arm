// The seeded PRNG of Quorum Run (DESIGN.md §3): mulberry32 on a 32-bit
// unsigned state. Every draw returns { value, seed } so the state carries
// the next seed; no Math-dot-random anywhere in the core.

export function rngNext(seed) {
  const t = (seed + 0x6D2B79F5) >>> 0; // the next state
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return { value, seed: t };
}

export function rngInt(seed, n) {
  const { value, seed: s } = rngNext(seed);
  return { value: Math.floor(value * n), seed: s };
}
