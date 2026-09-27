// Skyline Runner – single source of truth for tunables.
// Everything movement-related lives in SR.TUNING (the "data asset"); it is read
// every frame, so the in-game tuning panel (F4) changes behaviour live.
window.SR = window.SR || {};

SR.TUNING_DEFAULTS = {
  // --- Global air physics -------------------------------------------------
  gravity: 20,               // m/s², heavier than real for snappy arcs
  airControl: 0.3,           // fraction of ground acceleration available in the air
  terminalSpeed: 60,         // m/s, max falling speed
  diveTerminalSpeed: 75,     // m/s, max falling speed while diving
  diveGravityScale: 1.25,    // extra pull while diving so dives build speed quickly
  airDrag: 0.004,            // quadratic drag coefficient above swingMaxSpeed

  // --- Ground ---------------------------------------------------------------
  runSpeed: 8,
  sprintSpeed: 12,
  jumpSpeed: 6,
  groundAccel: 40,           // m/s²
  groundBrake: 30,           // m/s², deceleration when carrying extra speed
  stepUpHeight: 1.4,         // obstacles lower than this are vaulted automatically
  hardLandingSpeed: 24,      // vertical impact speed that triggers a super-hero landing
  rollLandingSpeed: 16,      // horizontal speed above which a hard landing becomes a roll
  hardLandingLock: 0.45,     // s of lost control after a super-hero landing

  // --- Web swing: anchor search ---------------------------------------------
  anchorMinDist: 20,         // m ahead (horizontal)
  anchorMaxDist: 60,
  anchorIdealDist: 26,
  anchorMinUp: 15,           // m above the player
  anchorMaxUp: 40,
  anchorIdealUp: 32,
  anchorSideMax: 40,         // m of lateral offset searched on each side
  anchorRelaxFactor: 1.6,    // if nothing is found, search again with ranges scaled by this
  anchorMinUpRelaxed: 6,     // …but never closer than this above the player
  maxRopeLength: 85,

  // --- Web swing: physics ------------------------------------------------------
  swingPullFraction: 0.85,   // rope shortens to this fraction of its length…
  swingPullTime: 0.3,        // …over this many seconds
  swingLowPointBoost: 8,     // m/s added along the tangent at the bottom of the arc
  swingBoostWindow: 0.25,    // s over which the low-point boost is applied
  swingSteerMaxAngle: 35,    // degrees the swing plane can be bent by the stick
  swingSteerRate: 110,       // degrees/s of plane rotation at full stick
  swingPumpAccel: 3,         // m/s² along velocity while holding forward
  swingMaxSpeed: 45,         // m/s, soft cap while swinging
  swingOverspeedDecay: 6,    // m/s² bleed-off above swingMaxSpeed (grows with the overshoot)
  swingEntrySpeedKeep: 0.97, // fraction of speed kept when the rope snaps taut
  carRoofHeight: 2.2,        // m, typical roof of traffic below
  swingGroundClearance: 3,   // m above car roofs for the lowest point of the arc
  releaseBoost: 6,           // m/s upward on release after the low point
  webSlackTime: 0.2,         // s the web stays visible (slack) after release
  swingMinTime: 0.18,        // s, very short taps still give a small swing
  swingPivotLateral: 0.3,    // fraction of the anchor's sideways offset used by the pendulum
                             // (the web is drawn to the real anchor; the physics pivot sits
                             // closer to the travel line so side anchors don't yank you into walls)
  wallRunMinInto: 0.45,      // fraction of speed that must point into a facade to start a wall run

  // --- Wall run ---------------------------------------------------------------
  wallRunMinSpeed: 5,
  wallRunUpSpeed: 14,
  wallRunSideSpeed: 16,
  wallRunAccel: 60,
  wallJumpPush: 12,
  wallJumpUp: 7,
  wallSlideGravity: 3,       // gentle slide when no stick input
  ledgeVaultUp: 5,

  // --- Perch / point-launch ----------------------------------------------------
  zipSpeed: 40,
  zipRange: 140,
  zipAimAngle: 9,            // degrees from screen centre to accept a perch target
  launchSpeed: 25,
  launchAngle: 38,           // degrees above horizontal
  launchWindow: 0.3,         // s around arrival in which jump triggers a point-launch

  // --- Camera -------------------------------------------------------------------
  camDistance: 4,
  camHeight: 1,
  camFastDistance: 5.5,
  fovMin: 75,
  fovMax: 95,
  camRollMax: 12,
  speedFxStart: 30,          // m/s where motion blur / speed lines kick in
  streetCamHeight: 1.2,      // camera height above ground at street level
  camAutoAlignSpeed: 14,     // m/s above which the camera follows velocity
  camAutoAlignDelay: 0.8,    // s after manual look before auto-align resumes
  diveCamPitch: 62,          // degrees of downward look during dives
  mouseSensitivity: 0.0022,
  padLookSpeed: 2.8,
};

// Live copy that the game reads; the tuning panel mutates this.
SR.TUNING = Object.assign({}, SR.TUNING_DEFAULTS);

// World layout constants (not runtime-tunable: they change the generated city).
SR.WORLD = {
  seed: 1729,
  islandHalfX: 760,          // island spans x ∈ [-760, 760]  (1.52 km, east = +x)
  islandHalfZ: 2000,         // and z ∈ [-2000, 2000]          (4 km, north = -z)
  avenueXs: [-590, -310, -30, 300, 580],
  avenueW: 30,
  streetW: 18,
  streetPitch: 98,           // 80 m blocks + 18 m street
  firstStreetZ: -1960,
  streetCount: 41,
  sidewalk: 5,
  highwayInner: 705,         // riverside highway from |x|=705 to 745
  highwayOuter: 745,
  waterY: -2,
  park: { x0: -15, x1: 285, z0: -1265, z1: -499 },
  // Diagonal boulevard runs from the north-west to the south-east.
  boulevard: { x0: -640, z0: -2000, x1: 560, z1: 2000, w: 26 },
  supertall: { x: 135, z: -343, height: 468, spire: 44 },
  eastMainlandX: 1650,
  westMainlandX: -1850,
};
