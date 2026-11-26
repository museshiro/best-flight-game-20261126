# Cendrawasih Ridge Run — Dossier

## What it is

A complete, original flight game for desktop Chrome, served as static files
from `game/` with no network request. A little red prop plane takes off from
a beach runway on a volcano island, flies eight glowing rings in order, and
lands back on the runway. Chase camera, lit instruments, synthesised sound.

## The island (recognisable terrain)

- A volcano with a crater and drifting smoke, jungle hills, an eastern ridge
- Stepped rice terraces on the south slope, a sandy coast and open sea
- A fishing village with red roofs near the runway, pine trees on the hills
- One runway on the beach, with centreline dashes and threshold bars

## Controls

- ↑ / ↓ pitch (climb / descend), ← / → bank and turn
- W / S throttle, Space airbrake, P pause, R restart
- Mouse drag looks around; Enter or click starts
- The title screen lists every control before the first flight

## How to win

- Ring: +100 each, 8 rings in order, guided by the amber arrow and distance
- Safe landing on the runway: +200; all 8 rings + landing: +500 bonus
- Time bonus: +2 per second left on the 3-minute clock when the course is done
- Fuel burns with the throttle — full throttle the whole way runs the tanks dry
- Crashing into terrain or ditching in the sea ends the sortie; the score kept
  is the rings flown so far

## Instruments and HUD

- Top-left: altitude, speed, heading (with compass strip on top-centre)
- Top-right: score, rings flown, countdown clock
- Bottom panel: attitude indicator, altimeter dial, airspeed dial, throttle
  bar, fuel gauge, vertical speed and height above ground
- Centre: next-ring arrow and distance; stall and low-fuel warnings

## Sound

All synthesised with WebAudio — engine hum pitched by throttle, wind by
speed, a two-note chime per ring, a low-altitude / low-fuel alarm, a crash
thud. No audio file is loaded.

## Screenshots

All four are real renders of this game's own code, taken in headless Chrome
from the staged `?shot=` scenes (seed 20261126):

1. `1-flight.jpg` — cover: chase view mid-course, the next ring dead ahead
2. `2-start.jpg` — the title screen on the runway, volcano ahead
3. `3-terrace.jpg` — low over the rice terraces with the village below
4. `4-landing.jpg` — final approach, lined up with the runway

## Source layout

- `game/index.html` — the page
- `game/src/main.js` — boot and the fixed-step loop
- `game/src/config.js` — tuning constants
- `game/src/random.js` — seeded randomness and value noise
- `game/src/terrain.js` — island heights, colours, scenery
- `game/src/flight.js` — arcade flight model
- `game/src/rings.js` — the eight-ring course
- `game/src/world.js` — sortie state: score, fuel, clock, screens
- `game/src/render.js` — perspective projector, plane, instruments, HUD
- `game/src/audio.js` — synthesised sound
- `game/src/input.js` — keyboard and mouse
- `game/src/shots.js` — staged screenshot scenes and autopilot

No library is vendored under `game/`; the only vendored file in the entry is
`vendor/makefun-game.ts`, the kit's dossier library, copied unchanged.
