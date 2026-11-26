[![Make the best flight game](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/museshiro/best-flight-game-20261126/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/museshiro/best-flight-game-20261126/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

# Cendrawasih Ridge Run

A complete little flight game that plays offline in a desktop browser from
static files. Fly a red prop plane — the *Cendrawasih* — off a beach runway,
through eight glowing rings over a volcano island, and land back home before
the fuel or the clock runs out.

[Play it in the make.fun bounty — Make the best flight game](https://make.fun/bounty/best-flight-game-20261126-0057)

## The island

One recognisable island, drawn by hand-rolled 3D projection on a 2D canvas:
a smoking volcano with a crater, jungle hills, stepped rice terraces on the
south slope, a sandy coast, a fishing village with red roofs, and a single
runway on the beach. No library, no network request, no external asset —
every pixel is computed from the game's own code.

## How to fly

| Key | Does |
| --- | --- |
| ↑ / ↓ | Pitch — climb and descend |
| ← / → | Bank — turn the nose |
| W / S | Throttle up and down |
| Space | Airbrake |
| P | Pause |
| R | Restart the sortie |
| Mouse drag | Look around |
| Enter / click | Start |

## How to win

Take off, fly all eight rings in order (each is worth 100 points), then land
on the runway: a safe landing is worth 200, and finishing the course before
landing adds a 500-point bonus plus 2 points per second left on the clock.
Mind the fuel gauge — full throttle burns it fast — and mind the ridge:
hitting the terrain or ditching in the sea ends the sortie.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to the output directory and writes `dossier.json` with the vendored
`vendor/makefun-game.ts` library.

## Files

- `game/index.html` — the page; `game/src/main.js` boots the loop
- `game/src/config.js` — tuning constants
- `game/src/random.js` — seeded randomness and value noise
- `game/src/terrain.js` — the island: heights, colours, scenery
- `game/src/flight.js` — the arcade flight model
- `game/src/rings.js` — the eight-ring course
- `game/src/world.js` — the sortie: score, fuel, clock, screens
- `game/src/render.js` — the 3D projector, the plane, the instruments, the HUD
- `game/src/audio.js` — synthesised engine, wind, chimes and alarms
- `game/src/input.js` — keyboard and mouse
- `game/src/shots.js` — the staged screenshot scenes and their autopilot
- `screenshots/` — four real renders of the game, taken in headless Chrome

## License

MIT — see [LICENSE](LICENSE).
