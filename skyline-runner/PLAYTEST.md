# Skyline Runner – playtest notes

One short note per build step. Playtests were run in headless Chromium (SwiftShader)
with scripted input plus screenshots, so frame-rate numbers are software-rendering
numbers, not GPU numbers.

## Step 1 – Greybox grid city
- Grid city generates in well under a second: ~2,900 buildings, ~3,350 collision boxes,
  ~13,000 perch points (roof corners and spires).
- Top-down view reads right: 5 avenues, 41 cross streets, park in the north-centre
  column, tower clusters at midtown and at the downtown tip, piers on the west shore.
- Opens from `file://` with no server; three.js is vendored as a classic script.
- Free-fly camera only (WASD + mouse, Shift = fast); there is no player yet.

## Step 2 – Movement states and swing physics
Scripted tests live in `SR.tests` (see `src/debug.js`) and run the real player code with
virtual input at a fixed 60 Hz.
- **Swing-to-swing crossing** (`SR.tests.cross`: hold forward, tap swing on rhythm,
  release just past the low point): 79–82 s north → south on four of the five avenues,
  **zero ground touches**, average speed about 50 m/s, peaks about 60 m/s. Releasing late
  (steep) costs speed (84–124 s), which is intended: rhythm matters.
- The avenue beside the park (x = −30) still touches the ground once. The park has
  nothing to anchor to until trees arrive in step 4.
- **Dive → swing** (`SR.tests.diveToSwing`): drop off the spire at 512 m, dive peaks at
  81 m/s, the first swing catches at 62 m/s and bleeds down to about 50 m/s over 3 s
  without a jerk.
- **Anchor audit** (`SR.tests.anchorAudit`): 0 of 154 fired anchors were off geometry.
  With nothing in range, no line fires.
- Problems found and fixed during tuning:
  - A pure pendulum on a side anchor dragged the hero into the facades of a 30 m
    avenue. The physics now uses a pivot pulled toward the travel line
    (`swingPivotLateral`), while the web is still drawn to the real facade point.
  - The rope was secretly slack and then snapped taut, losing about 10 m/s per swing. It
    now reels in its slack and never pays out, so arcs stay continuous.
  - The hard 45 m/s cap swallowed the +8 m/s low-point boost. It is now a soft cap
    (`swingOverspeedDecay`), and the rope pull stops adding speed near top speed, so
    energy can't pump up without limit.
  - Grazing a facade mid-swing started a wall run that killed speed. A wall run now needs
    a real into-wall component (`wallRunMinInto`).
  - Dropping off the spire landed you back on the spire. Dropping now steps clear first.
- The camera is a placeholder orbit; the hero is a capsule.

## Step 3 – Camera
- The chase camera auto-aligns to velocity above 14 m/s after 0.8 s without mouse input.
  FOV eases from 75° at rest to 95° at 45 m/s. Radial blur and speed lines fade in from
  30 m/s. Roll follows the rope (up to 12°).
- Dive framing works: after about 4 s of diving off the spire the camera sits up and
  behind and looks almost straight down between towers at the grid. This is the best
  shot in the build so far.
- **Camera audit** (`SR.tests.cameraAudit`): 3,600 frames of avenue swinging, a wall run,
  and a forced 360° spin against a facade. 0 frames with the camera inside geometry, and
  the closest wall stayed 0.45 m from the lens.
- The first radial blur banded visibly (8 even taps). Taps are now dithered and the
  strength halved. Blur still reads as slight grain in software rendering.
- The camera drops to 1.2 m at street level and relaxes back when you speed up. Hard
  landings shake the camera.

## Step 4 – Procedural buildings and districts
- Facades are modular and procedural, with no image files. There are four archetypes
  (brick, limestone, glass curtain wall, art-deco setbacks) plus a storefront band with
  lit display windows and made-up shop signs. Per-building tints keep neighbours distinct.
- Rooftops: parapets (vaultable colliders), cornices, bulkheads, water towers, HVAC,
  skylights, solar arrays and billboard frames on residential roofs. Towers get
  mechanical penthouses and antennas. Water towers, antennas, billboards and lamp arms
  are perch targets.
- Street level: sidewalks with curbs, double-yellow centre lines, lane dashes, zebra
  crosswalks, stop lines, lane arrows, autumn street trees, lamps, signal mast arms,
  hydrants, bins, news boxes and bike racks.
- Park (766 × 300 m): paths, pond, stone wall and 1,900 trees. Trees over 15 m are web
  anchors. Swinging through the park on trees alone: 3 runs, 8–9 swings each, all on
  trees, 0 ground touches.
- Lumen Square (red pedestrian plaza, 21 animated billboards, scrolling LED ticker,
  ticket kiosk) and Fountain Triangle (grass triangle, fountain, radiating paths, café
  tables) are carved out of the grid where the boulevard crosses avenues.
- Waterfront: promenades with railings and sea wall, riverside highway with barrier,
  piers with sheds, three suspension bridges, and a low-rise mainland skyline.
- Regressions found and fixed:
  - Rooftop props gave sideways anchors that dragged the swing up to 50 m off the
    avenue. The pendulum pivot is now clamped to 5 m off the travel line
    (`swingPivotMaxLateral`).
  - Lumen Square left a 350 m stretch with no facades in range and caused a ground
    touch. The clearing is narrower, and the relaxed anchor pass searches wider sideways.
- Crossing test after the fixes: 15 runs (5 avenues × 3 release timings), 74–82 s,
  **0 ground touches**. Anchor audit: 0 of 171 off geometry. Camera audit: 0 frames
  inside geometry.
- Not fixed yet: from the spire the frame is 490 draw calls and 2.9 M triangles. That is
  for the performance pass. Foliage looks washed out until the lighting pass.

## Step 5 – Traffic and pedestrians
- 4,177 vehicles (taxis, sedans, vans, box trucks, buses) on 4-lane avenues, 2-lane
  streets and the 6-lane riverside highway. They follow lanes, keep a gap to the car
  ahead and stop at signals. Signals run a 24 s cycle with a green wave up each avenue,
  and the lamps on the mast arms change colour.
- About 3,600 pedestrians walk sidewalk loops, crowd the Fountain Triangle and
  Lumen Square, and walk park paths. Leg and arm swing runs in the vertex shader.
- Only what is near the camera is drawn (cars within 1.1 km, pedestrians within
  380 m). Simulating everything costs 0.63 ms per frame (headless Chromium, CPU).
- Red-light check over 90 s of simulation: 15,376 stop-line crossings. The first version
  ran about 10% of reds, because cars committed on yellow without being able to clear the
  line. Cars now only continue if they clear before red: 39 of 15,376 (0.25%), all edge
  cases at lane wrap-around.
- Cars near the hero are dynamic colliders flagged "vault": running into one rolls you
  over it. Cars also brake for a hero standing in their lane.

## Step 6 – Hero, animation and suit swap
- The hero is original: an athletic masked figure (1.8 m) built from primitives, with
  a lathe torso and a textured chest emblem. **Suit A "Ember"** is signal orange with
  slate accents and a skyline-kite chest emblem. **Suit B "Nocturne"** is gloss black
  with a large white shard emblem across chest and back. Tab / Y swaps instantly with a
  shimmer: emissive flash, a rising ring and a tinted screen flash.
- Every pose is procedural, driven by state and speed: idle breathing, run/sprint cycles
  (stride and lean scale with speed, banking into turns), jump, fall, glide (limbs spread
  when falling forward fast), head-down dive with arms swept back, swing (body hangs
  along the web, legs tuck at the bottom of the arc), release flip, wall run
  (perpendicular to the facade), vault, zip, perch crouch, roll and the one-knee
  super-hero landing.
- The web arm is solved with IK toward the anchor every frame, and the web line leaves
  from that hand.
- Screenshots of idle, sprint, swing, spire perch (Nocturne), hard landing and dive all
  read correctly. At full dive speed the radial blur smeared the whole frame, so its
  strength is halved again.

## Step 7 – HUD
- Bottom-right only. Minimap (180 × 130 px, bracket frame): blocks #9DB4F0, streets
  #10205A, the park slightly lighter, the boulevard cut through the grid, and bridges.
  The map rotates with the camera, and the gold arrow stays centred and shows facing.
- Compass strip: a tick every 15°, N/E/S/W letters with the faced cardinal in orange,
  and a yellow heading triangle on the left edge. A thin orange altitude bar runs down
  the right edge (full at 520 m). Red waypoints mark points of interest and clamp to the
  map edge when off-screen.
- Mid-swing down an avenue the map reads at a glance. From the spire the diagonal street
  grid shows the heading clearly.
- Allowed world highlight: a small white diamond previews where the next web would
  attach, and a gold ring marks the zip target while aiming. There is no crosshair or
  health bar. The debug overlay (F3) and tuning panel (F4) are off by default.

## Step 8 – Audio
- All sound is synthesised with Web Audio at runtime, with no files. The audio context
  starts on the "click to play" gesture.
- Hero sounds: web thwip (noise burst plus a falling chirp), splat at the anchor
  (spatial), rope creak whose rate and level follow line tension, release whoosh scaled
  by speed, a jump puff, soft landing taps, a heavy thud with sub rumble for super-hero
  landings, a zip whir, a launch whoosh and a suit-swap chime.
- World: a traffic rumble bed that fades with altitude and ducks under the wind; wind
  that gets louder and brighter with speed; crowd murmur at Lumen Square and the
  Fountain Triangle; horns from actual nearby cars; distant sirens (wail or yelp) that
  drift along the street grid. Positioned sounds use HRTF panners with inverse-distance
  roll-off, and the listener follows the camera.
- Measured on the master bus in headless Chromium: standing at street level 0.029 RMS,
  at 56 m/s 0.069 RMS (wind rising was too subtle at first, so it was boosted), and a
  hard landing peaks at 0.36 RMS. Nothing clips thanks to the bus compressor. Tone has
  only been checked by numbers, not by ear.

## Step 9 – Lighting and visual polish
- Clear afternoon: the sky dome has a sun glow and disc, 16 cumulus clouds, and
  blue-grey exponential haze, so the far skyline and mainland fade into it.
- The sun (south-west, 38° elevation) casts PCF soft shadows. The shadow frustum follows
  the hero, grows with altitude (90 m → 420 m radius) and snaps to texels so it doesn't
  shimmer. From the dive camera, tower shadows fall across the avenues.
- Image-based lighting comes from a cube map of the real city captured high above the
  park. The first capture, beside dark midtown towers, made every glass tower read black.
  Glass is now less metallic with sharp reflections, so it catches sky at grazing angles
  and shows its blue-grey panels head-on.
- Street canyons darken toward the ground (a cheap AO/GI stand-in on facades). The river
  has an animated procedural normal map with a sun glint. A final grade adds a little
  saturation and a warm afternoon tint before ACES tone mapping.
- Autumn foliage looked pastel under the old flat lighting. It now reads orange, amber
  and yellow with some green.
