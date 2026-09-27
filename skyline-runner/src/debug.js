// Debug overlay (F3): state, speed, rope length, anchor point.
// Tuning panel (F4): edits SR.TUNING live, persisted in localStorage.
// Autopilot tests (SR.tests.*) drive the real player code with scripted input.
(function () {
  const STORE = 'skyline-runner.tuning';

  function loadTuning() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (saved) for (const k in saved) if (k in SR.TUNING_DEFAULTS && typeof saved[k] === 'number') SR.TUNING[k] = saved[k];
    } catch (e) { /* storage unavailable */ }
  }
  function saveTuning() {
    try { localStorage.setItem(STORE, JSON.stringify(SR.TUNING)); } catch (e) { /* ignore */ }
  }

  class Debug {
    constructor(game) {
      this.game = game;
      loadTuning();
      this.overlay = document.createElement('pre');
      this.overlay.id = 'debug-overlay';
      this.overlay.hidden = true;
      document.body.appendChild(this.overlay);
      this.panel = null;
      this.fps = 60; this.acc = 0;
    }

    toggleOverlay() { this.overlay.hidden = !this.overlay.hidden; }

    togglePanel() {
      if (!this.panel) this.buildPanel();
      this.panel.hidden = !this.panel.hidden;
      if (!this.panel.hidden && document.pointerLockElement) document.exitPointerLock();
    }

    buildPanel() {
      const p = document.createElement('div');
      p.id = 'tuning-panel';
      p.innerHTML = '<h3>Tuning (SR.TUNING)</h3><div class="row"><button data-a="reset">Reset</button><button data-a="copy">Copy JSON</button><button data-a="close">Close</button></div>';
      const list = document.createElement('div');
      for (const k of Object.keys(SR.TUNING_DEFAULTS)) {
        const row = document.createElement('label');
        row.innerHTML = `<span>${k}</span>`;
        const inp = document.createElement('input');
        inp.type = 'number'; inp.step = 'any'; inp.value = SR.TUNING[k]; inp.dataset.k = k;
        inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (isFinite(v)) { SR.TUNING[k] = v; saveTuning(); } });
        inp.addEventListener('keydown', (e) => e.stopPropagation());
        row.appendChild(inp);
        list.appendChild(row);
      }
      p.appendChild(list);
      p.addEventListener('click', (e) => {
        const a = e.target.dataset && e.target.dataset.a;
        if (a === 'reset') {
          Object.assign(SR.TUNING, SR.TUNING_DEFAULTS); saveTuning();
          for (const i of p.querySelectorAll('input')) i.value = SR.TUNING[i.dataset.k];
        } else if (a === 'copy') {
          const txt = JSON.stringify(SR.TUNING, null, 2);
          if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
          console.log(txt);
        } else if (a === 'close') p.hidden = true;
      });
      p.addEventListener('mousedown', (e) => e.stopPropagation());
      document.body.appendChild(p);
      this.panel = p;
    }

    update(dt) {
      this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
      if (this.overlay.hidden) return;
      this.acc += dt;
      if (this.acc < 0.1) return;
      this.acc = 0;
      const g = this.game, p = g.player, S = SR.Player.S;
      const f = (v) => v.toFixed(1);
      const rope = p.state === S.SWINGING ? `${f(p.ropeLen)} m (start ${f(p.ropeLen0)}, max ${f(p.ropeMax)})` : '-';
      const anc = p.state === S.SWINGING || p.state === S.ZIPPING ? `${f(p.anchor.x)}, ${f(p.anchor.y)}, ${f(p.anchor.z)}` : '-';
      const info = g.renderer.info;
      this.overlay.textContent =
        `state     ${p.state}${p.diving ? ' (dive)' : ''}\n` +
        `speed     ${f(p.speed)} m/s  (horiz ${f(Math.hypot(p.vel.x, p.vel.z))}, vert ${f(p.vel.y)})\n` +
        `rope      ${rope}\n` +
        `anchor    ${anc}\n` +
        `position  ${f(p.pos.x)}, ${f(p.pos.y)}, ${f(p.pos.z)}  alt ${f(p.feetY)} m\n` +
        `fps       ${f(this.fps)}   draw calls ${info.render.calls}   tris ${(info.render.triangles / 1000).toFixed(0)}k\n` +
        `F3 overlay · F4 tuning · R respawn on spire`;
    }
  }

  // ------------------------------------------------------------------ autopilot tests
  // Runs the simulation without rendering, using a fixed 60 Hz step.
  function simulate(game, seconds, bot) {
    const dt = 1 / 60, steps = Math.round(seconds / dt);
    const input = game.input;
    input.virtual = {};
    for (let i = 0; i < steps; i++) {
      const stop = bot(input.virtual, i * dt);
      game.update(dt, true);
      if (stop) break;
    }
    input.virtual = null;
  }

  // Hold forward, tap swing on rhythm, and cross the island north → south along an avenue.
  function cross(opts) {
    opts = opts || {};
    const game = SR.game, p = game.player, S = SR.Player.S;
    const ax = opts.avenue != null ? opts.avenue : SR.WORLD.avenueXs[1];
    const z0 = -SR.WORLD.islandHalfZ + 40, z1 = SR.WORLD.islandHalfZ - 40;
    p.pos.set(ax, 45, z0); p.vel.set(0, 0, 20); p.setState(S.AIRBORNE);
    game.cam.yaw = Math.PI; game.cam.pitch = -0.1;
    p.groundTouches = 0;
    let t = 0, maxSpeed = 0, lastRelease = -1, swings = 0, done = false, dist = 0, sampleSum = 0, samples = 0;
    let minY = Infinity;
    const trace = [];
    simulate(game, opts.limit || 200, (v, time) => {
      t = time;
      game.cam.yaw = Math.PI;
      v.my = 1;
      // A player keeps the avenue centred with small stick corrections.
      const off = p.pos.x - ax;
      v.mx = Math.max(-1, Math.min(1, off * 0.08 + p.vel.x * 0.08));
      if (p.state === S.SWINGING) {
        const sp = p.speed;
        const releaseNow = (p.passedLow && p.vel.y > sp * (opts.releaseAngle || 0.3)) || p.swingTime > 3.5;
        v.swing = !releaseNow;
        if (releaseNow) lastRelease = time;
      } else if (p.state === S.AIRBORNE) {
        v.swing = !v.swing && p.vel.y < -1 && time - lastRelease > 0.15;
        if (v.swing) swings++;
      } else {
        v.swing = !v.swing; v.jump = false;
      }
      maxSpeed = Math.max(maxSpeed, p.speed);
      sampleSum += p.speed; samples++;
      minY = Math.min(minY, p.feetY);
      if (opts.trace && Math.floor(time * 2) !== Math.floor((time - 1 / 60) * 2)) trace.push(`${time.toFixed(1)} ${p.state} spd=${p.speed.toFixed(1)} pos=${p.pos.x.toFixed(0)},${p.feetY.toFixed(0)},${p.pos.z.toFixed(0)} rope=${p.ropeLen.toFixed(0)}`);
      if (p.pos.z >= z1) { done = true; return true; }
      return false;
    });
    return { reached: done, seconds: +t.toFixed(1), groundTouches: p.groundTouches, swings, maxSpeed: +maxSpeed.toFixed(1),
      avgSpeed: +(sampleSum / samples).toFixed(1), minFeetHeight: +minY.toFixed(1), end: [p.pos.x.toFixed(0), p.pos.y.toFixed(0), p.pos.z.toFixed(0)], trace };
  }

  // Signature move: drop off the supertall spire, dive, pull into a swing along an avenue.
  function diveToSwing() {
    const game = SR.game, p = game.player, S = SR.Player.S;
    game.spawn();
    game.cam.yaw = Math.PI; game.cam.pitch = -0.3;
    const log = [];
    let phase = 'perch', swingAt = -1, peakDive = 0, speedAtSwing = 0, minAfter = Infinity, maxAfter = 0, lastRelease = -1;
    simulate(game, 30, (v, time) => {
      game.cam.yaw = Math.PI;
      v.my = phase === 'swing' ? 1 : 0.4;
      v.dive = phase === 'perch' || phase === 'dive';
      if (phase === 'perch' && p.state === S.AIRBORNE) phase = 'dive';
      if (phase === 'dive') {
        peakDive = Math.max(peakDive, p.speed);
        if (p.feetY < 330 && time > 1) {
          v.swing = true; v.dive = false;
          if (p.state === S.SWINGING) { phase = 'swing'; swingAt = time; speedAtSwing = p.speed; }
          else v.swing = (Math.floor(time * 60) % 2) === 0;
        }
      } else if (phase === 'swing') {
        if (p.state === S.SWINGING) {
          const rel = (p.passedLow && p.vel.y > p.speed * 0.3) || p.swingTime > 3.5;
          v.swing = !rel; if (rel) lastRelease = time;
        } else if (p.state === S.AIRBORNE) v.swing = !v.swing && p.vel.y < -1 && time - lastRelease > 0.15;
        if (time - swingAt < 2) { minAfter = Math.min(minAfter, p.speed); maxAfter = Math.max(maxAfter, p.speed); }
        if (time - swingAt > 6) return true;
      }
      if (Math.floor(time * 4) !== Math.floor((time - 1 / 60) * 4)) log.push(`${time.toFixed(2)} ${p.state} spd=${p.speed.toFixed(1)} y=${p.feetY.toFixed(0)}`);
      return false;
    });
    return { peakDiveSpeed: +peakDive.toFixed(1), speedAtSwing: +speedAtSwing.toFixed(1), minSpeedFirst2s: +minAfter.toFixed(1),
      maxSpeedFirst2s: +maxAfter.toFixed(1), groundTouches: p.groundTouches, log };
  }

  // Fire the swing search from many random street/air positions and verify every anchor
  // lies on real geometry (never in empty sky).
  function anchorAudit(n) {
    const game = SR.game, p = game.player, col = game.world.col, rnd = SR.util.rng(7);
    let fired = 0, bad = 0, none = 0;
    const cam = { fwd: new THREE.Vector3(0, 0, 1), pos: new THREE.Vector3(), yaw: Math.PI };
    for (let i = 0; i < (n || 500); i++) {
      p.pos.set(rnd.range(-700, 700), rnd.range(2, 120), rnd.range(-1950, 1950));
      if (col.pointInside(p.pos.x, p.pos.y, p.pos.z, 0.5)) continue;
      const a = rnd() * 6.28;
      p.vel.set(Math.sin(a) * 20, -5, Math.cos(a) * 20);
      p.camFwdH = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      p.wish = new THREE.Vector3();
      const h = p.findAnchor(cam);
      if (!h) { none++; continue; }
      fired++;
      if (!col.pointInside(h.x - h.nx * 0.01, h.y - h.ny * 0.01, h.z - h.nz * 0.01, 0.02, SR.Collision.SOLID | SR.Collision.ANCHOR)) bad++;
    }
    return { fired, noAnchor: none, anchorsNotOnGeometry: bad };
  }

  // Run scripted traversal with the full camera update and check that the camera never
  // ends up inside a building.
  function cameraAudit() {
    const game = SR.game, p = game.player, S = SR.Player.S, col = game.world.col;
    let frames = 0, inside = 0, minClear = Infinity;
    const perRun = [];
    const check = () => {
      frames++;
      const c = game.camera.position;
      if (col.pointInside(c.x, c.y, c.z, 0)) { inside++; perRun[perRun.length - 1]++; }
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const h = col.raycast(c.x, c.y, c.z, ax, 0, az, 5, SR.Collision.SOLID, {});
        if (h) minClear = Math.min(minClear, h.t);
      }
    };
    const run = (secs, bot) => {
      perRun.push(0);
      const input = game.input; input.virtual = {};
      for (let i = 0; i < secs * 60; i++) { bot(input.virtual, i / 60); game.update(1 / 60, false); check(); }
      input.virtual = null;
    };
    // 1) swinging down an avenue with the camera auto-following
    p.pos.set(-310, 45, -1900); p.vel.set(0, 0, 30); p.setState(S.AIRBORNE); game.cam.yaw = Math.PI; game.cam.snap();
    let lr = -1;
    run(40, (v, t) => {
      v.my = 1; v.mx = Math.max(-1, Math.min(1, (p.pos.x + 310) * 0.08 + p.vel.x * 0.08));
      if (p.state === S.SWINGING) { const r = (p.passedLow && p.vel.y > p.speed * 0.2) || p.swingTime > 3.5; v.swing = !r; if (r) lr = t; }
      else v.swing = !v.swing && p.vel.y < -1 && t - lr > 0.15;
    });
    // 2) run into a facade and wall-run up it, camera sweeping round
    p.pos.set(-310, 0.9, -1500); p.vel.set(0, 0, 0); p.setState(S.GROUNDED);
    run(12, (v, t) => { v.mx = t < 6 ? 1 : 0; v.my = t < 6 ? 0.2 : 1; v.sprint = true; game.cam.yaw += 0.01; });
    // 3) spin the camera around the hero standing in a narrow gap between buildings
    const b = game.world.layout.buildings.find((q) => Math.abs(q.x1 + 330) < 0.5 && q.h > 40);
    p.pos.set(b.x1 + 0.6, 0.9, (b.z0 + b.z1) / 2); p.vel.set(0, 0, 0); p.setState(S.GROUNDED);
    run(8, (v, t) => { game.cam.yaw += 0.05; game.cam.pitch = Math.sin(t) * 0.8; game.cam.updateFwd(); });
    return { frames, framesInsideGeometry: inside, perScenario: perRun, minWallClearance: +minClear.toFixed(2) };
  }

  SR.Debug = Debug;
  SR.tests = { cross, diveToSwing, anchorAudit, cameraAudit, simulate };
})();
