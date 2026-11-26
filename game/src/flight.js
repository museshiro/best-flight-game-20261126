// Cendrawasih Ridge Run — the flight model.
// One job: move the little prop plane through the air. Arcade, not a simulator:
// throttle sets a target speed, pitch trades speed for height, banking turns the
// nose, too slow means a stall, and the ground (or the sea) always wins.

import { PLANE, WORLD } from './config.js';
import { heightAt, onRunway, overSea } from './terrain.js';

export function createFlight() {
  return {
    x: 0, y: WORLD.runway.height + 2, z: 1760,
    heading: 0, pitch: 0, roll: 0,
    speed: 0, throttle: 0,
    airborne: false, landed: false, crashed: false, crashReason: '',
    verticalSpeed: 0, groundSpeed: 0,
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Advance the plane one fixed step. `ctl` carries pitch/roll/throttle inputs in
 * -1..1 (throttle is a delta). Returns an event string: '', 'takeoff', 'landed',
 * 'crashed' or 'ditched'.
 */
export function stepFlight(f, ctl, dt) {
  if (f.crashed || f.landed) return '';
  // Throttle: W/S (or Shift/Ctrl) nudge it; it stays where the pilot left it.
  f.throttle = clamp(f.throttle + ctl.throttle * dt * 0.55, 0, 1);
  // Pitch answers the stick and then stays where the pilot left it, like a
  // trimmed aeroplane: a climb holds until the pilot pushes the nose down.
  f.pitch = clamp(f.pitch + ctl.pitch * PLANE.pitchRate * dt, PLANE.pitchMin, PLANE.pitchMax);
  f.roll = clamp(f.roll + ctl.roll * PLANE.rollRate * dt, -PLANE.rollMax, PLANE.rollMax);
  if (ctl.roll === 0) f.roll += (0 - f.roll) * Math.min(1, dt * PLANE.rollLevelRate);
  // A banked turn: the nose follows the bank, harder the faster you fly.
  // Banking right (positive roll) swings the heading toward the east.
  f.heading += Math.sin(f.roll) * (f.speed / 45) * PLANE.turnFactor * dt;
  // Speed chases the throttle, and climbing bleeds it away.
  const target = f.throttle * PLANE.maxSpeed - Math.sin(f.pitch) * 26;
  f.speed += (target - f.speed) * Math.min(1, dt * PLANE.accel);
  if (f.speed < 0) f.speed = 0;
  // Lift: below flying speed the nose drops and the plane sinks.
  let sink = 0;
  if (f.speed < PLANE.minFlySpeed) {
    sink = (PLANE.minFlySpeed - f.speed) * 0.55;
    f.pitch = Math.max(f.pitch - dt * 0.35, PLANE.pitchMin);
  }
  const cp = Math.cos(f.pitch);
  const fx = Math.sin(f.heading) * cp;
  const fy = Math.sin(f.pitch);
  const fz = -Math.cos(f.heading) * cp;
  const braking = ctl.brake ? 0.45 : 1;
  f.x += fx * f.speed * braking * dt;
  f.y += (fy * f.speed - sink) * dt;
  f.z += fz * f.speed * braking * dt;
  f.verticalSpeed = fy * f.speed - sink;
  f.groundSpeed = f.speed * cp;
  const ground = heightAt(f.x, f.z);
  // Rolling on the runway: stay glued until rotation speed, then the nose
  // lifts on its own — an arcade assist, so throttle alone gets you airborne.
  if (!f.airborne) {
    if (f.speed >= PLANE.takeoffSpeed) {
      f.pitch = Math.min(f.pitch + dt * 0.55, PLANE.pitchMax * 0.5);
    }
    if (f.speed >= PLANE.takeoffSpeed && f.pitch > 0.06) {
      f.airborne = true;
      f.pitch = 0.32; // rotate: a proper climb-out off the beach runway
      return 'takeoff';
    }
    f.y = ground + 2;
    if (f.speed < 1 && f.throttle < 0.05) f.y = ground + 2;
  }
  if (f.airborne && f.y <= ground + 1.6) {
    const aligned = Math.abs(Math.sin(f.heading)) < 0.42;
    const gentle = f.verticalSpeed > -4.5 && f.speed < 48 && Math.abs(f.roll) < 0.28;
    if (onRunway(f.x, f.z) && aligned && gentle) {
      f.landed = true;
      f.y = ground + 2;
      return 'landed';
    }
    f.crashed = true;
    f.crashReason = overSea(f.x, f.z) ? 'ditched in the sea' : 'hit the terrain';
    return 'crashed';
  }
  if (f.y < 0.5 && overSea(f.x, f.z)) {
    f.crashed = true;
    f.crashReason = 'ditched in the sea';
    return 'crashed';
  }
  return '';
}

/** Height above the ground (or sea) right now, for the altimeter and warnings. */
export function heightAboveGround(f) {
  return Math.max(0, f.y - heightAt(f.x, f.z));
}
