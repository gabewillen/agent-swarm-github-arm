// §3: mulberry32 on a 32-bit unsigned state. The game state holds the PRNG
// state in state.seed; every draw replaces it.
export function rngNext(seed) {
  const t = (seed + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

// An integer in [0, n), drawn from the same stream: rngInt(seed, n) is
// { value: Math.floor(v * n), seed: s } for rngNext(seed).
export function rngInt(seed, n) {
  const r = rngNext(seed);
  return { value: Math.floor(r.value * n), seed: r.seed };
}
