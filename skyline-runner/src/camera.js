// Third-person chase camera. Reacts to speed (FOV, distance, roll, shake), frames dives
// from above, drops to street height on the ground and never ends up inside geometry.
(function () {
  const U = SR.util, C = SR.Collision, V3 = THREE.Vector3;
  const _d = new V3(), _p = new V3(), _t = new V3(), _r = new V3(), _u = new V3();

  class CameraRig {
    constructor(camera, world) {
      this.camera = camera;
      this.col = world.col;
      this.yaw = Math.PI; this.pitch = -0.2;
      this.fwd = new V3(0, 0, 1);         // orbit direction (yaw/pitch)
      this.viewDir = new V3(0, 0, 1);     // actual view direction (for aiming)
      this.pos = camera.position;
      this.manualT = 10;
      this.dist = 4; this.roll = 0; this.fov = 75; this.shake = 0;
      this.dive = 0; this.street = 0; this.speedFx = 0;
      this.pivot = new V3();
      this.hit = {};
      this.time = 0;
    }

    look(inp, dt) {
      const dx = inp.mouseLook.x + inp.look.x * dt, dy = inp.mouseLook.y + inp.look.y * dt;
      if (Math.abs(dx) + Math.abs(dy) > 1e-5) this.manualT = 0;
      this.yaw -= dx;
      this.pitch = U.clamp(this.pitch - dy, -1.45, 1.1);
      this.updateFwd();
    }

    updateFwd() {
      this.fwd.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    }

    addShake(a) { this.shake = Math.min(1.2, this.shake + a); }

    snap() { this.snapNext = true; }

    update(dt, player) {
      const T = SR.TUNING, S = SR.Player.S, p = player.pos, v = player.vel;
      this.time += dt;
      this.manualT += dt;
      const speed = v.length(), hs = Math.hypot(v.x, v.z);

      // --- auto-align to velocity when moving fast --------------------------------------
      const diving = player.diving || (player.state === S.AIRBORNE && v.y < -32);
      this.dive = U.damp(this.dive, diving ? 1 : 0, 2.5, dt);
      if (hs > T.camAutoAlignSpeed && this.manualT > T.camAutoAlignDelay && player.state !== S.WALLRUN) {
        const vyaw = Math.atan2(-v.x, -v.z);
        const k = U.smoothstep(T.camAutoAlignSpeed, 40, hs) * 2.2;
        this.yaw = U.dampAngle(this.yaw, vyaw, k, dt);
        const basePitch = player.state === S.SWINGING ? -0.14 : U.clamp(Math.atan2(v.y, hs) * 0.35 - 0.12, -0.5, 0.2);
        this.pitch = U.damp(this.pitch, U.lerp(basePitch, -T.diveCamPitch * U.DEG, this.dive), 1.6, dt);
      } else if (this.dive > 0.05 && this.manualT > T.camAutoAlignDelay) {
        this.pitch = U.damp(this.pitch, -T.diveCamPitch * U.DEG, 2.2 * this.dive, dt);
      }
      this.updateFwd();

      // --- pivot: lowered at street level so the city feels tall -------------------------
      const onStreet = (player.state === S.GROUNDED && player.feetY < 2.5) ? 1 : 0;
      this.street = U.damp(this.street, onStreet * (1 - U.smoothstep(10, 20, hs)), 3, dt);
      const pivotUp = U.lerp(T.camHeight, T.streetCamHeight - SR.Player.CENTER, this.street) + this.dive * 2.5;
      this.pivot.set(p.x, p.y + pivotUp, p.z);

      // --- distance -----------------------------------------------------------------------
      const want = U.lerp(T.camDistance, T.camFastDistance, U.smoothstep(10, 45, speed)) + this.dive * 2.5;
      _d.copy(this.fwd).negate();
      // collision: pull in immediately, ease back out
      const h = this.col.raycast(this.pivot.x, this.pivot.y, this.pivot.z, _d.x, _d.y, _d.z, want + 0.6, C.SOLID, this.hit);
      let allowed = want;
      if (h) allowed = Math.max(0.6, h.t - 0.55);
      if (this.snapNext || allowed < this.dist) this.dist = allowed; else this.dist = U.damp(this.dist, allowed, 3, dt);
      this.snapNext = false;
      _p.copy(this.pivot).addScaledVector(_d, this.dist);

      const g = this.col.groundAt(_p.x, _p.z, _p.y + 0.5);
      if (g > -Infinity && _p.y < g + 0.35) _p.y = g + 0.35;
      if (this.col.pointInside(_p.x, _p.y, _p.z, 0.1)) _p.copy(this.pivot); // last resort

      // --- shake ------------------------------------------------------------------------------
      this.shake = Math.max(0, this.shake - dt * 1.8);
      const fast = U.smoothstep(40, 70, speed) * 0.25;
      const sa = this.shake * this.shake * 0.35 + fast * 0.03;
      if (sa > 0) {
        const t = this.time * 38;
        _p.x += Math.sin(t * 1.3) * sa; _p.y += Math.sin(t * 1.7 + 1) * sa; _p.z += Math.cos(t * 1.1) * sa;
      }
      // Keep the near plane out of walls: push away from anything within 0.45 m.
      for (const [ax, ay, az] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
        const hh = this.col.raycast(_p.x, _p.y, _p.z, ax, ay, az, 0.45, C.SOLID, this.hit);
        if (hh) { _p.x -= ax * (0.45 - hh.t); _p.y -= ay * (0.45 - hh.t); _p.z -= az * (0.45 - hh.t); }
      }
      if (this.col.pointInside(_p.x, _p.y, _p.z, 0.1)) _p.copy(this.pivot);
      this.camera.position.copy(_p);

      // --- look ----------------------------------------------------------------------------------
      _t.copy(this.pivot).addScaledVector(this.fwd, 6);
      _t.y -= 0.35 * (1 - this.dive);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(_t);

      // Roll with the swing arc, and a touch with air turns.
      let rollT = 0;
      if (player.state === S.SWINGING) {
        _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));           // camera right
        _u.subVectors(player.anchor, p).normalize();
        rollT = -_u.dot(_r) * T.camRollMax * U.DEG;
      } else if (player.state === S.AIRBORNE && hs > 15) {
        _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        rollT = -U.clamp((v.x * _r.x + v.z * _r.z) / 40, -1, 1) * T.camRollMax * 0.4 * U.DEG;
      }
      this.roll = U.damp(this.roll, rollT, 3, dt);
      this.camera.rotateZ(this.roll);
      this.camera.getWorldDirection(this.viewDir);

      // --- FOV -------------------------------------------------------------------------------------
      const fovT = T.fovMin + (T.fovMax - T.fovMin) * U.smoothstep(4, T.swingMaxSpeed, speed);
      this.fov = U.damp(this.fov, fovT, 3, dt);
      if (Math.abs(this.camera.fov - this.fov) > 0.01) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
      this.speedFx = U.damp(this.speedFx, U.smoothstep(T.speedFxStart, T.speedFxStart + 25, speed), 4, dt);
    }
  }

  SR.CameraRig = CameraRig;
})();
