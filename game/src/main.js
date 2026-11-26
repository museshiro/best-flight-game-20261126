// Cendrawasih Ridge Run — boot and the one loop.
// One job: start the sortie, read the stick every frame, advance the world in
// fixed 1/60 s steps, and paint what is there. The game moves between five
// screens: title, play, paused, crashed and done.
//
// ?seed=N fixes the island. ?shot=start|flight|terrace|landing (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot. window.__gameState exposes the HUD
// numbers for play-testing.

import { STEP, SHOT_SEED } from './config.js';
import { createWorld, stepWorld, resetWorld, hudState, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_CRASH, SCREEN_DONE } from './world.js';
import { createRenderer, draw } from './render.js';
import { createInput, takeActions, readControls, ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART } from './input.js';
import { createAudio, startAudio } from './audio.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(SHOT_SEED);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem('cendrawasih-best') ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem('cendrawasih-best', String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts one visit.
  }
}

world.best = readBest();

function runShot(name) {
  const scene = stageShot(name, world, audio);
  let painted = 0;
  function paint() {
    renderer.time += 1 / 30;
    draw(renderer, world, scene.screen, 0, 0);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    resetWorld(world);
    world.best = readBest();
    accumulator = 0;
    screen = SCREEN_PLAY;
    startAudio(audio);
    announce('Flying. Eight rings, then land on the runway.');
  }

  function endTo(screenName) {
    screen = screenName;
    if (world.score > world.best) {
      world.best = world.score;
      saveBest(world.best);
    }
    if (screenName === SCREEN_CRASH) announce(`Crashed. ${world.reason} Score ${world.score}.`);
    else if (screenName === SCREEN_DONE) announce(`Sortie over. Score ${world.score}. Best ${world.best}.`);
  }

  function handleActions() {
    const { actions, clicked } = takeActions(input);
    if (clicked) startAudio(audio);
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE || screen === SCREEN_CRASH || screen === SCREEN_DONE) startGame();
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
      return;
    }
    if ((actions & ACTION_PAUSE) && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if ((actions & ACTION_PAUSE) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
    if (clicked && screen === SCREEN_TITLE) startGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    renderer.time = now / 1000;
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        const before = world.screen;
        stepWorld(world, readControls(input), audio);
        accumulator -= STEP;
        if (world.screen === SCREEN_CRASH) { endTo(SCREEN_CRASH); break; }
        if (world.screen === SCREEN_DONE) { endTo(SCREEN_DONE); break; }
        if (before !== world.screen) break;
      }
    } else {
      accumulator = 0;
    }
    // Keep the renderer's screen in step with the loop's screen.
    world.screen = screen;
    draw(renderer, world, screen, input.lookYaw, input.lookPitch);
    window.__gameState = hudState(world);
  }

  announce('Cendrawasih Ridge Run. Press Enter or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
