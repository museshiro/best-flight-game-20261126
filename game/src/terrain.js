// Cendrawasih Ridge Run — the island.
// One job: answer "how high is the ground here, and what colour is it", plus the
// fixed scenery (runway, village, trees, clouds) that the renderer draws.
// The island is a volcano with a crater, ringed by jungle hills, rice terraces on
// its south slope, a sandy coast, a small fishing village and one coastal runway.

import { WORLD } from './config.js';
import { createRandom, fbm } from './random.js';

const NOISE_SEED = 77;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function dist(x1, z1, x2, z2) {
  return Math.hypot(x1 - x2, z1 - z2);
}

/** Raw island height before the runway flattening, in metres above sea level. */
export function rawHeight(x, z) {
  const d = Math.hypot(x, z);
  // Coast: 1 deep inland, 0 out at sea.
  const coast = smoothstep(WORLD.islandRadius, WORLD.islandRadius - 550, d);
  if (coast <= 0) return WORLD.seaFloor;
  // The volcano cone with a scooped crater.
  const v = WORLD.volcano;
  const dv = dist(x, z, v.x, v.z);
  let cone = v.height * Math.pow(Math.max(0, 1 - dv / v.radius), 1.35);
  if (dv < v.crater) cone -= ((v.crater - dv) / v.crater) * 130;
  // Rolling jungle hills and one eastern ridge.
  const hills = 95 * fbm(x * 0.0016 + 3.1, z * 0.0016 + 8.4, NOISE_SEED)
    + 42 * fbm(x * 0.004 + 7.7, z * 0.004 + 2.2, NOISE_SEED + 5);
  const ridge = 150 * Math.exp(-Math.pow((x - 1150) / 420, 2)) * smoothstep(400, 100, Math.abs(z + 300));
  let h = coast * (cone + hills * (1 - cone / v.height) + ridge * 0.4);
  // Rice terraces: the south slope is stepped into flat paddy bands.
  const t = WORLD.terrace;
  if (x > t.x0 && x < t.x1 && z > t.z0 && z < t.z1 && h > 18 && h < 320) {
    const edge = Math.min(x - t.x0, t.x1 - x, z - t.z0, t.z1 - z) / 120;
    const stepped = Math.floor(h / 7) * 7 + 2;
    h = h + (stepped - h) * clamp(edge, 0, 1);
  }
  return Math.max(h, WORLD.seaFloor);
}

/** Ground height with the runway plateau pressed flat into the coast. */
export function heightAt(x, z) {
  const r = WORLD.runway;
  const h = rawHeight(x, z);
  const dx = Math.max(0, Math.abs(x - r.x) - (r.halfWidth + 26));
  const dz = Math.max(0, Math.max(r.zMin - z, z - r.zMax) - 26);
  const outside = Math.hypot(dx, dz);
  let out = h;
  if (outside < 150) {
    const blend = smoothstep(150, 0, outside);
    out = h + (r.height - h) * blend;
  }
  // Departure corridor: the ground just past the runway's north end stays low
  // so the climb-out is a climb, not a wall.
  if (Math.abs(x) < 110 && z > 980 && z < r.zMin) {
    const edge = Math.min((110 - Math.abs(x)) / 70, (z - 980) / 120, (r.zMin - z) / 60);
    const blend = smoothstep(0, 0.7, clamp(edge, 0, 1));
    out = out + (7 - out) * blend;
  }
  return out;
}

/** True when the point is on the runway strip. */
export function onRunway(x, z) {
  const r = WORLD.runway;
  return Math.abs(x - r.x) <= r.halfWidth && z >= r.zMin && z <= r.zMax;
}

/** True when the point is over open sea. */
export function overSea(x, z) {
  return rawHeight(x, z) <= 0.5;
}

/** Terrain colour for a ground point: sand, paddy green, jungle, rock, ash. */
export function groundColour(x, z, h) {
  const t = WORLD.terrace;
  if (h < 5) return [224, 205, 150]; // beach sand
  if (x > t.x0 && x < t.x1 && z > t.z0 && z < t.z1 && h > 18 && h < 320) {
    // Paddy bands alternate bright flooded green and deep leaf green.
    const band = Math.floor(h / 7) % 2;
    return band === 0 ? [96, 168, 74] : [62, 138, 66];
  }
  const n = fbm(x * 0.01, z * 0.01, NOISE_SEED + 11);
  if (h > 620) return [104, 98, 90]; // bare rock near the summit
  if (h > 480) return [88, 82, 76]; // grey ash and scree
  if (n > 0.62) return [52, 112, 58]; // dark jungle clumps
  return [74, 148, 62]; // open green hillside
}

/** Shade a colour by slope light and distance fog toward the horizon haze. */
export function shadeColour(rgb, light, fog, haze) {
  const r = rgb[0] * light + haze[0] * fog;
  const g = rgb[1] * light + haze[1] * fog;
  const b = rgb[2] * light + haze[2] * fog;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/** Fixed scenery, built once from the seed: trees, houses and clouds. */
export function buildScenery() {
  const rand = createRandom(4242);
  const trees = [];
  for (let i = 0; i < 340; i += 1) {
    const x = (rand() * 2 - 1) * 1750;
    const z = (rand() * 2 - 1) * 1750;
    const h = heightAt(x, z);
    if (h < 10 || h > 420 || onRunway(x, z)) continue;
    // Keep the runway clear: no tree may loom over the take-off roll.
    if (Math.abs(x) < 150 && z > 1150 && z < 2050) continue;
    trees.push({ x, z, h, s: 7 + rand() * 9 });
  }
  const houses = [];
  const v = WORLD.village;
  for (let i = 0; i < 46; i += 1) {
    const x = v.x0 + rand() * (v.x1 - v.x0);
    const z = v.z0 + rand() * (v.z1 - v.z0);
    const h = heightAt(x, z);
    if (h < 6) continue;
    houses.push({ x, z, h, w: 9 + rand() * 7, depth: 8 + rand() * 6, roof: rand() });
  }
  const clouds = [];
  for (let i = 0; i < 16; i += 1) {
    clouds.push({
      x: (rand() * 2 - 1) * 3200,
      y: 620 + rand() * 420,
      z: (rand() * 2 - 1) * 3200,
      r: 90 + rand() * 160,
    });
  }
  return { trees, houses, clouds };
}
