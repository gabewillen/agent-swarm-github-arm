// The seeded PRNG, mulberry32 on a 32-bit unsigned state, DESIGN.md §3.
// rngNext(seed) and rngInt(seed, n) both return { value, seed }: the draw
// and the next state. Pure and deterministic — the game holds the state in
// state.seed and passes it back in on every draw.

export function rngNext(seed) {
  const t = (seed + 0x6D2B79F5) >>> 0; // the next state
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

export function rngInt(seed, n) {
  const { value, seed: s } = rngNext(seed);
  return { value: Math.floor(value * n), seed: s };
}
