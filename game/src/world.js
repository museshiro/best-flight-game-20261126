// Cendrawasih Ridge Run — the sortie.
// One job: own the game state (title, flying, paused, crashed, finished), the
// score, the fuel, the clock and the messages, and drive the flight model and
// the rings one fixed step at a time.

import { STEP, GAME } from './config.js';
import { createFlight, stepFlight, heightAboveGround } from './flight.js';
import { createRings, checkRing, nextRing } from './rings.js';
import { playChime, playAlarm, playCrash, updateAudio } from './audio.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CRASH = 'crash';
export const SCREEN_DONE = 'done';

export function createWorld(seed) {
  return {
    seed,
    screen: SCREEN_TITLE,
    flight: createFlight(),
    course: createRings(),
    score: 0,
    best: 0,
    timeLeft: GAME.timeLimit,
    fuel: 100,
    message: '',
    messageUntil: 0,
    flash: '',
    flashUntil: 0,
    elapsed: 0,
    reason: '',
    landedBonus: 0,
    timeBonus: 0,
    ringsBonus: 0,
    startAnnounced: false,
  };
}

export function resetWorld(w) {
  const best = w.best;
  const fresh = createWorld(w.seed);
  fresh.best = best;
  Object.keys(fresh).forEach((k) => { w[k] = fresh[k]; });
  w.screen = SCREEN_PLAY;
}

function say(w, text, seconds) {
  w.message = text;
  w.messageUntil = w.elapsed + seconds;
}

function flash(w, text, seconds) {
  w.flash = text;
  w.flashUntil = w.elapsed + seconds;
}

/** One fixed step of the sortie. `ctl` is the stick, `audio` the sound graph. */
export function stepWorld(w, ctl, audio) {
  if (w.screen !== SCREEN_PLAY) return;
  w.elapsed += STEP;
  const f = w.flight;
  // Fuel: full throttle burns it fast, idling sips it. Empty means gliding home.
  const drain = f.throttle > 0 ? GAME.fuelIdle + f.throttle * GAME.fuelDrain : GAME.fuelIdle;
  w.fuel = Math.max(0, w.fuel - drain * STEP);
  const effective = { ...ctl, throttle: w.fuel <= 0 ? -1 : ctl.throttle };
  if (w.fuel <= 0 && f.throttle > 0.02) f.throttle = Math.max(0, f.throttle - STEP);
  w.timeLeft -= STEP;
  const event = stepFlight(f, effective, STEP);
  if (event === 'takeoff') {
    flash(w, 'AIRBORNE — FLY THROUGH THE RINGS!', 2.5);
    say(w, 'Ring 1 is ahead, low over the beach.', 4);
  }
  if (event === 'landed') {
    w.landedBonus = w.course.passedCount === w.course.rings.length ? GAME.completeBonus : GAME.landingScore;
    w.timeBonus = w.course.passedCount === w.course.rings.length ? Math.round(w.timeLeft) * 2 : 0;
    w.ringsBonus = w.course.passedCount * GAME.ringScore;
    w.score = w.ringsBonus + w.landedBonus + w.timeBonus;
    w.screen = SCREEN_DONE;
    w.reason = w.course.passedCount === w.course.rings.length
      ? 'MISSION COMPLETE — all eight rings, and a safe landing!'
      : 'Landed safely. Fly all eight rings, then land, for the full bonus.';
    if (w.score > w.best) w.best = w.score;
    return;
  }
  if (event === 'crashed') {
    w.screen = SCREEN_CRASH;
    w.reason = f.crashReason === 'ditched in the sea'
      ? 'Ditched in the sea — keep it over the island!'
      : 'Crashed into the terrain — watch the ridge ahead!';
    w.score = w.course.passedCount * GAME.ringScore;
    if (w.score > w.best) w.best = w.score;
    playCrash(audio);
    return;
  }
  if (checkRing(w.course, f)) {
    w.score += GAME.ringScore;
    playChime(audio);
    const left = w.course.rings.length - w.course.passedCount;
    flash(w, `RING ${w.course.passedCount} — +${GAME.ringScore}!`, 1.8);
    say(w, left > 0 ? `${left} ring${left === 1 ? '' : 's'} to go. Follow the amber arrow.` : 'Course complete — land on the runway!', 4);
  }
  // Warnings: low over the ground, or the tanks nearly dry.
  const agl = heightAboveGround(f);
  if (f.airborne && agl < 35 && f.verticalSpeed < -2) playAlarm(audio);
  if (w.fuel < 20 && w.fuel > 0) {
    if (Math.floor(w.elapsed * 2) !== Math.floor((w.elapsed - STEP) * 2)) playAlarm(audio);
    say(w, 'LOW FUEL — ease off the throttle!', 1);
  }
  if (w.timeLeft <= 0) {
    w.screen = SCREEN_DONE;
    w.reason = 'Time up — the sortie is over.';
    w.ringsBonus = w.course.passedCount * GAME.ringScore;
    w.landedBonus = 0;
    w.timeBonus = 0;
    w.score = w.ringsBonus;
    if (w.score > w.best) w.best = w.score;
    return;
  }
  updateAudio(audio, f.throttle, f.speed, f.airborne);
}

/** Snapshot the HUD and the test driver read: no functions, just numbers. */
export function hudState(w) {
  const f = w.flight;
  const ring = nextRing(w.course);
  return {
    screen: w.screen,
    score: w.score,
    best: w.best,
    altitude: Math.round(f.y),
    agl: Math.round(heightAboveGround(f)),
    speedKmh: Math.round(f.speed * 3.6),
    heading: Math.round(((f.heading * 180) / Math.PI % 360 + 360) % 360),
    throttle: Math.round(f.throttle * 100),
    fuel: Math.round(w.fuel),
    timeLeft: Math.ceil(w.timeLeft),
    rings: w.course.passedCount,
    ringsTotal: w.course.rings.length,
    ringDistance: ring ? Math.round(Math.hypot(f.x - ring.x, f.y - ring.y, f.z - ring.z)) : 0,
    x: Math.round(f.x),
    y: Math.round(f.y),
    z: Math.round(f.z),
    airborne: f.airborne,
    crashed: f.crashed,
    landed: f.landed,
  };
}
