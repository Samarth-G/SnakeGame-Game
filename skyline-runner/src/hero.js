// The hero: an original masked athlete built from primitives, with a procedural pose
// system (no animation files) and two suits switched with a shimmer.
//   Suit A "Ember": signal orange + dark slate, a skyline-kite chest emblem.
//   Suit B "Nocturne": gloss black with a large white shard emblem across chest and back.
(function () {
  const U = SR.util, V3 = THREE.Vector3, Q = THREE.Quaternion;
  const _v = new V3(), _w = new V3(), _q = new Q(), _q2 = new Q(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
  const UPV = new V3(0, 1, 0), DOWN = new V3(0, -1, 0);

  const SUITS = [
    { name: 'Ember', primary: '#ff5b1f', accent: '#1d232d', emblem: 'kite', lens: 0xf6fbff, rough: 0.5 },
    { name: 'Nocturne', primary: '#0b0c10', accent: '#15171d', emblem: 'shard', lens: 0xffffff, rough: 0.3 },
  ];

  function torsoTexture(suit) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = suit.primary; x.fillRect(0, 0, 512, 512);
    if (suit.emblem === 'kite') {
      // dark side panels and belt
      x.fillStyle = suit.accent;
      x.fillRect(96, 0, 64, 512); x.fillRect(352, 0, 64, 512);
      x.fillRect(0, 440, 512, 72);
      x.fillStyle = '#ff9a3c'; x.fillRect(0, 432, 512, 8);
      // emblem on the front (u = 0 wraps, so draw it at both edges)
      for (const ox of [0, 512]) {
        x.save(); x.translate(ox, 230);
        x.fillStyle = suit.accent; x.strokeStyle = '#ffe7c7'; x.lineWidth = 6;
        x.beginPath(); x.moveTo(0, -120); x.lineTo(70, -10); x.lineTo(0, 110); x.lineTo(-70, -10); x.closePath(); x.fill(); x.stroke();
        x.fillStyle = suit.primary;
        for (const [w, y] of [[34, -40], [22, 0], [12, 34]]) x.fillRect(-w, y, w * 2, 10);
        x.restore();
      }
      // small kite on the back
      x.save(); x.translate(256, 200); x.fillStyle = suit.accent;
      x.beginPath(); x.moveTo(0, -50); x.lineTo(32, 0); x.lineTo(0, 50); x.lineTo(-32, 0); x.closePath(); x.fill(); x.restore();
    } else {
      // Large white shard that wraps across chest and back.
      for (const cx of [0, 256, 512]) {
        x.save(); x.translate(cx, 250); x.fillStyle = '#f4f4f4';
        x.beginPath();
        x.moveTo(0, -150); x.lineTo(36, -60); x.lineTo(140, -95); x.lineTo(60, -10); x.lineTo(110, 60); x.lineTo(20, 30);
        x.lineTo(0, 150); x.lineTo(-20, 30); x.lineTo(-110, 60); x.lineTo(-60, -10); x.lineTo(-140, -95); x.lineTo(-36, -60);
        x.closePath(); x.fill(); x.restore();
      }
      x.fillStyle = 'rgba(255,255,255,0.06)';
      for (let i = 0; i < 512; i += 16) x.fillRect(0, i, 512, 1);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  class Hero {
    constructor(scene) {
      this.root = new THREE.Group();
      scene.add(this.root);
      this.suitIndex = 0;
      this.mats = {
        torso: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 }),
        primary: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 }),
        accent: new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }),
        lens: new THREE.MeshStandardMaterial({ roughness: 0.15, metalness: 0.3, emissive: 0x9fb8c8, emissiveIntensity: 0.25 }),
        lensRim: new THREE.MeshStandardMaterial({ color: 0x0d0f13, roughness: 0.4 }),
      };
      this.torsoTex = SUITS.map(torsoTexture);
      this.build();
      this.applySuit(0);
      this.shimmer = 0;
      this.pose = {};
      this.runPhase = 0;
      this.quat = new Q();
      this.lastYaw = 0; this.bank = 0;
      this.handWorld = new V3();
      this.shootArm = 'R';
      this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      // Shimmer ring for suit swaps.
      this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.03, 8, 40), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0, depthWrite: false }));
      this.ring.rotation.x = Math.PI / 2;
      scene.add(this.ring);
    }

    joint(parent, name, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); g.name = name; parent.add(g); this.j[name] = g; return g; }
    limb(parent, len, r, mat, sx, sz) {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), 4, 10), mat);
      m.position.y = -len / 2; m.scale.set(sx || 1, 1, sz || 1);
      parent.add(m);
      return m;
    }

    build() {
      this.j = {};
      const M = this.mats;
      const body = this.joint(this.root, 'body', 0, 0, 0);            // orientation pivot at body centre
      const hips = this.joint(body, 'hips', 0, 0.05, 0);
      const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), M.accent);
      pelvis.scale.set(1.08, 0.72, 0.82); hips.add(pelvis);
      const spine = this.joint(hips, 'spine', 0, 0.06, 0);
      // Athletic torso (lathe profile: narrow waist, broad shoulders).
      const prof = [[0.001, -0.02], [0.13, 0.0], [0.135, 0.08], [0.14, 0.18], [0.175, 0.3], [0.2, 0.4], [0.19, 0.47], [0.14, 0.53], [0.06, 0.56], [0.001, 0.565]].map(([r, y]) => new THREE.Vector2(r, y));
      const torso = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), M.torso);
      torso.scale.set(1.12, 1, 0.74); spine.add(torso);
      const neck = this.joint(spine, 'neck', 0, 0.54, 0);
      this.limb(neck, 0.1, 0.05, M.primary).position.y = 0.04;
      const head = this.joint(neck, 'head', 0, 0.11, 0.0);
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.112, 20, 16), M.primary);
      skull.scale.set(0.92, 1.12, 1.0); skull.position.y = 0.06; head.add(skull);
      for (const s of [-1, 1]) {
        const rim = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), M.lensRim);
        rim.scale.set(1.15, 0.7, 0.35); rim.position.set(s * 0.042, 0.075, 0.093); rim.rotation.z = s * -0.45; head.add(rim);
        const lens = new THREE.Mesh(new THREE.SphereGeometry(0.043, 12, 8), M.lens);
        lens.scale.set(1.05, 0.58, 0.3); lens.position.set(s * 0.043, 0.075, 0.1); lens.rotation.z = s * -0.45; head.add(lens);
      }
      for (const s of ['L', 'R']) {
        const sx = s === 'L' ? 1 : -1;
        const sh = this.joint(spine, 'sh' + s, sx * 0.205, 0.44, 0);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), M.primary); sh.add(cap);
        this.limb(sh, 0.29, 0.052, M.primary);
        const el = this.joint(sh, 'el' + s, 0, -0.29, 0);
        this.limb(el, 0.26, 0.044, M.accent);
        const hand = this.joint(el, 'hand' + s, 0, -0.27, 0);
        const fist = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M.accent); fist.scale.set(0.9, 1.2, 0.8); fist.position.y = -0.03; hand.add(fist);
        const hp = this.joint(hips, 'hip' + s, sx * 0.095, -0.05, 0);
        this.limb(hp, 0.44, 0.078, M.primary);
        const kn = this.joint(hp, 'knee' + s, 0, -0.44, 0);
        this.limb(kn, 0.42, 0.058, M.accent);
        const ft = this.joint(kn, 'foot' + s, 0, -0.42, 0);
        const boot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.24), M.accent); boot.position.set(0, -0.02, 0.06); ft.add(boot);
      }
    }

    applySuit(i) {
      const s = SUITS[i];
      this.suitIndex = i;
      this.mats.torso.map = this.torsoTex[i]; this.mats.torso.needsUpdate = true;
      this.mats.torso.roughness = this.mats.primary.roughness = s.rough;
      this.mats.primary.color.set(s.primary);
      this.mats.accent.color.set(s.accent);
      this.mats.lens.color.set(s.lens);
    }

    switchSuit() {
      this.applySuit((this.suitIndex + 1) % SUITS.length);
      this.shimmer = 1;
      return SUITS[this.suitIndex].name;
    }

    // ------------------------------------------------------------------ posing
    setJ(name, x, y, z) { const p = this.pose[name] || (this.pose[name] = new V3()); p.set(x, y, z); }

    update(dt, player, time) {
      const S = SR.Player.S, st = player.state, v = player.vel, T = SR.TUNING;
      const hs = Math.hypot(v.x, v.z), sp = v.length();
      const P = (n, x, y, z) => this.setJ(n, x || 0, y || 0, z || 0);
      const a = player.anim;
      let bodyDrop = 0;
      // --- base orientation ---------------------------------------------------------------
      const fwd = _v.copy(player.facing); fwd.y = 0; if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, 1); fwd.normalize();
      let up = _w.copy(UPV);
      const yaw = Math.atan2(fwd.x, fwd.z);
      const yawRate = U.wrapAngle(yaw - this.lastYaw) / Math.max(dt, 1e-3);
      this.lastYaw = yaw;
      this.bank = U.damp(this.bank, U.clamp(-yawRate * hs * 0.012, -0.6, 0.6), 6, dt);
      let pitch = 0, roll = this.bank, useBasis = null;

      // --- limb poses per state --------------------------------------------------------------
      for (const k in this.pose) this.pose[k].set(0, 0, 0);
      const t = time;
      if (st === S.GROUNDED && a.land > 0) {
        // Super-hero landing: one knee and one fist down.
        const k = U.smoothstep(0, 0.25, a.land);
        bodyDrop = 0.5 * k; pitch = 0.35 * k;
        P('hipL', -1.5 * k, 0, 0.1); P('kneeL', 1.6 * k); P('footL', -0.2);
        P('hipR', 0.2 * k, 0, -0.15); P('kneeR', 2.1 * k); P('footR', 0.6 * k);
        P('shR', -0.3 * k, 0, 0.25); P('elR', -0.2);
        P('shL', 0.6 * k, 0, -0.6 * k); P('elL', -0.6 * k);
        P('neck', 0.35 * k); P('spine', 0.35 * k);
      } else if (st === S.GROUNDED && a.roll > 0) {
        const k = 1 - a.roll / 0.55;
        pitch = k * Math.PI * 2; bodyDrop = Math.sin(k * Math.PI) * 0.45;
        this.tuck(P, 1);
      } else if (st === S.GROUNDED) {
        const moving = hs > 0.4;
        const sprint = hs > T.runSpeed + 0.8;
        this.runPhase += hs * dt / (sprint ? 2.6 : 2.1) * Math.PI * 2 * 0.5;
        const ph = this.runPhase, amp = U.clamp(hs / T.sprintSpeed, 0, 1.15);
        if (moving) {
          const s1 = Math.sin(ph), c1 = Math.cos(ph);
          pitch = 0.08 + 0.26 * amp;
          P('hipL', -s1 * 0.9 * amp); P('kneeL', Math.max(0, c1) * 1.5 * amp + 0.15);
          P('hipR', s1 * 0.9 * amp); P('kneeR', Math.max(0, -c1) * 1.5 * amp + 0.15);
          P('shL', s1 * 0.95 * amp, 0, 0.1); P('elL', -0.5 - (sprint ? 0.7 : 0.3) * amp);
          P('shR', -s1 * 0.95 * amp, 0, -0.1); P('elR', -0.5 - (sprint ? 0.7 : 0.3) * amp);
          P('spine', 0.05 * amp, s1 * 0.18 * amp, 0);
          bodyDrop = -Math.abs(Math.sin(ph)) * 0.05 * amp + 0.03 * amp;
        } else {
          const br = Math.sin(t * 1.8) * 0.02;
          P('spine', br); P('shL', 0.05, 0, 0.12); P('shR', 0.05, 0, -0.12); P('elL', -0.2); P('elR', -0.2);
          P('hipL', 0, 0, 0.05); P('hipR', 0, 0, -0.05); P('neck', -br);
        }
        if (a.vault > 0) { this.tuck(P, 0.7); roll += 0.5 * Math.sin(a.vault / 0.35 * Math.PI); }
      } else if (st === S.AIRBORNE) {
        const falling = v.y < -4;
        if (player.diving) {
          // Head-down dive, arms swept back.
          useBasis = [this.normOr(_w.copy(v), DOWN), fwd]; // head leads along the velocity
          P('shL', 0.2, 0, 0.45); P('shR', 0.2, 0, -0.45); P('elL', 0); P('elR', 0);
          P('hipL', 0.08); P('hipR', 0.08); P('kneeL', 0.12); P('kneeR', 0.18); P('neck', -0.45);
          const wob = Math.sin(t * 22) * 0.04; P('spine', wob);
        } else if (falling && hs > 10) {
          // Glide: belly down, limbs spread wide.
          pitch = U.clamp(1.2 - (-v.y) * 0.01, 0.7, 1.25);
          P('shL', -0.2, 0, 1.3); P('shR', -0.2, 0, -1.3); P('elL', -0.15); P('elR', -0.15);
          P('hipL', -0.1, 0, 0.45); P('hipR', -0.1, 0, -0.45); P('kneeL', 0.35); P('kneeR', 0.35); P('neck', -0.7);
        } else if (falling) {
          P('shL', -0.6 + Math.sin(t * 9) * 0.2, 0, 0.9); P('shR', -0.6 + Math.cos(t * 9) * 0.2, 0, -0.9);
          P('hipL', -0.5); P('kneeL', 0.9); P('hipR', -0.2); P('kneeR', 0.4);
        } else {
          // Rising / jump.
          P('hipL', -1.0); P('kneeL', 1.4); P('hipR', -0.2); P('kneeR', 0.5);
          P('shL', -1.2, 0, 0.3); P('shR', -0.5, 0, -0.5); P('elL', -0.4); P('elR', -0.8);
          pitch = 0.15;
        }
        if (a.flip > 0) { const k = 1 - a.flip / 0.6; pitch += U.smoothstep(0, 1, k) * Math.PI * 2; this.tuck(P, Math.sin(k * Math.PI)); }
        if (a.launch > 0) { P('shL', -2.8, 0, 0.2); P('shR', -2.8, 0, -0.2); }
      } else if (st === S.SWINGING) {
        // Body hangs along the web; legs tuck at the bottom, extend at the ends of the arc.
        const A = player.anchor;
        const ropeUp = _w.set(A.x - player.pos.x, A.y - player.pos.y, A.z - player.pos.z).normalize();
        const vt = new V3().copy(v); vt.addScaledVector(ropeUp, -vt.dot(ropeUp));
        useBasis = [ropeUp, vt.lengthSq() > 1 ? vt.normalize() : fwd];
        const low = U.clamp((A.y - player.pos.y) / Math.max(player.ropeLen, 1), 0, 1);
        const tuckK = U.smoothstep(0.85, 0.98, low);
        P('hipL', -0.4 - 1.1 * tuckK); P('kneeL', 0.4 + 1.6 * tuckK); P('hipR', -0.1 - 0.9 * tuckK); P('kneeR', 0.2 + 1.5 * tuckK);
        P('spine', -0.1); P('neck', 0.25);
        P('shL', 0.3, 0, 0.35); P('shR', 0.3, 0, -0.35); P('elL', -0.6); P('elR', -0.6);
      } else if (st === S.WALLRUN) {
        const n = new V3(player.wall.nx, 0, player.wall.nz);
        const along = new V3().copy(v); along.addScaledVector(n, -along.dot(n));
        useBasis = [n, along.lengthSq() > 1 ? along.normalize() : UPV];
        this.runPhase += Math.max(sp, 6) * dt / 2.3 * Math.PI;
        const s1 = Math.sin(this.runPhase), c1 = Math.cos(this.runPhase);
        pitch = 0.3;
        P('hipL', -s1 * 1.0); P('kneeL', Math.max(0, c1) * 1.6 + 0.2); P('hipR', s1 * 1.0); P('kneeR', Math.max(0, -c1) * 1.6 + 0.2);
        P('shL', s1 * 1.1, 0, 0.2); P('shR', -s1 * 1.1, 0, -0.2); P('elL', -1.0); P('elR', -1.0);
      } else if (st === S.PERCHED) {
        // Crouched on the ledge/spire, one hand down between the feet.
        bodyDrop = 0.42; pitch = 0.5;
        P('hipL', -2.0, 0, 0.25); P('kneeL', 2.3); P('footL', -0.3);
        P('hipR', -1.9, 0, -0.25); P('kneeR', 2.3); P('footR', -0.3);
        P('shR', 0.9, 0, -0.1); P('elR', -0.2);
        P('shL', -0.5, 0, 0.5); P('elL', -1.3);
        P('neck', -0.45); P('spine', 0.2);
        const look = Math.sin(t * 0.7) * 0.1; this.pose.head = this.pose.head || new V3(); this.pose.head.set(0, look, 0);
      } else if (st === S.ZIPPING) {
        const d = _w.subVectors(player.anchor, player.pos).normalize();
        useBasis = [d, fwd];
        P('shL', -2.9, 0, 0.1); P('shR', -2.9, 0, -0.1); P('elL', -0.1); P('elR', -0.1);
        P('hipL', -0.6); P('kneeL', 1.2); P('hipR', -0.3); P('kneeR', 0.8);
      }

      // --- orientation --------------------------------------------------------------------------
      if (useBasis) this.basisQuat(useBasis[0], useBasis[1], _q);
      else this.basisQuat(UPV, fwd, _q);
      _q2.setFromEuler(_e.set(pitch, 0, roll, 'XYZ'));
      _q.multiply(_q2);
      const rate = st === S.SWINGING || player.diving ? 9 : 14;
      this.quat.slerp(_q, 1 - Math.exp(-rate * dt));
      if ((a.flip > 0 && st === S.AIRBORNE) || (a.roll > 0 && st === S.GROUNDED)) this.quat.copy(_q); // flips must be exact
      this.root.quaternion.copy(this.quat);
      this.root.position.copy(player.pos);
      this.j.body.position.y = U.damp(this.j.body.position.y, -bodyDrop, 14, dt);

      // --- apply joint rotations with smoothing --------------------------------------------------
      const k = 1 - Math.exp(-18 * dt);
      for (const name in this.j) {
        if (name === 'body') continue;
        const target = this.pose[name];
        const jn = this.j[name].rotation;
        jn.x += ((target ? target.x : 0) - jn.x) * k;
        jn.y += ((target ? target.y : 0) - jn.y) * k;
        jn.z += ((target ? target.z : 0) - jn.z) * k;
      }

      // --- IK: the web arm reaches for the anchor ----------------------------------------------------
      this.root.updateMatrixWorld(true);
      if (st === S.SWINGING || st === S.ZIPPING || player.webSlack > 0) {
        const target = player.anchor;
        const bodyRight = new V3(-1, 0, 0).applyQuaternion(this.quat); // model +x is its left
        const toA = new V3().subVectors(target, player.pos);
        this.shootArm = toA.dot(bodyRight) > 0 ? 'R' : 'L';
        const arm = this.j['sh' + this.shootArm];
        arm.parent.getWorldQuaternion(_q2);
        const dLocal = toA.normalize().applyQuaternion(_q2.invert());
        arm.quaternion.setFromUnitVectors(DOWN, dLocal);
        this.j['el' + this.shootArm].rotation.set(0, 0, 0);
        this.root.updateMatrixWorld(true);
      }
      this.j['hand' + this.shootArm].getWorldPosition(this.handWorld);

      // --- suit shimmer --------------------------------------------------------------------------------
      if (this.shimmer > 0) {
        this.shimmer = Math.max(0, this.shimmer - dt * 2.5);
        const e = this.shimmer;
        for (const m of [this.mats.torso, this.mats.primary, this.mats.accent]) { m.emissive.setRGB(0.5 * e, 0.8 * e, 1.0 * e); }
        this.ring.visible = true;
        this.ring.position.set(player.pos.x, player.pos.y - 0.9 + (1 - e) * 2.0, player.pos.z);
        this.ring.material.opacity = e;
        this.ring.scale.setScalar(1 + (1 - e) * 0.4);
      } else this.ring.visible = false;
    }

    tuck(P, k) {
      P('hipL', -2.2 * k); P('kneeL', 2.4 * k); P('hipR', -2.2 * k); P('kneeR', 2.4 * k);
      P('shL', -0.8 * k, 0, 0.3 * k); P('shR', -0.8 * k, 0, -0.3 * k); P('elL', -1.6 * k); P('elR', -1.6 * k);
      P('spine', 0.4 * k); P('neck', 0.4 * k);
    }

    normOr(v, fallback) { return v.lengthSq() > 1e-4 ? v.normalize() : v.copy(fallback); }

    // Quaternion whose +y is `up` and +z is `fwd` (orthogonalised).
    basisQuat(up, fwd, out) {
      const y = new V3().copy(up).normalize();
      const z = new V3().copy(fwd).addScaledVector(y, -fwd.dot(y));
      if (z.lengthSq() < 1e-6) z.set(0, 0, 1).addScaledVector(y, -y.z);
      z.normalize();
      const x = new V3().crossVectors(y, z);
      _m.makeBasis(x, y, z);
      return out.setFromRotationMatrix(_m);
    }
  }

  Hero.SUITS = SUITS;
  SR.Hero = Hero;
})();
