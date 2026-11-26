// Cendrawasih Ridge Run — deterministic randomness.
// One job: a seeded generator and smooth value noise, so the island, the clouds
// and every screenshot scene are the same on every run from the same seed.

/** Mulberry32: a tiny seeded PRNG with a long, even period. */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a lattice point to a stable 0..1 value. */
function lattice(x, z, seed) {
  let h = (x * 374761393 + z * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 100000) / 100000;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Two-dimensional value noise in 0..1, bilinearly smoothed between lattice points. */
export function valueNoise(x, z, seed) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = smooth(x - xi);
  const zf = smooth(z - zi);
  const a = lattice(xi, zi, seed);
  const b = lattice(xi + 1, zi, seed);
  const c = lattice(xi, zi + 1, seed);
  const d = lattice(xi + 1, zi + 1, seed);
  return a + (b - a) * xf + (c - a) * zf + (a - b - c + d) * xf * zf;
}

/** Fractal noise: two octaves of value noise, still 0..1. */
export function fbm(x, z, seed) {
  return valueNoise(x, z, seed) * 0.65 + valueNoise(x * 2.13 + 5.2, z * 2.13 + 9.7, seed + 31) * 0.35;
}
