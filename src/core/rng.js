// The seeded PRNG of DESIGN.md §3: mulberry32 on a 32-bit unsigned state.
// rngNext returns { value, seed }: value in [0, 1) and the next state.
export function rngNext(seed) {
  const t = (seed + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return { value, seed: t };
}

// rngInt draws an integer in [0, n): Math.floor(value * n) from one draw.
export function rngInt(seed, n) {
  const { value, seed: s } = rngNext(seed);
  return { value: Math.floor(value * n), seed: s };
}
