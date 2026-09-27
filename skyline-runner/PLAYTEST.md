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
