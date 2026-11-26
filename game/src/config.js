// Cendrawasih Ridge Run — shared tuning constants.
// One job: every number the flight model, the world and the renderer agree on.
export const STEP = 1 / 60;
export const WORLD = {
  islandRadius: 1950,
  seaFloor: -6,
  volcano: { x: 250, z: -450, height: 880, radius: 1000, crater: 170 },
  runway: { x: 0, zMin: 1300, zMax: 1900, halfWidth: 18, height: 4 },
  village: { x0: 320, x1: 760, z0: 1150, z1: 1520 },
  terrace: { x0: -650, x1: 650, z0: -250, z1: 850 },
};
export const PLANE = {
  minFlySpeed: 20,
  maxSpeed: 78,
  accel: 0.7,
  pitchRate: 0.85,
  pitchMin: -0.38,
  pitchMax: 0.52,
  rollRate: 1.9,
  rollMax: 1.05,
  rollLevelRate: 1.4,
  turnFactor: 0.8,
  takeoffSpeed: 30,
};
export const GAME = {
  timeLimit: 180,
  ringRadius: 26,
  ringScore: 100,
  landingScore: 200,
  completeBonus: 500,
  fuelDrain: 0.5,
  fuelIdle: 0.12,
};
export const SHOT_SEED = 20261126;
