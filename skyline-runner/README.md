# Skyline Runner

A browser web-swinging traversal demo built with three.js. It is free-roam only: no
combat and no missions. The point is how movement feels, the sense of speed, and the
scale of a procedurally generated island city. The hero, the city, and every brand and
landmark are original.

## Running it

Open `index.html` in a desktop browser (Chrome or Edge recommended). There is no
build step, no server and no network access. three.js r170 is vendored as a classic
script in `lib/three.min.js` (MIT, see `tools/make-three-global.mjs`), so opening the
file from disk works. A static server (`python3 -m http.server`) also works.

Click to start: that captures the mouse and enables audio.

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move | WASD | Left stick |
| Camera | Mouse | Right stick |
| Web swing (hold) | Left mouse | R2 |
| Zip to point, then point-launch | Hold right mouse + left click; jump on arrival | L2 + R2, then A |
| Jump / wall-jump | Space | A |
| Dive / drop (hold) | Ctrl or C | B |
| Sprint | Shift | L3 |
| Switch suit | Tab | Y |
| Respawn on the spire | R | – |
| Debug overlay / tuning panel | F3 / F4 | – |

## What's in it

- **World** (`layout.js`, `city.js`): a 1.5 × 4 km island on a strict grid (30 m
  avenues, 18 m streets, 80 × 250 m blocks). A diagonal boulevard carves out
  **Lumen Square** (red pedestrian plaza, stacked animated billboards, a scrolling LED
  news ticker) and the **Fountain Triangle** (fountain, radiating paths, café tables,
  crowd). There is a 766 × 300 m park with a pond, a stone wall and 1,900 trees, rivers
  on both sides with piers and a riverside highway, three suspension bridges, and a
  mainland skyline.
  - Height zoning: glass and art-deco towers of 150–450 m at midtown and the downtown
    tip, a 512 m supertall with a spire (where you start), and 30–80 m brick and
    limestone walk-ups in between.
  - Rooftops have parapets, water towers, HVAC units, bulkheads, skylights, solar arrays
    and billboard frames. Streets have autumn trees, shops with made-up signs,
    crosswalks, lane markings, signals and street furniture.
- **Movement** (`player.js`): Grounded, Airborne, Swinging, WallRunning, Perched and
  Zipping. The pendulum swing has an 85% rope pull-in, a +8 m/s low-point boost, ±35°
  plane steering, street clearance over traffic, and a +6 m/s release boost. There are
  also dives (75 m/s), wall runs with ledge vaults, zip-to-point with point-launch, and
  super-hero landings.
- **Camera** (`camera.js`, `post.js`): speed FOV (75°→95°), roll along the swing arc,
  radial blur and speed lines above 30 m/s, top-down dive framing, a 1.2 m street-level
  camera, collision that never clips into buildings, and foliage that fades between the
  camera and the hero.
- **Hero** (`hero.js`): a primitive-built rig with procedural, speed-driven poses, arm
  IK to the web anchor, and two suits (Ember and Nocturne) with a shimmer swap.
- **Traffic and crowds** (`traffic.js`): about 4,200 vehicles that follow lanes, keep
  gaps and stop at phased signals; about 3,600 pedestrians.
- **HUD** (`hud.js`): a rotating minimap, compass strip, altitude bar and waypoints,
  bottom-right only.
- **Audio** (`audio.js`): fully procedural Web Audio with HRTF-panned world sounds.
- **Lighting** (`sky.js`): afternoon sun with shadows that follow the hero, cumulus
  clouds, blue-grey haze, and reflections captured from the city.

## Tuning

Every movement tunable is in `SR.TUNING` (`src/config.js`), the equivalent of a single
data asset. F4 opens a live panel; changes persist in `localStorage` and can be copied
as JSON. F3 shows state, speed, rope length, anchor point, fps, draw calls and
triangles.

## Scripted tests

Open the browser console:

```js
SR.tests.cross()          // hold forward + tap swing on rhythm, north → south
SR.tests.diveToSwing()    // spire dive into a swing, reports speed carried
SR.tests.anchorAudit()    // every fired anchor must lie on real geometry
SR.tests.cameraAudit()    // camera must never end up inside a building
```

`PLAYTEST.md` has the notes and numbers from each build step.

## Differences from the original brief

The brief targeted Unreal Engine 5. This is a three.js port, so the engine features map
as follows:

- Nanite and HLOD: merged geometry per 500 m chunk, low-poly twins and distance-bucketed
  instancing for trees, water towers and facade detail, and distance culling for street
  furniture.
- Lumen: an image-based-lighting cube map captured from the generated city, plus
  street-canyon darkening.
- World Partition: not needed at this scale. The whole island stays resident (about
  300–370 draw calls and about 1.6–1.8 M triangles per frame, shadows included).
- Dynamic resolution (60–100%) keeps the frame rate up on slower GPUs.

The 60 fps / RTX 3070 target could not be measured in this environment, which only has
software rendering.
