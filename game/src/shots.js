// Cendrawasih Ridge Run — the screenshot scenes behind ?shot=.
// One job: stage a named scene by playing the real rules forward from a fresh
// sortie with a simple autopilot, so each frame is what a short game really
// looks like and the same seed always gives the same frame.

import { STEP } from './config.js';
import { nextRing } from './rings.js';
import { heightAt } from './terrain.js';
import { stepWorld, SCREEN_TITLE, SCREEN_PLAY, SCREEN_DONE, SCREEN_CRASH } from './world.js';

/**
 * Steer toward a point: bank to the heading, pitch to the height, throttle to
 * the speed. A PD controller on both stick axes (want an attitude, drive the
 * stick toward it) so the plane settles instead of swinging past the target,
 * and it slows near a ring so the turn radius shrinks enough to fly through
 * the 26 m disc.
 */
function autopilot(f, tx, ty, tz, opts = {}) {
  const dx = tx - f.x;
  const dz = tz - f.z;
  const wantHeading = Math.atan2(dx, -dz);
  let err = wantHeading - f.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  const dist = Math.hypot(dx, dz);
  let wantPitch = Math.max(-0.3, Math.min(0.48, (ty - f.y) / Math.max(60, dist)));
  const wantRoll = Math.max(-0.85, Math.min(0.85, err * 1.1));
  // Slow down near a ring (tighter turns) and while climbing hard (steeper).
  let wantSpeed = dist < 250 || wantPitch > 0.3 ? 50 : 72;
  // Terrain ahead: if the ground a couple of seconds ahead is close, climb
  // now, whatever the ring says — the volcano's shoulders are higher than
  // they look. The lookahead follows the speed, so a tight turn does not
  // sweep the check across ground the plane will never reach.
  const look = Math.max(120, Math.min(250, f.speed * 2.5));
  const lx = f.x + Math.sin(f.heading) * look;
  const lz = f.z - Math.cos(f.heading) * look;
  // On the landing final the runway corridor is flat beach and sea, so the
  // usual 60 m margin would hold the plane above 64 m forever and never let
  // it down onto the runway (and the hills beside the runway, 40 m+, would
  // trap it in a climbing orbit). There, climb only for real hills: ground
  // above 10 m with a 15 m margin.
  const groundAhead = heightAt(lx, lz);
  const margin = opts.final ? 15 : 60;
  if (f.y < groundAhead + margin && (!opts.final || groundAhead > 10)) {
    wantPitch = Math.max(wantPitch, 0.48);
    wantSpeed = 50;
  }
  const throttle = f.speed < wantSpeed ? 1 : f.speed > wantSpeed + 6 ? -1 : 0;
  return {
    pitch: Math.max(-1, Math.min(1, (wantPitch - f.pitch) * 3)),
    roll: Math.max(-1, Math.min(1, (wantRoll - f.roll) * 3)),
    throttle,
    brake: false,
  };
}

function flySteps(w, audio, steps, target) {
  for (let i = 0; i < steps; i += 1) {
    if (w.screen !== SCREEN_PLAY) break;
    const ctl = target ? autopilot(w.flight, target.x, target.y, target.z) : { pitch: 0, roll: 0, throttle: 0, brake: false };
    stepWorld(w, ctl, audio);
  }
}

/** Run the world forward until `passed` rings are flown and the plane is close
 *  to the next one, or the step budget runs out. Always steers at the next ring,
 *  so no ring is ever skipped on the way. */
function flyCourse(w, audio, passed, maxSteps, stopDist) {
  for (let i = 0; i < maxSteps; i += 1) {
    if (w.screen !== SCREEN_PLAY) break;
    const ring = nextRing(w.course);
    if (!ring) break;
    stepWorld(w, autopilot(w.flight, ring.x, ring.y, ring.z), audio);
    if (w.course.passedCount >= passed) {
      const next = nextRing(w.course);
      if (!next) break;
      const d = Math.hypot(w.flight.x - next.x, w.flight.y - next.y, w.flight.z - next.z);
      if (d < stopDist) break;
    }
  }
}

function flyToRunway(w, audio) {
  // Landing pattern after ring 8 (south of the runway, heading south):
  // swing out over the sea on a WEST offset, turn back, and come in
  // northbound, low and slow. The offset leg is the trick: a left 180°
  // turn displaces the plane ~150 m east, so entering it from x = -160
  // exits the turn on the centreline heading north. The final leg aims far
  // past the runway's north end, so the approach is a straight line down
  // the centreline instead of a circle around a near point.
  const legs = [
    { x: -160, y: 80, z: 2550 },
    { x: 0, y: 30, z: 2300 },
    { x: 0, y: 6, z: 500 },
  ];
  let leg = 0;
  for (let i = 0; i < 60 * 120; i += 1) {
    if (w.screen !== SCREEN_PLAY) break;
    const f = w.flight;
    const target = legs[leg];
    stepWorld(w, autopilot(f, target.x, target.y, target.z, { final: true }), audio);
    const d = Math.hypot(f.x - target.x, f.y - target.y, f.z - target.z);
    if (d < 120 && leg < legs.length - 1) leg += 1;
    // The money frame: low over the threshold, runway dead ahead.
    if (leg === legs.length - 1 && f.airborne && f.z < 2050 && f.z > 1650
      && f.y < 60 && Math.abs(f.x) < 35 && Math.abs(Math.sin(f.heading)) < 0.3) break;
  }
}

/**
 * Set the world to the named scene and return the screen to draw over it.
 * start: the title on the runway. flight: mid-course, a ring dead ahead.
 * terrace: low over the paddies with the village below. landing: final approach.
 */
export function stageShot(name, w, audio) {
  w.screen = SCREEN_PLAY;
  if (name === 'start') {
    return { screen: SCREEN_TITLE };
  }
  if (name === 'flight') {
    flySteps(w, audio, 60 * 6, { x: 0, y: 60, z: 1200 });
    flyCourse(w, audio, 1, 60 * 120, 260);
    return { screen: w.screen === SCREEN_PLAY ? SCREEN_PLAY : w.screen };
  }
  if (name === 'terrace') {
    flySteps(w, audio, 60 * 6, { x: 0, y: 60, z: 1200 });
    flyCourse(w, audio, 2, 60 * 120, 200);
    // Drop low over the paddies for the shot.
    flySteps(w, audio, 60 * 4, { x: -200, y: 150, z: 600 });
    return { screen: w.screen === SCREEN_PLAY ? SCREEN_PLAY : w.screen };
  }
  if (name === 'landing') {
    flySteps(w, audio, 60 * 6, { x: 0, y: 60, z: 1200 });
    flyCourse(w, audio, 8, 60 * 180, 0);
    flyToRunway(w, audio);
    return { screen: w.screen === SCREEN_PLAY ? SCREEN_PLAY : w.screen };
  }
  return { screen: SCREEN_TITLE };
}

export { SCREEN_TITLE, SCREEN_PLAY, SCREEN_DONE, SCREEN_CRASH };
