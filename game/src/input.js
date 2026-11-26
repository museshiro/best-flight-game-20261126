// Cendrawasih Ridge Run — keyboard and mouse.
// One job: turn keys and pointer drags into the control values the flight model
// eats, and report one-shot actions (start, pause, restart) to the game loop.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;

export function createInput(canvas) {
  const keys = new Set();
  const input = {
    keys,
    lookYaw: 0,
    lookPitch: 0,
    dragging: false,
    dragX: 0,
    dragY: 0,
    actions: 0,
    mouse: { x: 0, y: 0, clicked: false },
  };
  const down = (e) => {
    const code = e.code;
    if (code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight' || code === 'Space') {
      e.preventDefault();
    }
    if (e.repeat) return;
    keys.add(code);
    if (code === 'Enter' || code === 'Space') input.actions |= ACTION_CONFIRM;
    if (code === 'KeyP' || code === 'Escape') input.actions |= ACTION_PAUSE;
    if (code === 'KeyR') input.actions |= ACTION_RESTART;
  };
  const up = (e) => keys.delete(e.code);
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('pointerdown', (e) => {
    input.dragging = true;
    input.dragX = e.clientX;
    input.dragY = e.clientY;
    input.mouse.x = e.clientX;
    input.mouse.y = e.clientY;
    input.mouse.clicked = true;
  });
  window.addEventListener('pointermove', (e) => {
    if (!input.dragging) return;
    input.lookYaw = Math.max(-1.1, Math.min(1.1, input.lookYaw + (e.clientX - input.dragX) * 0.0035));
    input.lookPitch = Math.max(-0.5, Math.min(0.5, input.lookPitch + (e.clientY - input.dragY) * 0.0025));
    input.dragX = e.clientX;
    input.dragY = e.clientY;
  });
  window.addEventListener('pointerup', () => { input.dragging = false; });
  return input;
}

/** Read and clear the one-shot actions queued since the last frame. */
export function takeActions(input) {
  const a = input.actions;
  input.actions = 0;
  const clicked = input.mouse.clicked;
  input.mouse.clicked = false;
  return { actions: a, clicked };
}

/**
 * The continuous stick: pitch (-1 down stick = nose up), roll and throttle
 * delta, plus the airbrake. Arrows fly; W/S work the throttle.
 */
export function readControls(input) {
  const k = input.keys;
  const pitch = (k.has('ArrowDown') ? -1 : 0) + (k.has('ArrowUp') ? 1 : 0);
  const roll = (k.has('ArrowLeft') ? -1 : 0) + (k.has('ArrowRight') ? 1 : 0);
  let throttle = 0;
  if (k.has('KeyW') || k.has('ShiftLeft') || k.has('ShiftRight')) throttle += 1;
  if (k.has('KeyS') || k.has('ControlLeft') || k.has('ControlRight')) throttle -= 1;
  return {
    pitch,
    roll,
    throttle,
    brake: k.has('Space'),
  };
}
