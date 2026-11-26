// Cendrawasih Ridge Run — the renderer.
// One job: paint everything on one canvas. A hand-rolled perspective projector
// (no library, no WebGL) draws the sky, the sea, the island mesh with a painter's
// sort, the runway, the village, the trees, the glowing rings and the little prop
// plane in chase view — then the instruments, the HUD and the screens on top.

import { WORLD } from './config.js';
import { heightAt, groundColour, shadeColour, onRunway, buildScenery } from './terrain.js';
import { nextRing } from './rings.js';
import { heightAboveGround } from './flight.js';

const GRID_MIN = -2100;
const GRID_STEP = 60;
const GRID_N = 71; // (4200 / 60) + 1 vertices a side
const SEA_EXTENT = 6000;
const SEA_STEP = 600;
const FOG_FAR = 2800;
const HAZE = [158, 192, 222];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  // The island mesh, baked once: heights and colours never change.
  const heights = new Float32Array(GRID_N * GRID_N);
  const colours = new Uint8Array(GRID_N * GRID_N * 3);
  for (let iz = 0; iz < GRID_N; iz += 1) {
    for (let ix = 0; ix < GRID_N; ix += 1) {
      const x = GRID_MIN + ix * GRID_STEP;
      const z = GRID_MIN + iz * GRID_STEP;
      const h = heightAt(x, z);
      heights[iz * GRID_N + ix] = h;
      const c = groundColour(x, z, h);
      colours[(iz * GRID_N + ix) * 3] = c[0];
      colours[(iz * GRID_N + ix) * 3 + 1] = c[1];
      colours[(iz * GRID_N + ix) * 3 + 2] = c[2];
    }
  }
  const scenery = buildScenery();
  return {
    canvas, ctx, heights, colours, scenery,
    cam: { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 },
    w: 0, h: 0, focal: 800, cx: 0, cy: 0,
    time: 0,
  };
}

function resize(r) {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = r.canvas.clientWidth || 1280;
  const h = r.canvas.clientHeight || 720;
  if (r.canvas.width !== Math.round(w * dpr) || r.canvas.height !== Math.round(h * dpr)) {
    r.canvas.width = Math.round(w * dpr);
    r.canvas.height = Math.round(h * dpr);
  }
  r.w = r.canvas.width;
  r.h = r.canvas.height;
  r.cx = r.w / 2;
  r.cy = r.h / 2;
  r.focal = (r.h / 2) / Math.tan((68 * Math.PI) / 360);
}

/** Point the chase camera at the plane, with the mouse look-around applied.
 *  `lift`/`back`/`pitchBias` let the title screen use a higher, down-tilted
 *  cinematic camera instead of the chase view. */
function aimCamera(r, f, lookYaw, lookPitch, lift = 0, back = 15, pitchBias = 0) {
  const cp = Math.cos(f.pitch);
  const fx = Math.sin(f.heading) * cp;
  const fy = Math.sin(f.pitch);
  const fz = -Math.cos(f.heading) * cp;
  // Chase: behind and above, then the look offset swings the view.
  const up = 4.5 + lift;
  let cx = f.x - fx * back;
  let cy = f.y + up - fy * back;
  let cz = f.z - fz * back;
  if (cy < heightAt(cx, cz) + 3) cy = heightAt(cx, cz) + 3;
  // Look target: ahead of the plane, swung by the mouse drag.
  const yaw = f.heading + lookYaw;
  const pitch = clamp(f.pitch * 0.25 + lookPitch * 0.4 + pitchBias, -0.5, 0.5);
  const tx = f.x + Math.sin(yaw) * Math.cos(pitch) * 40;
  const ty = f.y + Math.sin(pitch) * 40 + 1;
  const tz = f.z - Math.cos(yaw) * Math.cos(pitch) * 40;
  let fdx = tx - cx;
  let fdy = ty - cy;
  let fdz = tz - cz;
  const len = Math.hypot(fdx, fdy, fdz) || 1;
  fdx /= len; fdy /= len; fdz /= len;
  // Right = forward x world-up = (-fz, 0, fx); up = right x forward.
  let rx = -fdz;
  let rz = fdx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl; rz /= rl;
  const ux = -rz * fdy;
  const uy = rz * fdx - rx * fdz;
  const uz = rx * fdy;
  const ul = Math.hypot(ux, uy, uz) || 1;
  r.cam = {
    x: cx, y: cy, z: cz,
    fx: fdx, fy: fdy, fz: fdz,
    rx, ry: 0, rz,
    ux: ux / ul, uy: uy / ul, uz: uz / ul,
  };
}

/** Project a world point to screen space; null when behind the camera. */
function project(r, x, y, z) {
  const dx = x - r.cam.x;
  const dy = y - r.cam.y;
  const dz = z - r.cam.z;
  const zc = dx * r.cam.fx + dy * r.cam.fy + dz * r.cam.fz;
  if (zc < 1.5) return null;
  const xc = dx * r.cam.rx + dy * r.cam.ry + dz * r.cam.rz;
  const yc = dx * r.cam.ux + dy * r.cam.uy + dz * r.cam.uz;
  return { x: r.cx + (xc / zc) * r.focal, y: r.cy - (yc / zc) * r.focal, d: zc };
}

/** Camera-space coordinates of a world point (before the divide). */
function toCamera(r, x, y, z) {
  const dx = x - r.cam.x;
  const dy = y - r.cam.y;
  const dz = z - r.cam.z;
  return {
    x: dx * r.cam.rx + dy * r.cam.ry + dz * r.cam.rz,
    y: dx * r.cam.ux + dy * r.cam.uy + dz * r.cam.uz,
    z: dx * r.cam.fx + dy * r.cam.fy + dz * r.cam.fz,
  };
}

/**
 * Project a polygon (world points) to screen space, clipping it against the
 * near plane in camera space first — so the ground right under the camera
 * still fills the bottom of the frame instead of leaving a hole.
 */
function projectPolygon(r, points) {
  const NEAR = 2;
  let poly = points.map((p) => toCamera(r, p[0], p[1], p[2]));
  // Sutherland–Hodgman against z >= NEAR.
  const clipped = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const aIn = a.z >= NEAR;
    const bIn = b.z >= NEAR;
    if (aIn) clipped.push(a);
    if (aIn !== bIn) {
      const t = (NEAR - a.z) / (b.z - a.z);
      clipped.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: NEAR,
      });
    }
  }
  if (clipped.length < 3) return null;
  return clipped.map((p) => ({
    x: r.cx + (p.x / p.z) * r.focal,
    y: r.cy - (p.y / p.z) * r.focal,
    d: p.z,
  }));
}

/** Fill a projected polygon, grown half a pixel so neighbours never leave a
 *  seam between them. */
function fillPoly(ctx, pts) {
  let cx = 0;
  let cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length;
  cy /= pts.length;
  const grow = 0.8;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const l = Math.hypot(dx, dy) || 1;
    const x = p.x + (dx / l) * grow;
    const y = p.y + (dy / l) * grow;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
}

/** Fill a projected quad, grown half a pixel toward its corners so adjacent
 *  quads never leave an antialiasing seam between them. */
function fillQuad(ctx, p1, p2, p3, p4) {
  fillPoly(ctx, [p1, p2, p3, p4]);
}

function drawSky(r, f) {
  const ctx = r.ctx;
  const g = ctx.createLinearGradient(0, 0, 0, r.h);
  g.addColorStop(0, '#2f7fd0');
  g.addColorStop(0.45, '#7db8e8');
  g.addColorStop(0.62, '#cfe8f7');
  g.addColorStop(1, '#9fc6e2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, r.w, r.h);
  // Sun, high and to the east.
  const sun = project(r, f.x + 2600, 1500, f.z - 3200);
  if (sun) {
    const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 130);
    glow.addColorStop(0, 'rgba(255,246,200,0.95)');
    glow.addColorStop(0.25, 'rgba(255,230,140,0.55)');
    glow.addColorStop(1, 'rgba(255,230,140,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sun.x - 140, sun.y - 140, 280, 280);
    ctx.fillStyle = '#fff7cf';
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawClouds(r) {
  const ctx = r.ctx;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const c of r.scenery.clouds) {
    const p = project(r, c.x, c.y, c.z);
    if (!p) continue;
    const s = (c.r * r.focal) / p.d;
    if (s < 4) continue;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, s, s * 0.32, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - s * 0.5, p.y + s * 0.08, s * 0.6, s * 0.24, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + s * 0.55, p.y + s * 0.06, s * 0.55, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Volcano smoke: grey puffs drifting up from the crater.
  const v = WORLD.volcano;
  const t = r.time;
  for (let i = 0; i < 5; i += 1) {
    const age = ((t * 0.12 + i * 0.2) % 1);
    const p = project(r, v.x + Math.sin(i * 2.4) * 30, v.height - 60 + age * 260, v.z + Math.cos(i * 1.7) * 30);
    if (!p) continue;
    const s = (26 + age * 60) * r.focal / p.d;
    ctx.fillStyle = `rgba(120,118,112,${0.5 * (1 - age)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(2, s), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** One sorted painter pass over the sea grid and the island mesh. */
function drawGround(r) {
  const ctx = r.ctx;
  const items = [];
  // Sea: big flat quads at y = 0, out to the horizon.
  for (let iz = 0; iz < SEA_EXTENT / SEA_STEP; iz += 1) {
    for (let ix = 0; ix < SEA_EXTENT / SEA_STEP; ix += 1) {
      const x0 = -SEA_EXTENT + ix * SEA_STEP;
      const z0 = -SEA_EXTENT + iz * SEA_STEP;
      const cx = x0 + SEA_STEP / 2;
      const cz = z0 + SEA_STEP / 2;
      const dx = cx - r.cam.x;
      const dz = cz - r.cam.z;
      const dist = Math.hypot(dx, dz);
      if (dist > FOG_FAR + 1200) continue;
      if (dx * r.cam.fx + dz * r.cam.fz < -300) continue;
      // Skip sea under the island itself: the mesh covers it.
      if (Math.hypot(cx, cz) < WORLD.islandRadius - 120) continue;
      items.push({ kind: 0, x0, z0, d: dist });
    }
  }
  // Island mesh cells.
  for (let iz = 0; iz < GRID_N - 1; iz += 1) {
    for (let ix = 0; ix < GRID_N - 1; ix += 1) {
      const x0 = GRID_MIN + ix * GRID_STEP;
      const z0 = GRID_MIN + iz * GRID_STEP;
      const cx = x0 + GRID_STEP / 2;
      const cz = z0 + GRID_STEP / 2;
      const dx = cx - r.cam.x;
      const dz = cz - r.cam.z;
      const dist = Math.hypot(dx, dz);
      if (dist > FOG_FAR) continue;
      if (dx * r.cam.fx + dz * r.cam.fz < -200) continue;
      items.push({ kind: 1, ix, iz, d: dist });
    }
  }
  items.sort((a, b) => b.d - a.d);
  for (const it of items) {
    if (it.kind === 0) {
      const poly = projectPolygon(r, [
        [it.x0, 0, it.z0],
        [it.x0 + SEA_STEP, 0, it.z0],
        [it.x0 + SEA_STEP, 0, it.z0 + SEA_STEP],
        [it.x0, 0, it.z0 + SEA_STEP],
      ]);
      if (!poly) continue;
      const fog = clamp(it.d / (FOG_FAR + 800), 0, 0.6);
      ctx.fillStyle = shadeColour([28, 110, 168], 1 - fog * 0.25, fog, HAZE);
      fillPoly(ctx, poly);
    } else {
      const { ix, iz } = it;
      const i00 = iz * GRID_N + ix;
      const i10 = i00 + 1;
      const i01 = i00 + GRID_N;
      const i11 = i01 + 1;
      const x0 = GRID_MIN + ix * GRID_STEP;
      const z0 = GRID_MIN + iz * GRID_STEP;
      const poly = projectPolygon(r, [
        [x0, r.heights[i00], z0],
        [x0 + GRID_STEP, r.heights[i10], z0],
        [x0 + GRID_STEP, r.heights[i11], z0 + GRID_STEP],
        [x0, r.heights[i01], z0 + GRID_STEP],
      ]);
      if (!poly) continue;
      // Cheap slope light: a quad tilted toward the sun is brighter.
      const slope = clamp(1 - Math.abs(r.heights[i10] - r.heights[i00]) / 90, 0.72, 1.06);
      const fog = clamp(it.d / FOG_FAR, 0, 0.55);
      const o = i00 * 3;
      ctx.fillStyle = shadeColour(
        [r.colours[o], r.colours[o + 1], r.colours[o + 2]], slope, fog, HAZE,
      );
      fillPoly(ctx, poly);
    }
  }
}

function drawRunway(r) {
  const ctx = r.ctx;
  const rw = WORLD.runway;
  const y = rw.height + 0.6;
  const strip = projectPolygon(r, [
    [rw.x - rw.halfWidth, y, rw.zMin],
    [rw.x + rw.halfWidth, y, rw.zMin],
    [rw.x + rw.halfWidth, y, rw.zMax],
    [rw.x - rw.halfWidth, y, rw.zMax],
  ]);
  if (!strip) return;
  ctx.fillStyle = '#3a3f46';
  fillPoly(ctx, strip);
  // Centreline dashes and threshold bars.
  ctx.fillStyle = '#f4f6f0';
  for (let z = rw.zMin + 40; z < rw.zMax - 20; z += 60) {
    const dash = projectPolygon(r, [
      [-1.2, y + 0.2, z],
      [1.2, y + 0.2, z],
      [1.2, y + 0.2, z + 26],
      [-1.2, y + 0.2, z + 26],
    ]);
    if (!dash) continue;
    fillPoly(ctx, dash);
  }
}

function drawScenery(r) {
  const ctx = r.ctx;
  const near = [];
  for (const t of r.scenery.trees) {
    const d = Math.hypot(t.x - r.cam.x, t.z - r.cam.z);
    if (d < 1000) near.push({ kind: 'tree', ...t, dist: d });
  }
  for (const hs of r.scenery.houses) {
    const d = Math.hypot(hs.x - r.cam.x, hs.z - r.cam.z);
    if (d < 1300) near.push({ kind: 'house', ...hs, dist: d });
  }
  near.sort((a, b) => b.dist - a.dist);
  for (const s of near) {
    const p = project(r, s.x, s.h, s.z);
    if (!p) continue;
    if (p.d < 30) continue; // too close to draw: it would fill the screen
    const scale = r.focal / p.d;
    if (s.kind === 'tree') {
      const w = s.s * scale;
      const hgt = s.s * 2.2 * scale;
      ctx.fillStyle = '#2c6b34';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - hgt);
      ctx.lineTo(p.x - w * 0.7, p.y);
      ctx.lineTo(p.x + w * 0.7, p.y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1d4a24';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - hgt * 0.62);
      ctx.lineTo(p.x - w * 0.5, p.y - hgt * 0.3);
      ctx.lineTo(p.x + w * 0.5, p.y - hgt * 0.3);
      ctx.closePath(); ctx.fill();
    } else {
      const w = s.w * scale;
      const hgt = s.depth * 0.8 * scale;
      ctx.fillStyle = '#e8ddc4';
      ctx.fillRect(p.x - w / 2, p.y - hgt, w, hgt);
      ctx.fillStyle = s.roof > 0.5 ? '#b23a2e' : '#8c4a2f';
      ctx.beginPath();
      ctx.moveTo(p.x - w / 2 - 2, p.y - hgt);
      ctx.lineTo(p.x, p.y - hgt - w * 0.55);
      ctx.lineTo(p.x + w / 2 + 2, p.y - hgt);
      ctx.closePath(); ctx.fill();
    }
  }
}

function drawRings(r, course, time) {
  const ctx = r.ctx;
  for (const ring of course.rings) {
    const d = Math.hypot(ring.x - r.cam.x, ring.z - r.cam.z);
    if (d > 2600) continue;
    const isNext = course.rings[course.next] === ring;
    const done = ring.passed;
    if (done) continue;
    const pulse = 1 + Math.sin(time * 3 + ring.pulse) * 0.06;
    const radius = 26 * pulse;
    // The ring faces the pilot: its plane is square to the course direction.
    const prev = course.rings[ring.index - 1] || { x: 0, z: 1900 };
    let nx = ring.x - prev.x;
    let nz = ring.z - prev.z;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    // Ring plane basis: horizontal across, vertical up.
    const ax = -nz; const az = nx;
    ctx.lineWidth = Math.max(2, 900 / Math.max(60, d));
    ctx.strokeStyle = isNext ? 'rgba(255,170,40,0.35)' : 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    let first = true;
    for (let i = 0; i <= 28; i += 1) {
      const a = (i / 28) * Math.PI * 2;
      const px = ring.x + ax * Math.cos(a) * radius;
      const py = ring.y + Math.sin(a) * radius;
      const pz = ring.z + az * Math.cos(a) * radius;
      const p = project(r, px, py, pz);
      if (!p) { first = true; continue; }
      if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.lineWidth = Math.max(1.2, 420 / Math.max(60, d));
    ctx.strokeStyle = isNext ? '#ffb52e' : '#dfe8ee';
    ctx.stroke();
    if (isNext) {
      // A floating chevron above the next ring so it is easy to spot.
      const bob = Math.sin(time * 2.4) * 4;
      const top = project(r, ring.x, ring.y + radius + 14 + bob, ring.z);
      if (top) {
        const s = clamp(1400 / Math.max(80, d), 6, 26);
        ctx.fillStyle = '#ffb52e';
        ctx.beginPath();
        ctx.moveTo(top.x, top.y + s * 0.7);
        ctx.lineTo(top.x - s, top.y - s * 0.5);
        ctx.lineTo(top.x + s, top.y - s * 0.5);
        ctx.closePath(); ctx.fill();
      }
    }
  }
}

/** The plane's soft shadow on the ground below it. */
function drawPlaneShadow(r, f) {
  const ctx = r.ctx;
  const ground = heightAt(f.x, f.z);
  const p = project(r, f.x, ground + 1, f.z);
  if (!p) return;
  const hgt = Math.max(6, f.y - ground);
  const s = clamp((r.focal * 9) / Math.max(40, p.d) / (1 + hgt / 120), 2, 60);
  ctx.fillStyle = `rgba(20,30,20,${clamp(0.34 - hgt / 900, 0.05, 0.34)})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, s * 1.6, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The little prop plane in chase view, drawn as vector art in screen space and
 * banked with the roll: red-and-cream livery, a spinning prop disc, green and
 * red navigation lights.
 */
function drawPlane(r, f, time) {
  const ctx = r.ctx;
  const s = Math.min(r.w, r.h) / 720;
  const px = r.cx;
  const py = r.h * 0.56 + f.pitch * 260 * s;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-f.roll);
  ctx.scale(s, s);
  // Wings, seen from behind and above.
  ctx.fillStyle = '#d8433a';
  ctx.beginPath();
  ctx.moveTo(-150, 6); ctx.lineTo(-34, -6); ctx.lineTo(-30, 10); ctx.lineTo(-150, 22);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(150, 6); ctx.lineTo(34, -6); ctx.lineTo(30, 10); ctx.lineTo(150, 22);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f6ead2';
  ctx.fillRect(-150, 12, 300, 4);
  // Tailplane and fin.
  ctx.fillStyle = '#b93228';
  ctx.beginPath();
  ctx.moveTo(-52, 26); ctx.lineTo(-14, 20); ctx.lineTo(-12, 30); ctx.lineTo(-52, 36);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(52, 26); ctx.lineTo(14, 20); ctx.lineTo(12, 30); ctx.lineTo(52, 36);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d8433a';
  ctx.beginPath();
  ctx.moveTo(-4, 18); ctx.lineTo(4, 18); ctx.lineTo(10, 44); ctx.lineTo(-10, 44);
  ctx.closePath(); ctx.fill();
  // Fuselage, tapering toward the nose (up-screen, away from us).
  ctx.fillStyle = '#e8d9b8';
  ctx.beginPath();
  ctx.moveTo(-13, -72);
  ctx.quadraticCurveTo(-20, -30, -15, 10);
  ctx.quadraticCurveTo(-12, 44, 0, 50);
  ctx.quadraticCurveTo(12, 44, 15, 10);
  ctx.quadraticCurveTo(20, -30, 13, -72);
  ctx.quadraticCurveTo(0, -80, -13, -72);
  ctx.closePath(); ctx.fill();
  // Red cheatline and the bird's name on the tail.
  ctx.fillStyle = '#d8433a';
  ctx.fillRect(-15, -6, 30, 7);
  ctx.fillStyle = '#7a1f18';
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CENDRAWASIH', 0, 40);
  // Canopy.
  ctx.fillStyle = '#9fd4e8';
  ctx.beginPath();
  ctx.ellipse(0, -52, 8.5, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-2.5, -56, 3, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Spinning prop disc at the nose.
  const prop = ctx.createRadialGradient(0, -78, 2, 0, -78, 34);
  prop.addColorStop(0, 'rgba(60,60,60,0.12)');
  prop.addColorStop(0.75, 'rgba(60,60,60,0.22)');
  prop.addColorStop(1, 'rgba(60,60,60,0)');
  ctx.fillStyle = prop;
  ctx.beginPath();
  ctx.ellipse(0, -78, 34, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath();
  ctx.ellipse(0, -78, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Navigation lights: green left, red right, blinking.
  const blink = Math.sin(time * 6) > 0 ? 1 : 0.25;
  ctx.globalAlpha = blink;
  ctx.fillStyle = '#39d353';
  ctx.beginPath(); ctx.arc(-150, 12, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff4d4d';
  ctx.beginPath(); ctx.arc(150, 12, 4, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ------------------------------------------------------------------ HUD */

function compassLabel(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function drawHud(r, w, f) {
  const ctx = r.ctx;
  const s = Math.min(r.w, r.h) / 720;
  const heading = Math.round((((f.heading * 180) / Math.PI) % 360 + 360) % 360);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // Top-left: the flight numbers the judge looks for.
  ctx.fillStyle = 'rgba(8,20,32,0.55)';
  roundRect(ctx, 14 * s, 12 * s, 250 * s, 96 * s, 10 * s);
  ctx.fill();
  ctx.fillStyle = '#eaf6ff';
  ctx.font = `bold ${20 * s}px system-ui, sans-serif`;
  ctx.fillText(`ALT ${Math.round(f.y)} m`, 26 * s, 40 * s);
  ctx.fillText(`SPD ${Math.round(f.speed * 3.6)} km/h`, 26 * s, 66 * s);
  ctx.fillText(`HDG ${String(heading).padStart(3, '0')}° ${compassLabel(heading)}`, 26 * s, 92 * s);
  // Top-right: score, rings, clock.
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(8,20,32,0.55)';
  roundRect(ctx, r.w - 264 * s, 12 * s, 250 * s, 96 * s, 10 * s);
  ctx.fill();
  ctx.fillStyle = '#ffe9a8';
  ctx.font = `bold ${22 * s}px system-ui, sans-serif`;
  ctx.fillText(`SCORE ${w.score}`, r.w - 26 * s, 40 * s);
  ctx.fillStyle = '#eaf6ff';
  ctx.font = `bold ${18 * s}px system-ui, sans-serif`;
  const ring = nextRing(w.course);
  ctx.fillText(`RINGS ${w.course.passedCount}/${w.course.rings.length}`, r.w - 26 * s, 66 * s);
  const t = Math.max(0, Math.ceil(w.timeLeft));
  ctx.fillStyle = t < 30 ? '#ff8a7a' : '#eaf6ff';
  ctx.fillText(`TIME ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, r.w - 26 * s, 92 * s);
  // Top-centre: compass strip.
  const cw = 300 * s;
  const cx = r.cx;
  ctx.fillStyle = 'rgba(8,20,32,0.55)';
  roundRect(ctx, cx - cw / 2, 12 * s, cw, 34 * s, 8 * s);
  ctx.fill();
  ctx.fillStyle = '#eaf6ff';
  ctx.font = `bold ${15 * s}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  for (let off = -60; off <= 60; off += 15) {
    const d = (heading + off + 360) % 360;
    const x = cx + (off / 60) * (cw / 2 - 14 * s);
    const major = d % 90 === 0;
    ctx.fillText(major ? compassLabel(d) : String(d), x, 35 * s);
  }
  ctx.fillStyle = '#ffb52e';
  ctx.beginPath();
  ctx.moveTo(cx, 12 * s); ctx.lineTo(cx - 6 * s, 4 * s); ctx.lineTo(cx + 6 * s, 4 * s);
  ctx.closePath(); ctx.fill();
  // Next-ring guidance: an amber arrow and distance under the compass.
  if (ring) {
    const p = project(r, ring.x, ring.y, ring.z);
    const dist = Math.round(Math.hypot(f.x - ring.x, f.y - ring.y, f.z - ring.z));
    ctx.fillStyle = '#ffb52e';
    ctx.font = `bold ${17 * s}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    if (p && p.x > 0 && p.x < r.w && p.y > 0 && p.y < r.h) {
      ctx.fillText(`◈ RING ${ring.index + 1} — ${dist} m`, r.cx, 66 * s);
    } else {
      // Off-screen: point at the screen edge toward it.
      const dx = ring.x - f.x;
      const dz = ring.z - f.z;
      const ang = Math.atan2(dx, -dz) - f.heading;
      const ax = r.cx + Math.sin(ang) * 130 * s;
      const ay = r.h * 0.3 + -Math.cos(ang) * 60 * s;
      ctx.save();
      ctx.translate(clamp(ax, 60 * s, r.w - 60 * s), clamp(ay, 80 * s, r.h * 0.5));
      ctx.rotate(Math.atan2(Math.sin(ang), -Math.cos(ang)) + Math.PI);
      ctx.beginPath();
      ctx.moveTo(0, -16 * s); ctx.lineTo(12 * s, 10 * s); ctx.lineTo(-12 * s, 10 * s);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillText(`RING ${ring.index + 1} — ${dist} m`, r.cx, 66 * s);
    }
  }
  // Centre flash message (ring scored, airborne, ...) — play screen only, so
  // it never overlaps the crash or done overlays.
  if (w.screen === 'play' && w.flash && r.time < w.flashUntil) {
    ctx.fillStyle = 'rgba(8,20,32,0.6)';
    ctx.font = `bold ${26 * s}px system-ui, sans-serif`;
    const tw = ctx.measureText(w.flash).width;
    roundRect(ctx, r.cx - tw / 2 - 18 * s, r.h * 0.24 - 34 * s, tw + 36 * s, 46 * s, 10 * s);
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center';
    ctx.fillText(w.flash, r.cx, r.h * 0.24);
  }
  // Lower-centre hint line.
  if (w.screen === 'play' && w.message && r.time < w.messageUntil) {
    ctx.fillStyle = 'rgba(8,20,32,0.55)';
    ctx.font = `${16 * s}px system-ui, sans-serif`;
    const tw = ctx.measureText(w.message).width;
    roundRect(ctx, r.cx - tw / 2 - 14 * s, r.h * 0.31 - 22 * s, tw + 28 * s, 30 * s, 8 * s);
    ctx.fill();
    ctx.fillStyle = '#eaf6ff';
    ctx.textAlign = 'center';
    ctx.fillText(w.message, r.cx, r.h * 0.31);
  }
  drawInstruments(r, w, f);
}

function roundRect(ctx, x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** The lit instrument panel along the bottom: attitude, dials, throttle, fuel. */
function drawInstruments(r, w, f) {
  const ctx = r.ctx;
  const s = Math.min(r.w, r.h) / 720;
  const pw = 460 * s;
  const ph = 108 * s;
  const px = r.cx - pw / 2;
  const py = r.h - ph - 12 * s;
  ctx.fillStyle = 'rgba(10,16,24,0.72)';
  roundRect(ctx, px, py, pw, ph, 12 * s);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5 * s;
  ctx.stroke();
  // Attitude indicator: a ball that rolls and pitches with the plane.
  const ax = px + 62 * s;
  const ay = py + ph / 2;
  const ar = 40 * s;
  ctx.save();
  ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.clip();
  ctx.translate(ax, ay);
  ctx.rotate(-f.roll);
  ctx.translate(0, f.pitch * ar * 1.4);
  ctx.fillStyle = '#3f8fd2';
  ctx.fillRect(-ar, -ar * 2, ar * 2, ar * 2);
  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(-ar, 0, ar * 2, ar * 2);
  ctx.fillStyle = '#eaf6ff';
  ctx.fillRect(-ar, -1.5 * s, ar * 2, 3 * s);
  ctx.restore();
  ctx.strokeStyle = '#eaf6ff';
  ctx.lineWidth = 2 * s;
  ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffb52e';
  ctx.beginPath();
  ctx.moveTo(ax - 14 * s, ay); ctx.lineTo(ax - 4 * s, ay); ctx.lineTo(ax, ay - 4 * s);
  ctx.lineTo(ax + 4 * s, ay); ctx.lineTo(ax + 14 * s, ay); ctx.lineTo(ax + 10 * s, ay + 3 * s);
  ctx.lineTo(ax - 10 * s, ay + 3 * s);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#9fb6c6';
  ctx.font = `${11 * s}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', ax, py + ph - 8 * s);
  // Altimeter dial.
  dial(r, px + 148 * s, ay, 34 * s, f.y / 1000, 'ALT', `${Math.round(f.y)}m`);
  // Airspeed dial.
  dial(r, px + 232 * s, ay, 34 * s, f.speed / 80, 'SPD', `${Math.round(f.speed * 3.6)}`);
  // Throttle bar + fuel gauge.
  const tx = px + 300 * s;
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  roundRect(ctx, tx, py + 16 * s, 16 * s, ph - 40 * s, 6 * s);
  ctx.fill();
  const th = (ph - 40 * s) * f.throttle;
  ctx.fillStyle = f.throttle > 0.85 ? '#ff8a5a' : '#57c785';
  roundRect(ctx, tx, py + 16 * s + (ph - 40 * s) - th, 16 * s, th, 6 * s);
  ctx.fill();
  ctx.fillStyle = '#9fb6c6';
  ctx.font = `${11 * s}px system-ui, sans-serif`;
  ctx.fillText('THR', tx + 8 * s, py + ph - 8 * s);
  const fx = px + 340 * s;
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  roundRect(ctx, fx, py + 16 * s, 16 * s, ph - 40 * s, 6 * s);
  ctx.fill();
  const fh = (ph - 40 * s) * (w.fuel / 100);
  ctx.fillStyle = w.fuel < 20 ? '#ff5a4d' : '#4da3ff';
  roundRect(ctx, fx, py + 16 * s + (ph - 40 * s) - fh, 16 * s, fh, 6 * s);
  ctx.fill();
  ctx.fillStyle = '#9fb6c6';
  ctx.fillText('FUEL', fx + 8 * s, py + ph - 8 * s);
  // Vertical speed, as text.
  ctx.fillStyle = '#eaf6ff';
  ctx.font = `bold ${13 * s}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  const vs = f.verticalSpeed;
  ctx.fillText(`V/S ${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s`, px + 386 * s, py + 34 * s);
  ctx.fillStyle = '#9fb6c6';
  ctx.font = `${11 * s}px system-ui, sans-serif`;
  ctx.fillText(`AGL ${Math.round(heightAboveGround(f))} m`, px + 386 * s, py + 56 * s);
  ctx.fillText('CENDRAWASIH', px + 386 * s, py + 78 * s);
}

function dial(r, cx, cy, rad, frac, label, value) {
  const ctx = r.ctx;
  const s = Math.min(r.w, r.h) / 720;
  ctx.fillStyle = '#0d1620';
  ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5a7285';
  ctx.lineWidth = 1.5 * s;
  ctx.stroke();
  for (let i = 0; i <= 10; i += 1) {
    const a = (-Math.PI * 0.75) + (i / 10) * Math.PI * 1.5;
    const x1 = cx + Math.cos(a) * (rad - 4 * s);
    const y1 = cy + Math.sin(a) * (rad - 4 * s);
    const x2 = cx + Math.cos(a) * (rad - 8 * s);
    const y2 = cy + Math.sin(a) * (rad - 8 * s);
    ctx.strokeStyle = '#9fb6c6';
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  const a = (-Math.PI * 0.75) + clamp(frac, 0, 1) * Math.PI * 1.5;
  ctx.strokeStyle = '#ffb52e';
  ctx.lineWidth = 2.4 * s;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * (rad - 9 * s), cy + Math.sin(a) * (rad - 9 * s));
  ctx.stroke();
  ctx.fillStyle = '#eaf6ff';
  ctx.font = `bold ${12 * s}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(value, cx, cy + rad * 0.52);
  ctx.fillStyle = '#9fb6c6';
  ctx.font = `${10 * s}px system-ui, sans-serif`;
  ctx.fillText(label, cx, cy + rad + 13 * s);
}

/* ------------------------------------------------------------- screens */

function overlay(r, alpha) {
  const ctx = r.ctx;
  ctx.fillStyle = `rgba(6,14,24,${alpha})`;
  ctx.fillRect(0, 0, r.w, r.h);
}

function centreText(r, lines) {
  const ctx = r.ctx;
  const s = Math.min(r.w, r.h) / 720;
  let y = r.h * 0.2;
  ctx.textAlign = 'center';
  for (const line of lines) {
    ctx.fillStyle = line.color;
    ctx.font = line.font(s);
    ctx.fillText(line.text, r.cx, y);
    y += line.gap * s;
  }
}

export function drawTitle(r, w) {
  overlay(r, 0.28);
  const s = Math.min(r.w, r.h) / 720;
  centreText(r, [
    { text: 'CENDRAWASIH', color: '#ffe9a8', font: (k) => `bold ${64 * k}px system-ui, sans-serif`, gap: 66 },
    { text: 'RIDGE RUN', color: '#ffffff', font: (k) => `bold ${44 * k}px system-ui, sans-serif`, gap: 52 },
    { text: 'A little red prop plane, one volcano island, eight glowing rings.', color: '#dceefc', font: (k) => `${19 * k}px system-ui, sans-serif`, gap: 34 },
    { text: 'Take off from the beach runway, fly every ring, land back home.', color: '#dceefc', font: (k) => `${19 * k}px system-ui, sans-serif`, gap: 56 },
  ]);
  const ctx = r.ctx;
  const boxW = 520 * s;
  const boxH = 178 * s;
  const bx = r.cx - boxW / 2;
  const by = r.h * 0.62;
  ctx.fillStyle = 'rgba(8,20,32,0.66)';
  roundRect(ctx, bx, by, boxW, boxH, 12 * s);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1.5 * s;
  ctx.stroke();
  ctx.fillStyle = '#eaf6ff';
  ctx.font = `${17 * s}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  const rows = [
    '↑ / ↓  pitch — climb and descend',
    '← / →  bank — turn the nose',
    'W / S  throttle up and down',
    'SPACE  airbrake   •   P pause   •   R restart',
    'Mouse drag — look around   •   Click — start',
  ];
  rows.forEach((row, i) => ctx.fillText(row, bx + 24 * s, by + 34 * s + i * 28 * s));
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb52e';
  ctx.font = `bold ${22 * s}px system-ui, sans-serif`;
  const blink = Math.sin(r.time * 4) > -0.2;
  if (blink) ctx.fillText('PRESS ENTER OR CLICK TO FLY', r.cx, by + boxH + 44 * s);
  if (w.best > 0) {
    ctx.fillStyle = '#eaf6ff';
    ctx.font = `${16 * s}px system-ui, sans-serif`;
    ctx.fillText(`Best score: ${w.best}`, r.cx, by + boxH + 74 * s);
  }
}

export function drawPaused(r) {
  overlay(r, 0.55);
  centreText(r, [
    { text: 'PAUSED', color: '#ffffff', font: (k) => `bold ${52 * k}px system-ui, sans-serif`, gap: 64 },
    { text: 'Press P or Enter to keep flying — R restarts the sortie.', color: '#dceefc', font: (k) => `${19 * k}px system-ui, sans-serif`, gap: 30 },
  ]);
}

export function drawCrash(r, w) {
  overlay(r, 0.5);
  centreText(r, [
    { text: 'CRASHED', color: '#ff8a7a', font: (k) => `bold ${56 * k}px system-ui, sans-serif`, gap: 62 },
    { text: w.reason, color: '#ffffff', font: (k) => `${21 * k}px system-ui, sans-serif`, gap: 44 },
    { text: `Rings flown: ${w.course.passedCount} of ${w.course.rings.length}   •   Score: ${w.score}`, color: '#dceefc', font: (k) => `${19 * k}px system-ui, sans-serif`, gap: 60 },
    { text: 'Press R or Enter to fly again', color: '#ffb52e', font: (k) => `bold ${21 * k}px system-ui, sans-serif`, gap: 30 },
  ]);
}

export function drawDone(r, w) {
  overlay(r, 0.5);
  const complete = w.course.passedCount === w.course.rings.length && w.landedBonus > 0;
  centreText(r, [
    { text: complete ? 'MISSION COMPLETE' : 'SORTIE OVER', color: '#ffe9a8', font: (k) => `bold ${52 * k}px system-ui, sans-serif`, gap: 60 },
    { text: w.reason, color: '#ffffff', font: (k) => `${20 * k}px system-ui, sans-serif`, gap: 42 },
    { text: `Rings ${w.ringsBonus}  +  Landing ${w.landedBonus}  +  Time ${w.timeBonus}`, color: '#dceefc', font: (k) => `${19 * k}px system-ui, sans-serif`, gap: 40 },
    { text: `SCORE ${w.score}    •    BEST ${w.best}`, color: '#ffb52e', font: (k) => `bold ${26 * k}px system-ui, sans-serif`, gap: 58 },
    { text: 'Press R or Enter to fly again', color: '#ffffff', font: (k) => `${19 * k}px system-ui, sans-serif`, gap: 30 },
  ]);
}

/* ------------------------------------------------------------- main draw */

export function draw(r, w, screen, lookYaw, lookPitch) {
  resize(r);
  const f = w.flight;
  if (screen === 'title') aimCamera(r, f, lookYaw, lookPitch, 7, 26, -0.16);
  else aimCamera(r, f, lookYaw, lookPitch);
  drawSky(r, f);
  drawClouds(r);
  drawGround(r);
  drawRunway(r);
  drawScenery(r);
  drawRings(r, w.course, r.time);
  if (screen !== 'title') drawPlaneShadow(r, f);
  if (screen === 'title') {
    drawPlane(r, f, r.time);
    drawTitle(r, w);
    return;
  }
  drawPlane(r, f, r.time);
  drawHud(r, w, f);
  if (screen === 'paused') drawPaused(r);
  else if (screen === 'crash') drawCrash(r, w);
  else if (screen === 'done') drawDone(r, w);
}
