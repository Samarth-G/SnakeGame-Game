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
