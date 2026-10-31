// The seeded PRNG (DESIGN.md §3): mulberry32 on a 32-bit unsigned state.
// Pure: no clock, no pseudo-random calls (§3's PRNG is the only source of
// randomness); every draw returns the next state so the
// game can hold it in state.seed. Draws never mutate their argument.

// One draw: `value` in [0, 1), `seed` the next state.
export function rngNext(seed) {
  const t = (seed + 0x6D2B79F5) >>> 0; // the next state
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

// An integer draw: `value` in [0, n), `seed` the next state.
export function rngInt(seed, n) {
  const r = rngNext(seed);
  return { value: Math.floor(r.value * n), seed: r.seed };
}
