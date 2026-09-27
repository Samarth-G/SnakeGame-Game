// The movement system. States: Grounded, Airborne, Swinging, WallRunning, Perched, Zipping.
// Every number comes from SR.TUNING so it can be tuned live.
(function () {
  const U = SR.util, C = SR.Collision, V3 = THREE.Vector3;
  const S = { GROUNDED: 'Grounded', AIRBORNE: 'Airborne', SWINGING: 'Swinging', WALLRUN: 'WallRunning', PERCHED: 'Perched', ZIPPING: 'Zipping' };
  const UP = new V3(0, 1, 0);
  const R = 0.4, HS = 0.5, CENTER = R + HS; // capsule: radius 0.4, 1.8 m tall, pos = centre

  const _a = new V3(), _b = new V3(), _c = new V3(), _q = new THREE.Quaternion();

  class Player {
    constructor(world) {
      this.world = world;
      this.col = world.col;
      this.pos = new V3();
      this.vel = new V3();
      this.state = S.AIRBORNE;
      this.stateTime = 0;
      this.time = 0;
      this.facing = new V3(0, 0, 1);
      this.diving = false;
      this.sprinting = false;
      this.contacts = [];
      this.events = [];
      // swing
      this.anchor = new V3();   // where the web is attached (drawn)
      this.pivot = new V3();    // pendulum pivot used by the physics
      this.anchorN = new V3();
      this.hasAnchor = false;
      this.ropeLen = 0; this.ropeLen0 = 0; this.ropeMax = 0;
      this.swingTime = 0; this.boostLeft = 0; this.boostDone = false; this.passedLow = false;
      this.steerAngle = 0; this.swingSide = 1; this.releaseQueued = false;
      this.webSlack = 0;
      this.webFrom = new V3();
      // wall
      this.wall = { nx: 0, nz: 0, box: null };
      this.wallCooldown = 0; this.wallBox = null;
      // perch / zip
      this.perch = null; this.zipTarget = null; this.aimTarget = null;
      this.arriveTime = -10; this.jumpBufferedAt = -10;
      // misc
      this.landLock = 0; this.airTime = 0; this.peakFall = 0; this.diveLatchUntil = 0; this.tension = 0;
      this.anim = { flip: 0, land: 0, roll: 0, vault: 0, launch: 0 };
      this.groundTouches = 0;
      this.lastSafe = new V3();
    }

    get speed() { return this.vel.length(); }
    get feetY() { return this.pos.y - CENTER; }

    setState(s) {
      if (this.state === s) return;
      this.prevState = this.state;
      this.state = s;
      this.stateTime = 0;
      if (s !== S.AIRBORNE) this.diving = false;
      if (s === S.GROUNDED) this.groundTouches++;
    }

    emit(type, data) { this.events.push(Object.assign({ type }, data || {})); }

    spawnPerched(x, y, z, faceX, faceZ) {
      this.pos.set(x, y + CENTER, z);
      this.vel.set(0, 0, 0);
      this.facing.set(faceX, 0, faceZ).normalize();
      this.perch = { x, y, z, kind: 'spire' };
      this.setState(S.PERCHED);
      this.arriveTime = -10;
    }

    // ---------------------------------------------------------------- frame update
    update(dt, inp, cam) {
      const T = SR.TUNING;
      this.time += dt;
      this.stateTime += dt;
      this.wallCooldown = Math.max(0, this.wallCooldown - dt);
      this.landLock = Math.max(0, this.landLock - dt);
      this.webSlack = Math.max(0, this.webSlack - dt);
      for (const k in this.anim) this.anim[k] = Math.max(0, this.anim[k] - dt);

      // Camera-relative stick direction on the ground plane.
      const fwd = _a.set(cam.fwd.x, 0, cam.fwd.z);
      if (fwd.lengthSq() < 1e-6) fwd.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
      fwd.normalize();
      this.camFwdH = this.camFwdH || new V3(); this.camFwdH.copy(fwd);
      this.wish = this.wish || new V3();
      this.wish.set(-fwd.z * inp.move.x + fwd.x * inp.move.y, 0, fwd.x * inp.move.x + fwd.z * inp.move.y);
      this.inp = inp;
      this.sprinting = inp.held.sprint || (this.state === S.GROUNDED && Math.hypot(this.vel.x, this.vel.z) > T.runSpeed + 0.5);

      this.updateAim(inp, cam);
      this.handleButtons(inp, cam);

      // Integrate with enough sub-steps that we never move more than ~0.3 m per step.
      const n = U.clamp(Math.ceil(this.speed * dt / 0.3), 1, 12);
      const h = dt / n;
      for (let i = 0; i < n; i++) this.step(h);

      // Facing follows travel.
      const vh = Math.hypot(this.vel.x, this.vel.z);
      if (this.state === S.PERCHED) this.facing.lerp(this.camFwdH, 1 - Math.exp(-8 * dt)).normalize();
      else if (this.state === S.WALLRUN) this.facing.set(-this.wall.nx, 0, -this.wall.nz);
      else if (vh > 0.6) {
        _b.set(this.vel.x / vh, 0, this.vel.z / vh);
        this.facing.lerp(_b, 1 - Math.exp(-(this.state === S.GROUNDED ? 14 : 6) * dt)).normalize();
      }
      if (this.state === S.AIRBORNE) { this.airTime += dt; this.peakFall = Math.max(this.peakFall, -this.vel.y); }
      if (this.state === S.GROUNDED || this.state === S.PERCHED) this.lastSafe.copy(this.pos);
    }

    handleButtons(inp, cam) {
      const T = SR.TUNING, p = inp.pressed, st = this.state;

      if (p.swing && inp.held.aim) {
        if (this.aimTarget && st !== S.ZIPPING) this.startZip(this.aimTarget);
      } else if (p.swing && st !== S.SWINGING && st !== S.ZIPPING) {
        this.tryStartSwing(cam);
      }
      if (st === S.SWINGING && (inp.released.swing || !inp.held.swing)) this.releaseQueued = true;
      if (this.state === S.SWINGING && this.releaseQueued && this.swingTime >= T.swingMinTime) this.release(true);

      if (p.jump) {
        switch (this.state) {
          case S.GROUNDED:
            if (this.landLock <= 0) { this.vel.y = T.jumpSpeed; this.setState(S.AIRBORNE); this.emit('jump'); }
            break;
          case S.WALLRUN: this.wallJump(); break;
          case S.PERCHED:
            if (this.time - this.arriveTime <= T.launchWindow) this.pointLaunch();
            else {
              this.vel.copy(this.camFwdH).multiplyScalar(5); this.vel.y = T.jumpSpeed * 1.1;
              this.perch = null; this.setState(S.AIRBORNE); this.emit('jump');
            }
            break;
          case S.ZIPPING: this.jumpBufferedAt = this.time; break;
          case S.SWINGING: this.release(true); break;
          case S.AIRBORNE:
            if (inp.move.y < -0.5) this.startDive();
            break;
        }
      }
      if (p.dive) {
        switch (this.state) {
          case S.AIRBORNE: this.startDive(); break;
          case S.SWINGING: this.release(false); this.startDive(); break;
          case S.PERCHED:
            // Step off the perch (clear of the spire/ledge) and go head-first.
            this.vel.copy(this.camFwdH).multiplyScalar(7); this.vel.y = 2.5;
            this.pos.addScaledVector(this.camFwdH, 1.2);
            this.perch = null; this.setState(S.AIRBORNE); this.startDive(); break;
          case S.WALLRUN:
            this.vel.set(this.wall.nx * 3, this.vel.y, this.wall.nz * 3);
            this.wallCooldown = 0.4; this.setState(S.AIRBORNE); break;
        }
      }
      if (!this.diving && this.state === S.AIRBORNE && inp.held.dive) this.startDive();
      if (this.diving && !inp.held.dive && !(inp.move.y < -0.3) && this.time > this.diveLatchUntil) this.diving = false;
    }

    startDive() {
      if (this.state !== S.AIRBORNE) return;
      if (!this.diving) this.emit('dive');
      this.diving = true;
      this.diveLatchUntil = this.time + 0.35;
    }

    // ------------------------------------------------------------------- physics
    step(h) {
      switch (this.state) {
        case S.GROUNDED: this.stepGrounded(h); break;
        case S.AIRBORNE: this.stepAir(h); break;
        case S.SWINGING: this.stepSwing(h); break;
        case S.WALLRUN: this.stepWall(h); break;
        case S.PERCHED: this.stepPerch(h); break;
        case S.ZIPPING: this.stepZip(h); break;
      }
      if (this.pos.y < SR.WORLD.waterY + 0.4 && this.world.baseGround(this.pos.x, this.pos.z) === -Infinity) this.splash();
    }

    stepGrounded(h) {
      const T = SR.TUNING, v = this.vel;
      const target = this.landLock > 0 ? 0 : (this.sprinting || this.inp.held.sprint ? T.sprintSpeed : T.runSpeed);
      const tx = this.wish.x * target, tz = this.wish.z * target;
      const cur = Math.hypot(v.x, v.z), tgt = Math.hypot(tx, tz);
      const acc = (tgt >= cur - 0.01 ? T.groundAccel : T.groundBrake) * h;
      let dx = tx - v.x, dz = tz - v.z;
      const dl = Math.hypot(dx, dz);
      if (dl > acc) { dx *= acc / dl; dz *= acc / dl; }
      v.x += dx; v.z += dz; v.y = 0;
      this.pos.x += v.x * h; this.pos.z += v.z * h;
      this.collide(h);
      if (this.state !== S.GROUNDED) return;
      // Stick to the ground, or walk off the edge.
      const g = this.col.groundAt(this.pos.x, this.pos.z, this.feetY + 0.3, R * 0.8);
      if (this.feetY - g < 0.4 && g > -Infinity) this.pos.y = g + CENTER;
      else { this.setState(S.AIRBORNE); this.airTime = 0; this.peakFall = 0; }
    }

    stepAir(h) {
      const T = SR.TUNING, v = this.vel;
      v.y -= T.gravity * (this.diving ? T.diveGravityScale : 1) * h;
      const term = this.diving ? T.diveTerminalSpeed : T.terminalSpeed;
      if (v.y < -term) v.y = U.damp(v.y, -term, 4, h);
      // ~30% air steering: can redirect, but not gain horizontal speed beyond max(current, run).
      const hs0 = Math.hypot(v.x, v.z);
      let wx = this.wish.x, wz = this.wish.z;
      if (this.diving) { const d = wx * v.x + wz * v.z; if (d < 0 && hs0 > 0.1) { wx -= v.x * d / (hs0 * hs0); wz -= v.z * d / (hs0 * hs0); } }
      const a = T.groundAccel * T.airControl * h;
      v.x += wx * a; v.z += wz * a;
      const hs1 = Math.hypot(v.x, v.z), lim = Math.max(hs0, T.runSpeed);
      if (hs1 > lim) { v.x *= lim / hs1; v.z *= lim / hs1; }
      const sp = v.length();
      if (sp > T.swingMaxSpeed && !this.diving) v.multiplyScalar(1 - Math.min(0.5, T.airDrag * (sp - T.swingMaxSpeed) * h));
      this.pos.addScaledVector(v, h);
      this.collide(h);
    }

    stepSwing(h) {
      const T = SR.TUNING, v = this.vel, A = this.pivot, p = this.pos;
      this.swingTime += h;
      v.y -= T.gravity * h;

      // Rope length: powered pull-in to 85% over the first 0.3 s, never lower than the
      // street clearance allows.
      const k = Math.min(1, this.swingTime / T.swingPullTime);
      const prevLen = this.ropeLen;
      const target = Math.min(this.ropeLen0 * (1 - (1 - T.swingPullFraction) * k), this.ropeMax);
      this.ropeLen = Math.min(prevLen, Math.max(target, prevLen - 30 * h)); // reel in ≤30 m/s, never pay out
      const pullRate = Math.max(0, (prevLen - this.ropeLen) / h);

      _a.subVectors(p, A); // anchor -> player
      const dist = _a.length();
      const rhat = _a.multiplyScalar(1 / Math.max(dist, 1e-4));
      const below = A.y - p.y;

      // Steering: rotate velocity about the rope, bending the swing plane up to ±35°.
      const steer = this.inp.move.x;
      if (Math.abs(steer) > 0.05) {
        const maxA = T.swingSteerMaxAngle * U.DEG;
        // rhat points from the anchor down to the player, so +angle turns right.
        let dA = steer * T.swingSteerRate * U.DEG * h;
        const na = U.clamp(this.steerAngle + dA, -maxA, maxA);
        dA = na - this.steerAngle; this.steerAngle = na;
        _q.setFromAxisAngle(rhat, dA); v.applyQuaternion(_q);
      } else this.steerAngle *= Math.exp(-1.5 * h); // plane slowly relaxes so you can steer again
      // Pump while holding forward.
      if (this.inp.move.y > 0.1 && below > 0) { const s = v.length(); if (s > 1) v.addScaledVector(v, T.swingPumpAccel * this.inp.move.y * h / s); }

      // Low-point boost: +8 m/s along the tangent, spread over a short window.
      const cosA = below / Math.max(dist, 1e-4);
      if (!this.boostDone && cosA > 0.93 && this.swingTime > 0.1) { this.boostDone = true; this.boostLeft = T.swingLowPointBoost; this.emit('lowpoint'); }
      if (this.boostLeft > 0) {
        const add = Math.min(this.boostLeft, T.swingLowPointBoost / T.swingBoostWindow * h);
        const s = v.length(); if (s > 0.5) v.addScaledVector(v, add / s);
        this.boostLeft -= add;
      }
      // "Past the low point": moving away from the anchor horizontally, or climbing.
      const horizAway = (p.x - A.x) * v.x + (p.z - A.z) * v.z;
      if (below > 0 && (horizAway > 0 && cosA > 0.5 || (v.y > 0 && this.boostDone))) this.passedLow = true;

      // Soft speed cap: anything above swingMaxSpeed (low-point boosts, dive entries) bleeds
      // off at swingOverspeedDecay instead of being clipped, so boosts are felt but the
      // sustained swing speed settles around the top speed.
      const sp = v.length();
      if (sp > T.swingMaxSpeed) v.multiplyScalar(Math.max(T.swingMaxSpeed, sp - T.swingOverspeedDecay * h * (1 + (sp - T.swingMaxSpeed) / 6)) / sp);

      p.addScaledVector(v, h);

      // Inextensible rope (only resists stretching).
      _a.subVectors(p, A);
      const d2 = _a.length();
      if (d2 > this.ropeLen) {
        _a.multiplyScalar(1 / d2);
        p.copy(A).addScaledVector(_a, this.ropeLen);
        const vr = v.dot(_a);
        // The powered pull adds inward speed when slow; near top speed it only shortens
        // the line, so repeated swings can't pump energy without limit.
        const vt = Math.sqrt(Math.max(0, v.lengthSq() - vr * vr));
        const want = -pullRate * U.clamp((T.swingMaxSpeed - vt) / 12, 0, 1);
        if (vr > want) v.addScaledVector(_a, want - vr);
        this.tension = Math.min(1, (vr > 0 ? vr : 0) / 10 + v.lengthSq() / Math.max(this.ropeLen, 5) / 60);
      } else {
        // Slack line reels in so the swing never jerks when it goes taut again.
        this.ropeLen = Math.max(d2, 4);
        this.tension = 0;
      }

      this.collide(h);
      if (this.state !== S.SWINGING) return;
      // Rising above the anchor slackens the line: let go automatically.
      if (p.y > A.y - 0.5) this.release(true);
    }

    stepWall(h) {
      const T = SR.TUNING, v = this.vel, w = this.wall, b = w.box, p = this.pos;
      const nx = w.nx, nz = w.nz, tx = -nz, tz = nx;
      const into = -(this.wish.x * nx + this.wish.z * nz);
      const lat = this.wish.x * tx + this.wish.z * tz;
      let dvx, dvy, dvz;
      if (Math.hypot(this.wish.x, this.wish.z) > 0.15) {
        if (into < -0.6) { this.detachWall(2); return; }
        const up = Math.max(0, into), ll = Math.hypot(up, lat) || 1;
        const s = Math.min(1, Math.hypot(up, lat));
        dvy = up / ll * T.wallRunUpSpeed * s;
        dvx = tx * lat / ll * T.wallRunSideSpeed * s; dvz = tz * lat / ll * T.wallRunSideSpeed * s;
      } else { dvx = 0; dvz = 0; dvy = -T.wallSlideGravity; }
      const a = T.wallRunAccel * h;
      v.x = U.clamp(dvx, v.x - a, v.x + a); v.y = U.clamp(dvy, v.y - a, v.y + a); v.z = U.clamp(dvz, v.z - a, v.z + a);
      p.addScaledVector(v, h);
      // Stay glued to the facade plane.
      if (Math.abs(nx) > 0.5) p.x = (nx > 0 ? b.x1 : b.x0) + nx * (R + 0.02);
      else p.z = (nz > 0 ? b.z1 : b.z0) + nz * (R + 0.02);
      // Reached the top edge: vault onto the roof.
      if (p.y - HS > b.y1 - 0.3) {
        p.y = b.y1 + CENTER + 0.05;
        p.x -= nx * 1.2; p.z -= nz * 1.2;
        v.set(-nx * 5 + tx * lat * 6, T.ledgeVaultUp, -nz * 5 + tz * lat * 6);
        this.anim.vault = 0.45;
        this.emit('vault');
        this.setState(S.AIRBORNE);
        return;
      }
      // Ran past the side of the facade.
      const along = Math.abs(nx) > 0.5 ? p.z : p.x;
      const lo = Math.abs(nx) > 0.5 ? b.z0 : b.x0, hi = Math.abs(nx) > 0.5 ? b.z1 : b.x1;
      if (along < lo - 0.2 || along > hi + 0.2) { this.detachWall(0); return; }
      this.collide(h);
      if (this.state !== S.WALLRUN) return;
      if (this.feetY <= this.col.groundAt(p.x, p.z, this.feetY + 0.2) + 0.05 && v.y <= 0) {
        this.pos.y = this.col.groundAt(p.x, p.z, this.feetY + 0.2) + CENTER;
        this.setState(S.GROUNDED);
      }
    }

    stepPerch(h) {
      const q = this.perch;
      if (q) this.pos.set(q.x, q.y + CENTER, q.z);
      this.vel.set(0, 0, 0);
      if (Math.hypot(this.inp.move.x, this.inp.move.y) > 0.6 && this.stateTime > 0.35) {
        this.vel.set(this.wish.x * 4, 2.5, this.wish.z * 4);
        this.perch = null;
        this.setState(S.AIRBORNE);
      }
    }

    stepZip(h) {
      const T = SR.TUNING, t = this.zipTarget, p = this.pos;
      _a.set(t.x - p.x, t.y + CENTER - p.y, t.z - p.z);
      const d = _a.length(), s = T.zipSpeed * h;
      if (d <= s + 0.05) {
        p.set(t.x, t.y + CENTER, t.z);
        this.perch = t; this.zipTarget = null;
        this.vel.set(0, 0, 0);
        this.arriveTime = this.time;
        this.setState(S.PERCHED);
        this.emit('perch');
        if (this.time - this.jumpBufferedAt <= T.launchWindow) this.pointLaunch();
        return;
      }
      this.vel.copy(_a).multiplyScalar(T.zipSpeed / d);
      p.addScaledVector(this.vel, h);
    }

    // ------------------------------------------------------------ collision response
    collide(h) {
      const T = SR.TUNING;
      const before = _c.copy(this.pos);
      const cs = this.col.resolveCapsule(this.pos, R, HS, this.contacts);
      let landed = false, ceiling = false;
      // Island terrain (street level / piers) is not a box: clamp against it directly.
      const g0 = this.world.baseGround(this.pos.x, this.pos.z);
      if (this.feetY < g0) { this.pos.y = g0 + CENTER; landed = true; }
      for (const c of cs) {
        const b = c.box;
        if (c.ny > 0.6) { landed = true; continue; }
        if (c.ny < -0.6) { ceiling = true; continue; }
        const feet = this.feetY;
        const rise = b.y1 - feet;
        // Low obstacle (parapet, HVAC, car, railing): vault over it automatically.
        if (this.state !== S.WALLRUN && this.state !== S.ZIPPING && rise > 0 && (rise <= T.stepUpHeight || (b.flags & C.VAULT))) {
          this.pos.x = before.x; this.pos.z = before.z;
          this.pos.y = b.y1 + CENTER + 0.02;
          if (this.vel.y < 0) this.vel.y = 0;
          if (rise > 0.5 && this.anim.vault <= 0) { this.anim.vault = 0.35; this.emit('vault'); }
          if (this.state === S.GROUNDED || this.state === S.AIRBORNE) { this.setState(S.GROUNDED); }
          continue;
        }
        // Tall wall: start a wall run if fast enough, otherwise slide along it.
        const wn = Math.abs(c.nx) >= Math.abs(c.nz) ? { nx: Math.sign(c.nx), nz: 0 } : { nx: 0, nz: Math.sign(c.nz) };
        const sp = this.vel.length();
        const intoWall = -(this.vel.x * wn.nx + this.vel.z * wn.nz);
        if ((this.state === S.AIRBORNE || this.state === S.SWINGING || this.state === S.GROUNDED) &&
            sp > T.wallRunMinSpeed && rise > 2.5 && b.y1 - b.y0 > 3 && (b.flags & C.ANCHOR) &&
            (this.wallCooldown <= 0 || b !== this.wallBox) && intoWall > T.wallRunMinInto * sp &&
            (this.state !== S.SWINGING || this.swingTime > 0.25)) {
          this.startWallRun(wn.nx, wn.nz, b);
          return;
        }
        const vn = this.vel.x * c.nx + this.vel.y * c.ny + this.vel.z * c.nz;
        if (vn < 0) { this.vel.x -= vn * c.nx; this.vel.y -= vn * c.ny; this.vel.z -= vn * c.nz; }
      }
      if (ceiling && this.vel.y > 0) this.vel.y = 0;
      if (landed && (this.state === S.AIRBORNE || this.state === S.WALLRUN) && this.vel.y <= 0.5) this.land();
      else if (landed && this.state === S.SWINGING && this.vel.y < 0) this.vel.y = 0;
    }

    land() {
      const T = SR.TUNING;
      const impact = Math.max(-this.vel.y, this.peakFall * 0.0);
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (impact > T.hardLandingSpeed) {
        if (hs > T.rollLandingSpeed) {
          this.anim.roll = 0.55; this.emit('roll', { impact });
          this.vel.x *= 0.8; this.vel.z *= 0.8;
        } else {
          this.anim.land = 0.7; this.landLock = T.hardLandingLock;
          this.vel.x *= 0.15; this.vel.z *= 0.15;
          this.emit('hardland', { impact });
        }
      } else this.emit('land', { impact });
      this.vel.y = 0;
      this.setState(S.GROUNDED);
      this.airTime = 0; this.peakFall = 0;
    }

    splash() {
      this.emit('splash', { x: this.pos.x, z: this.pos.z });
      const W = SR.WORLD;
      this.pos.set(U.clamp(this.pos.x, -W.islandHalfX + 6, W.islandHalfX - 6), CENTER, U.clamp(this.pos.z, -W.islandHalfZ + 6, W.islandHalfZ - 6));
      this.vel.set(0, 0, 0);
      this.setState(S.GROUNDED);
    }

    // ----------------------------------------------------------------- web swing
    // Cone search forward/up for a building surface to anchor to. Returns null when
    // nothing is in range: the web never attaches to empty sky.
    findAnchor(cam, relaxedAllowed) {
      const T = SR.TUNING, p = this.pos;
      const vh = Math.hypot(this.vel.x, this.vel.z);
      const f = vh > 3 ? _b.set(this.vel.x / vh, 0, this.vel.z / vh) : _b.copy(this.camFwdH);
      if (vh <= 3 && Math.hypot(this.wish.x, this.wish.z) > 0.3) f.set(this.wish.x, 0, this.wish.z).normalize();
      const fx = f.x, fz = f.z, rx = -fz, rz = fx;
      const oy = p.y + 0.5;
      let best = null;
      const hit = this._hit || (this._hit = {});
      const passes = relaxedAllowed === false ? 1 : 2;
      for (let pass = 0; pass < passes && !best; pass++) {
        const sc = pass === 0 ? 1 : T.anchorRelaxFactor;
        const minD = T.anchorMinDist / sc, maxD = T.anchorMaxDist * sc;
        const minU = pass === 0 ? T.anchorMinUp : T.anchorMinUpRelaxed, maxU = T.anchorMaxUp * sc;
        let bestScore = -Infinity;
        for (let di = 0; di < 6; di++) {
          const fd = minD + (maxD - minD) * di / 5;
          for (let ui = 0; ui < 4; ui++) {
            const up = minU + (maxU - minU) * ui / 3;
            const ls = pass === 0 ? 1 : T.anchorRelaxFactor;
            for (const lat0 of [0, 14, -14, 28, -28, T.anchorSideMax, -T.anchorSideMax]) {
              const lat = lat0 * ls;
              const dx = fx * fd + rx * lat, dy = up, dz = fz * fd + rz * lat;
              const len = Math.hypot(dx, dy, dz);
              const h = this.col.raycast(p.x, oy, p.z, dx / len, dy / len, dz / len, len * 1.4, C.ANCHOR, hit);
              if (!h || h.ny > 0.5) continue;
              const hu = h.y - p.y, hf = (h.x - p.x) * fx + (h.z - p.z) * fz, hl = (h.x - p.x) * rx + (h.z - p.z) * rz;
              if (hu < minU || hu > maxU * 1.15 || hf < minD * 0.5 || hf > maxD * 1.2) continue;
              const rope = Math.hypot(h.x - p.x, h.y - p.y, h.z - p.z);
              if (rope > T.maxRopeLength) continue;
              const side = Math.sign(hl) || 1;
              let score = -Math.abs(hf - T.anchorIdealDist) / 25 - Math.abs(hu - T.anchorIdealUp) / 18;
              if (side !== this.swingSide) score -= 0.35;          // alternate left/right
              if (Math.abs(hl) < 6) score -= 0.25;                 // prefer buildings to the side
              if (pass === 1) score -= 1;
              if (score > bestScore) {
                bestScore = score;
                best = best || {};
                Object.assign(best, { x: h.x, y: h.y, z: h.z, nx: h.nx, ny: h.ny, nz: h.nz, side, lat: hl, rx, rz, tree: !!(h.box.flags & C.TREE) });
              }
            }
          }
        }
      }
      return best;
    }

    tryStartSwing(cam) {
      const T = SR.TUNING;
      const a = this.findAnchor(cam);
      if (!a) { this.emit('nofire'); return false; }
      this.anchor.set(a.x, a.y, a.z);
      this.anchorN.set(a.nx, a.ny, a.nz);
      const keepLat = U.clamp(a.lat * T.swingPivotLateral, -T.swingPivotMaxLateral, T.swingPivotMaxLateral), shift = a.lat - keepLat;
      this.pivot.set(a.x - a.rx * shift, a.y, a.z - a.rz * shift);
      this.swingSide = -a.side;
      const p = this.pos, v = this.vel;
      if (this.state === S.GROUNDED) { p.y += 0.3; v.y = Math.max(v.y, 7); }
      if (this.state === S.PERCHED) { v.y = Math.max(v.y, 3); this.perch = null; }
      _a.subVectors(p, this.pivot);
      const dist = _a.length();
      this.ropeLen0 = this.ropeLen = dist;
      // Street clearance: the lowest point of the arc stays ~3 m above car roofs.
      const gx = a.x + a.nx * 1.5, gz = a.z + a.nz * 1.5;
      const g = Math.max(0, this.col.groundAt(gx, gz, a.y - 2));
      this.ropeMax = Math.max(6, a.y - (g + T.carRoofHeight + T.swingGroundClearance + CENTER * 0.6));
      // Keep speed through the attach. Moving away from the anchor (falling in a dive), the
      // line snaps taut and that momentum is redirected along the arc: this is what turns a
      // dive into forward speed. Moving towards it, the line starts slack and reels in, so the
      // arc picks up smoothly at the closest approach.
      _a.multiplyScalar(1 / dist);
      const sp = v.length(), vr = v.dot(_a);
      if (vr > 0 && sp > 1) {
        v.addScaledVector(_a, -vr);
        if (v.lengthSq() < 1) v.copy(this.facing).addScaledVector(_a, -this.facing.dot(_a));
        v.setLength(sp * T.swingEntrySpeedKeep);
      }
      this.swingTime = 0; this.boostLeft = 0; this.boostDone = false; this.passedLow = false;
      this.steerAngle = 0; this.releaseQueued = false; this.tension = 0;
      this.hasAnchor = true;
      this.setState(S.SWINGING);
      this.emit('thwip', { x: a.x, y: a.y, z: a.z, nx: a.nx, ny: a.ny, nz: a.nz });
      return true;
    }

    release(boost) {
      const T = SR.TUNING;
      if (this.state !== S.SWINGING) return;
      if (boost && this.passedLow) this.vel.y += T.releaseBoost;
      this.webSlack = T.webSlackTime;
      this.anim.flip = this.passedLow && this.vel.length() > 15 ? 0.6 : 0;
      this.releaseQueued = false;
      this.hasAnchor = false;
      this.setState(S.AIRBORNE);
      this.airTime = 0; this.peakFall = 0;
      this.emit('release', { speed: this.vel.length() });
    }

    // ------------------------------------------------------------------ wall run
    startWallRun(nx, nz, box) {
      this.wall.nx = nx; this.wall.nz = nz; this.wall.box = box;
      this.wallBox = box;
      if (this.state === S.SWINGING) { this.hasAnchor = false; this.webSlack = SR.TUNING.webSlackTime; }
      // Convert momentum: speed into the wall becomes upward speed.
      const into = Math.max(0, -(this.vel.x * nx + this.vel.z * nz));
      this.vel.y = Math.max(this.vel.y, into * 0.6);
      this.vel.x -= nx * -into; this.vel.z -= nz * -into;
      this.setState(S.WALLRUN);
      this.emit('wallrun');
    }

    detachWall(push) {
      this.vel.x += this.wall.nx * push; this.vel.z += this.wall.nz * push;
      this.wallCooldown = 0.35;
      this.setState(S.AIRBORNE);
    }

    wallJump() {
      const T = SR.TUNING, w = this.wall;
      const tx = -w.nz, tz = w.nx;
      const lat = this.vel.x * tx + this.vel.z * tz;
      this.vel.set(w.nx * T.wallJumpPush + tx * lat, T.wallJumpUp + Math.max(0, this.vel.y) * 0.5, w.nz * T.wallJumpPush + tz * lat);
      this.wallCooldown = 0.35;
      this.anim.flip = 0.5;
      this.setState(S.AIRBORNE);
      this.emit('walljump');
    }

    // ---------------------------------------------------------- perch / launch
    updateAim(inp, cam) {
      this.aimTarget = null;
      if (!inp.held.aim || this.state === S.ZIPPING) return;
      const T = SR.TUNING, list = this.world.perchesNear(this.pos.x, this.pos.z, T.zipRange, this._pl || (this._pl = []));
      const cosMax = Math.cos(T.zipAimAngle * U.DEG);
      const cands = [];
      for (const q of list) {
        const dx = q.x - cam.pos.x, dy = q.y - cam.pos.y, dz = q.z - cam.pos.z;
        const dl = Math.hypot(dx, dy, dz);
        const pd = Math.hypot(q.x - this.pos.x, q.y - this.feetY, q.z - this.pos.z);
        if (pd < 3 || pd > T.zipRange) continue;
        const vf = cam.viewDir || cam.fwd;
        const c = (dx * vf.x + dy * vf.y + dz * vf.z) / dl;
        if (c > cosMax) cands.push({ q, c });
      }
      cands.sort((a, b) => b.c - a.c);
      const hit = this._hit2 || (this._hit2 = {});
      for (let i = 0; i < Math.min(6, cands.length); i++) {
        const q = cands[i].q;
        const ox = this.pos.x, oy = this.pos.y + 0.4, oz = this.pos.z;
        const tx = q.x - ox, ty = q.y + 0.6 - oy, tz = q.z - oz, tl = Math.hypot(tx, ty, tz);
        const h = this.col.raycast(ox, oy, oz, tx / tl, ty / tl, tz / tl, tl - 1.2, C.SOLID, hit);
        if (!h) { this.aimTarget = q; return; }
      }
    }

    startZip(q) {
      this.zipTarget = q; this.perch = null;
      this.hasAnchor = false;
      this.anchor.set(q.x, q.y + 0.3, q.z);
      this.jumpBufferedAt = -10;
      this.setState(S.ZIPPING);
      this.emit('zip', { x: q.x, y: q.y, z: q.z });
    }

    pointLaunch() {
      const T = SR.TUNING, a = T.launchAngle * U.DEG;
      this.vel.copy(this.camFwdH).multiplyScalar(Math.cos(a) * T.launchSpeed);
      this.vel.y = Math.sin(a) * T.launchSpeed;
      this.perch = null;
      this.anim.launch = 0.6; this.anim.flip = 0.6;
      this.setState(S.AIRBORNE);
      this.emit('launch');
    }
  }

  Player.S = S;
  Player.CENTER = CENTER;
  Player.RADIUS = R;
  SR.Player = Player;
})();
