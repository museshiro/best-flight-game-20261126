// Cendrawasih Ridge Run — the ring course.
// One job: define the eight glowing rings over the island, track which is next,
// and notice when the plane flies through one.

import { GAME } from './config.js';
import { heightAt } from './terrain.js';

// Course waypoints: [x, z, clearance above the ground]. The heights are worked
// out from the terrain so every ring hangs in open air, never inside a hillside.
// The course is one lap around the island — beach, terraces, west coast, north
// coast, east ridge, village, sea — and back to the runway, so no leg ever
// cuts across the volcano cone.
const WAYPOINTS = [
  [0, 950, 85],       // 1 — just past the runway, low over the beach
  [-480, 320, 130],   // 2 — over the rice terraces
  [-900, -200, 160],  // 3 — along the west coast
  [-700, -1100, 220], // 4 — north-west coast, clear of the cone
  [300, -1300, 220],  // 5 — north coast, under the summit's shadow
  [1150, -700, 200],  // 6 — along the eastern ridge
  [1150, 300, 120],   // 7 — over the fishing village
  [0, 2150, 80],      // 8 — final approach, lined up with the runway
];

export function createRings() {
  const rings = WAYPOINTS.map(([x, z, clear], i) => ({
    index: i,
    x, z,
    y: Math.max(heightAt(x, z) + clear, 55),
    passed: false,
    pulse: i * 0.7,
  }));
  return { rings, next: 0, passedCount: 0 };
}

/** The ring the pilot is flying to now, or null when the course is done. */
export function nextRing(course) {
  return course.next < course.rings.length ? course.rings[course.next] : null;
}

/**
 * Check the plane against the next ring. Returns true on a pass: the plane must
 * be inside the ring's disc (within its radius, close to its plane).
 */
export function checkRing(course, f) {
  const ring = nextRing(course);
  if (!ring) return false;
  const dx = f.x - ring.x;
  const dy = f.y - ring.y;
  const dz = f.z - ring.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < GAME.ringRadius) {
    ring.passed = true;
    course.next += 1;
    course.passedCount += 1;
    return true;
  }
  return false;
}

/** Straight-line distance to the next ring, for the HUD. */
export function distanceToNext(course, f) {
  const ring = nextRing(course);
  if (!ring) return 0;
  return Math.hypot(f.x - ring.x, f.y - ring.y, f.z - ring.z);
}
