// Traffic (lane following, car-following, signals) and pedestrians (sidewalk loops,
// plaza crowds, park walkers). Only things near the camera are drawn: each type is one
// InstancedMesh refilled every frame.
(function () {
  const W = SR.WORLD, U = SR.util, C = SR.Collision, merge = SR.geo.mergeParts;
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const wheel = () => new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const BODY = [1, 1, 1], GLASS = [0.1, 0.12, 0.14], BLACK = [0.05, 0.05, 0.05];

  function wheels(len, wid, zf, zr) {
    const out = [];
    for (const z of [zf, zr]) for (const x of [-wid / 2, wid / 2]) out.push({ geo: wheel(), pos: [x, 0.36, z], rot: [0, 0, Math.PI / 2], col: BLACK });
    return out;
  }
  function lights(len, wid, y) {
    return [
      { geo: box(0.4, 0.14, 0.05), pos: [-wid / 2 + 0.3, y, len / 2], col: [1.4, 1.4, 1.3] },
      { geo: box(0.4, 0.14, 0.05), pos: [wid / 2 - 0.3, y, len / 2], col: [1.4, 1.4, 1.3] },
      { geo: box(0.35, 0.14, 0.05), pos: [-wid / 2 + 0.3, y, -len / 2], col: [1.2, 0.08, 0.08] },
      { geo: box(0.35, 0.14, 0.05), pos: [wid / 2 - 0.3, y, -len / 2], col: [1.2, 0.08, 0.08] },
    ];
  }
  const VEHICLES = {
    sedan: { len: 4.6, wid: 1.85, h: 1.5, geo: () => merge([
      { geo: box(1.85, 0.72, 4.6), pos: [0, 0.72, 0], col: BODY },
      { geo: box(1.6, 0.52, 2.3), pos: [0, 1.34, -0.2], col: GLASS },
      { geo: box(1.62, 0.06, 2.1), pos: [0, 1.61, -0.2], col: BODY },
      ...wheels(4.6, 1.85, 1.45, -1.45), ...lights(4.6, 1.85, 0.85)]) },
    taxi: { len: 4.7, wid: 1.85, h: 1.8, geo: () => merge([
      { geo: box(1.85, 0.72, 4.7), pos: [0, 0.72, 0], col: BODY },
      { geo: box(1.6, 0.52, 2.3), pos: [0, 1.34, -0.2], col: GLASS },
      { geo: box(1.62, 0.06, 2.1), pos: [0, 1.61, -0.2], col: BODY },
      { geo: box(0.8, 0.26, 0.28), pos: [0, 1.77, -0.1], col: [1.1, 1.1, 1.0] },
      { geo: box(1.87, 0.12, 4.0), pos: [0, 0.8, 0], col: [0.15, 0.15, 0.12] },
      ...wheels(4.7, 1.85, 1.5, -1.5), ...lights(4.7, 1.85, 0.85)]) },
    van: { len: 5.2, wid: 2.0, h: 2.3, geo: () => merge([
      { geo: box(2.0, 1.9, 5.2), pos: [0, 1.3, 0], col: BODY },
      { geo: box(1.9, 0.6, 0.9), pos: [0, 1.75, 2.2], col: GLASS },
      { geo: box(2.02, 0.45, 2.8), pos: [0, 1.85, -0.6], col: GLASS },
      ...wheels(5.2, 2.0, 1.8, -1.8), ...lights(5.2, 2.0, 0.9)]) },
    truck: { len: 7.6, wid: 2.4, h: 3.5, geo: () => merge([
      { geo: box(2.3, 2.1, 2.1), pos: [0, 1.5, 2.7], col: [0.85, 0.85, 0.85] },
      { geo: box(2.2, 0.7, 0.1), pos: [0, 2.0, 3.76], col: GLASS },
      { geo: box(2.45, 2.9, 5.3), pos: [0, 2.05, -1.1], col: BODY },
      ...wheels(7.6, 2.3, 2.7, -2.6), ...lights(7.6, 2.3, 0.9)]) },
    bus: { len: 12, wid: 2.55, h: 3.2, geo: () => merge([
      { geo: box(2.55, 2.7, 12), pos: [0, 1.75, 0], col: BODY },
      { geo: box(2.57, 1.0, 11.2), pos: [0, 2.3, -0.2], col: GLASS },
      { geo: box(2.4, 1.3, 0.08), pos: [0, 2.1, 6.0], col: GLASS },
      { geo: box(2.2, 0.35, 0.1), pos: [0, 3.0, 6.02], col: [1.2, 0.7, 0.1] },
      ...wheels(12, 2.45, 4.2, -3.6), ...lights(12, 2.45, 0.9)]) },
  };
  const MIX = [['sedan', 0.34], ['taxi', 0.3], ['van', 0.14], ['truck', 0.12], ['bus', 0.1]];
  const SEDAN_COLORS = [0x1c1c1e, 0xeeeeee, 0x8a9199, 0x2a3f68, 0x7a1f1f, 0x355e3b, 0xb8b2a3, 0x3b3b45, 0x9b2d20];

  // Signal phase: 24 s cycle with a green wave along each avenue.
  const CYCLE = 24;
  function phase(k, t) { return ((t + k * 0.9) % CYCLE + CYCLE) % CYCLE; }
  function nsState(k, t) { const p = phase(k, t); return p < 10 ? 'g' : p < 12 ? 'y' : 'r'; }
  function ewState(k, t) { const p = phase(k, t); return p >= 12 && p < 22 ? 'g' : p >= 22 ? 'y' : 'r'; }
  // Seconds of yellow left (only meaningful while yellow).
  function yellowLeft(axis, k, t) { const p = phase(k, t); return axis === 'ns' ? 12 - p : CYCLE - p; }

  class Traffic {
    constructor(world, scene, city) {
      this.world = world; this.scene = scene; this.city = city; this.L = world.layout;
      this.rnd = U.rng(555);
      this.time = 0;
      this.lanes = [];
      this.cars = [];
      this.makeLanes();
      this.spawnCars();
      this.makeMeshes();
      this.makeSignals();
      this.peds = new SR.Pedestrians(world, scene, city);
    }

    makeLanes() {
      const L = this.L;
      const streetStopsFor = (dir) => L.streets.map((s, k) => ({ at: dir > 0 ? s.z0 - 4.6 : s.z1 + 4.6, k }));
      for (const a of L.avenues) {
        for (const [x, dir] of [[a.x0 + 7.25, 1], [a.x0 + 11.75, 1], [a.x1 - 7.25, -1], [a.x1 - 11.75, -1]]) {
          this.lanes.push({ axis: 'z', c: x, dir, lo: -W.islandHalfZ + 32, hi: W.islandHalfZ - 32, speed: 13, stops: streetStopsFor(dir), sig: 'ns', cars: [] });
        }
      }
      const P = W.park;
      for (const s of L.streets) {
        const inPark = s.z > P.z0 && s.z < P.z1;
        const segs = inPark ? [[-W.highwayInner, P.x0], [P.x1, W.highwayInner]] : [[-W.highwayInner, W.highwayInner]];
        for (const [lo, hi] of segs) {
          for (const [z, dir] of [[s.z0 + 5.75, -1], [s.z1 - 5.75, 1]]) {
            const stops = L.avenues.filter((a) => a.x > lo && a.x < hi).map((a) => ({ at: dir > 0 ? a.x0 - 4.6 : a.x1 + 4.6, k: s.k }));
            this.lanes.push({ axis: 'x', c: z, dir, lo: lo + 2, hi: hi - 2, speed: 10, stops, sig: 'ew', cars: [] });
          }
        }
      }
      for (const side of [-1, 1]) {
        const base = side * W.highwayInner + side * 3.5;
        for (let i = 0; i < 3; i++) this.lanes.push({ axis: 'z', c: base + side * i * 5, dir: side, lo: -W.islandHalfZ + 5, hi: W.islandHalfZ - 5, speed: 21, stops: [], sig: null, cars: [] });
        for (let i = 0; i < 3; i++) this.lanes.push({ axis: 'z', c: side * W.highwayOuter - side * 3.5 - side * i * 5, dir: -side, lo: -W.islandHalfZ + 5, hi: W.islandHalfZ - 5, speed: 21, stops: [], sig: null, cars: [] });
      }
    }

    pickType() { let k = this.rnd(); for (const [t, p] of MIX) { if ((k -= p) < 0) return t; } return 'sedan'; }

    spawnCars() {
      const r = this.rnd;
      for (const lane of this.lanes) {
        const len = lane.hi - lane.lo;
        const spacing = lane.sig === 'ns' ? 42 : lane.sig === 'ew' ? 58 : 55;
        let s = r() * spacing;
        while (s < len - 8) {
          const type = lane.speed > 15 ? (r() < 0.25 ? 'truck' : r() < 0.6 ? 'sedan' : 'van') : this.pickType();
          const col = new THREE.Color(type === 'taxi' ? 0xf2c01e : type === 'bus' ? r.pick([0x2855a8, 0xe8e8e8, 0x1f7a4a]) : type === 'truck' ? r.pick([0xf2f2f2, 0xd9d4c7, 0x9e2b25]) : r.pick(SEDAN_COLORS));
          const car = { lane, s, v: lane.speed * (0.6 + r() * 0.4), type, len: VEHICLES[type].len, color: col, x: 0, z: 0, ry: 0 };
          lane.cars.push(car); this.cars.push(car);
          s += spacing * (0.55 + r() * 0.9) + car.len;
        }
      }
    }

    makeMeshes() {
      this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.35 });
      this.meshes = {};
      for (const t in VEHICLES) {
        const count = this.cars.filter((c) => c.type === t).length;
        const m = new THREE.InstancedMesh(VEHICLES[t].geo(), this.mat, Math.max(1, count));
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.setColorAt(0, new THREE.Color());
        m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.count = 0;
        this.scene.add(m);
        this.meshes[t] = m;
      }
    }

    makeSignals() {
      const poses = this.city.signalPoses || [];
      this.lampMesh = new THREE.InstancedMesh(SR.props.signalLamp(), new THREE.MeshBasicMaterial({ vertexColors: true }), poses.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion();
      poses.forEach((p, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.ry);
        m.compose(new THREE.Vector3(p.x, 0.15, p.z), q, new THREE.Vector3(1, 1, 1));
        this.lampMesh.setMatrixAt(i, m);
        this.lampMesh.setColorAt(i, new THREE.Color(0, 1, 0));
        p.k = Math.round((p.z - W.firstStreetZ) / W.streetPitch);
      });
      this.lampMesh.computeBoundingSphere();
      this.scene.add(this.lampMesh);
      this.poses = poses;
      this.lampColors = { g: new THREE.Color(0.2, 2.2, 0.6), y: new THREE.Color(2.4, 1.6, 0.1), r: new THREE.Color(2.4, 0.15, 0.1) };
      this.lampTimer = 0;
    }

    update(dt, player, camPos) {
      this.time += dt;
      const t = this.time;
      // --- car following + signals -----------------------------------------------------------
      for (const lane of this.lanes) {
        const cars = lane.cars, n = cars.length, len = lane.hi - lane.lo;
        if (!n) continue;
        // keep sorted by s (cars never overtake; wrap-around handled below)
        cars.sort((a, b) => a.s - b.s);
        for (let i = 0; i < n; i++) {
          const car = cars[i], ahead = cars[(i + 1) % n];
          let gap = ahead.s - car.s - ahead.len / 2 - car.len / 2;
          if (i === n - 1) gap += len;
          let target = lane.speed;
          const need = 3 + car.v * 0.9;
          if (gap < need) target = Math.min(target, Math.max(0, (gap - 2.5) * 1.2));
          // signal ahead?
          if (lane.sig) {
            const worldS = lane.dir > 0 ? lane.lo + car.s : lane.hi - car.s;
            for (const st of lane.stops) {
              const d = (st.at - worldS) * lane.dir - car.len / 2;
              if (d < -1 || d > 45) continue;
              const state = lane.sig === 'ns' ? nsState(st.k, t) : ewState(st.k, t);
              // On yellow, only continue if the front bumper clears the line before red.
              if (state === 'r' || (state === 'y' && d > car.v * yellowLeft(lane.sig, st.k, t) - 0.5)) target = Math.min(target, Math.max(0, (d - 0.5) * 0.9));
              break;
            }
          }
          // don't run the hero over
          if (player && player.state === 'Grounded' && player.feetY < 1.5) {
            const px = lane.axis === 'z' ? player.pos.x : player.pos.z, pa = lane.axis === 'z' ? player.pos.z : player.pos.x;
            if (Math.abs(px - lane.c) < 2.2) {
              const worldS = lane.dir > 0 ? lane.lo + car.s : lane.hi - car.s;
              const d = (pa - worldS) * lane.dir - car.len / 2;
              if (d > -1 && d < 14) target = 0;
            }
          }
          const acc = target > car.v ? 3 : 8;
          car.v += U.clamp(target - car.v, -acc * dt, acc * dt);
        }
        for (const car of cars) {
          car.s += car.v * dt;
          if (car.s > len) car.s -= len;
          const worldS = lane.dir > 0 ? lane.lo + car.s : lane.hi - car.s;
          if (lane.axis === 'z') { car.x = lane.c; car.z = worldS; car.ry = lane.dir > 0 ? 0 : Math.PI; }
          else { car.x = worldS; car.z = lane.c; car.ry = lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
        }
      }

      // --- draw cars near the camera -------------------------------------------------------------
      const m = this._m || (this._m = new THREE.Matrix4()), q = this._q || (this._q = new THREE.Quaternion()), up = new THREE.Vector3(0, 1, 0);
      const one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
      const counts = {};
      for (const k in this.meshes) counts[k] = 0;
      const R2 = 1100 * 1100;
      for (const car of this.cars) {
        const dx = car.x - camPos.x, dz = car.z - camPos.z;
        if (dx * dx + dz * dz > R2) continue;
        const mesh = this.meshes[car.type], i = counts[car.type]++;
        q.setFromAxisAngle(up, car.ry);
        m.compose(p.set(car.x, 0, car.z), q, one);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, car.color);
      }
      for (const k in this.meshes) {
        const mesh = this.meshes[k];
        mesh.count = counts[k];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }

      // --- dynamic colliders near the hero: cars can be vaulted over --------------------------
      const dyn = this.world.col.dynamic;
      dyn.length = 0;
      if (player) {
        for (const car of this.cars) {
          const dx = car.x - player.pos.x, dz = car.z - player.pos.z;
          if (dx * dx + dz * dz > 900) continue;
          const V = VEHICLES[car.type], alongZ = car.lane.axis === 'z';
          const hx = (alongZ ? V.wid : V.len) / 2, hz = (alongZ ? V.len : V.wid) / 2;
          dyn.push({ x0: car.x - hx, x1: car.x + hx, y0: 0, y1: V.h, z0: car.z - hz, z1: car.z + hz, flags: C.SOLID | C.VAULT, ref: car, mark: 0 });
        }
      }

      // --- signal lamp colours ------------------------------------------------------------------
      this.lampTimer -= dt;
      if (this.lampTimer <= 0) {
        this.lampTimer = 0.25;
        this.poses.forEach((ps, i) => this.lampMesh.setColorAt(i, this.lampColors[ps.axis === 'ns' ? nsState(ps.k, t) : ewState(ps.k, t)]));
        this.lampMesh.instanceColor.needsUpdate = true;
      }

      this.peds.update(dt, camPos);
    }

    // Nearest car to a point (audio: horns).
    nearestCar(x, z) {
      let best = null, bd = Infinity;
      for (const c of this.cars) { const d = (c.x - x) ** 2 + (c.z - z) ** 2; if (d < bd) { bd = d; best = c; } }
      return best;
    }
  }

  // ------------------------------------------------------------------------ pedestrians
  class Pedestrians {
    constructor(world, scene, city) {
      this.world = world; this.L = world.layout; this.city = city;
      const r = this.rnd = U.rng(808);
      this.list = [];
      const skin = [[0.95, 0.78, 0.64], [0.78, 0.57, 0.42], [0.55, 0.38, 0.26], [0.36, 0.25, 0.18], [0.98, 0.86, 0.74]];
      const shirt = () => new THREE.Color().setHSL(r(), 0.2 + r() * 0.5, 0.2 + r() * 0.5);
      const add = (o) => { o.phase = r() * 100; o.skin = new THREE.Color(...r.pick(skin)); o.shirt = shirt(); o.legs = new THREE.Color().setHSL(0.6 + r() * 0.1, 0.25, 0.12 + r() * 0.25); o.h = 0.92 + r() * 0.16; this.list.push(o); };
      // Sidewalk loops around each block.
      for (const blk of this.L.blocks) {
        if (blk.kind === 'park') continue;
        const ins = 2.6 + r() * 1.2;
        const x0 = blk.x0 + ins, x1 = blk.x1 - ins, z0 = blk.z0 + ins, z1 = blk.z1 - ins;
        const per = 2 * (x1 - x0 + z1 - z0);
        const n = Math.round(per / (blk.district === 'residential' ? 55 : 30));
        for (let i = 0; i < n; i++) {
          const inset = ins + (r() - 0.5) * 1.6;
          add({ kind: 'loop', x0: blk.x0 + inset, x1: blk.x1 - inset, z0: blk.z0 + inset, z1: blk.z1 - inset, s: r() * per, v: (1.1 + r() * 0.6) * (r() < 0.5 ? 1 : -1) });
        }
      }
      // Plaza crowds wander between random points.
      const polys = [];
      if (city.plazaCrowd) polys.push({ poly: city.plazaCrowd.poly, n: 150 });
      if (city.entPieces) for (const p of city.entPieces) polys.push({ poly: p, n: Math.min(90, Math.round(Math.abs(areaOf(p)) / 60)) });
      for (const { poly, n } of polys) {
        const bb = bbox(poly);
        for (let i = 0; i < n; i++) {
          const pt = randomIn(poly, bb, r, city);
          if (!pt) continue;
          add({ kind: 'wander', poly, bb, x: pt[0], z: pt[1], tx: pt[0], tz: pt[1], v: 0.8 + r() * 0.7, wait: r() * 4 });
        }
      }
      // Park path walkers.
      for (const [a, b] of city.parkPaths || []) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let i = 0; i < len / 35; i++) add({ kind: 'path', a, b, len, s: r() * len * 2, v: 1 + r() * 0.8, off: (r() - 0.5) * 2.5 });
      }
      this.makeMesh(scene);
      this.time = 0;
    }

    makeMesh(scene) {
      const merge = SR.geo.mergeParts;
      // Two meshes share matrices: clothes (tinted by shirt colour) and skin/legs.
      const torso = merge([{ geo: new THREE.CylinderGeometry(0.2, 0.17, 0.62, 8), pos: [0, 1.22, 0], col: [1, 1, 1] }, { geo: new THREE.BoxGeometry(0.48, 0.12, 0.24), pos: [0, 1.48, 0], col: [1, 1, 1] }]);
      const legs = merge([
        { geo: new THREE.BoxGeometry(0.14, 0.9, 0.16), pos: [-0.1, 0.45, 0], col: [1, 1, 1] },
        { geo: new THREE.BoxGeometry(0.14, 0.9, 0.16), pos: [0.1, 0.45, 0], col: [1, 1, 1] },
      ]);
      const head = merge([{ geo: new THREE.SphereGeometry(0.12, 10, 8), pos: [0, 1.68, 0], col: [1, 1, 1] }, { geo: new THREE.BoxGeometry(0.08, 0.55, 0.08), pos: [-0.26, 1.2, 0], col: [1, 1, 1] }, { geo: new THREE.BoxGeometry(0.08, 0.55, 0.08), pos: [0.26, 1.2, 0], col: [1, 1, 1] }]);
      const walkMat = () => {
        const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
        m.onBeforeCompile = (sh) => {
          sh.uniforms.uTime = this.uTime || (this.uTime = { value: 0 });
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
              float ph = float(gl_InstanceID) * 1.731 + uTime * 7.0;
              float legSwing = sin(ph) * sign(transformed.x) * clamp(0.9 - transformed.y, 0.0, 0.9) * 0.45;
              transformed.z += transformed.y < 0.92 ? legSwing : 0.0;
              transformed.z -= (abs(transformed.x) > 0.22 && transformed.y > 0.9 && transformed.y < 1.5) ? sin(ph) * sign(transformed.x) * (1.5 - transformed.y) * 0.4 : 0.0;
              transformed.y += abs(sin(ph)) * 0.035;`);
        };
        return m;
      };
      const N = this.list.length;
      this.meshes = [torso, legs, head].map((g) => {
        const m = new THREE.InstancedMesh(g, walkMat(), N);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false; m.castShadow = true; m.count = 0;
        m.setColorAt(0, new THREE.Color());
        scene.add(m);
        return m;
      });
    }

    update(dt, cam) {
      this.time += dt;
      this.uTime && (this.uTime.value = this.time);
      const R2 = 380 * 380, r = this.rnd;
      const m = this._m || (this._m = new THREE.Matrix4()), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s3 = new THREE.Vector3(), p = new THREE.Vector3();
      let n = 0;
      for (const o of this.list) {
        let x, z, dir;
        if (o.kind === 'loop') {
          // Only simulate what is near; the loop position is analytic in time.
          const w = o.x1 - o.x0, d = o.z1 - o.z0, per = 2 * (w + d);
          if (Math.abs((o.x0 + o.x1) / 2 - cam.x) > 450 || Math.abs((o.z0 + o.z1) / 2 - cam.z) > 450) continue;
          let s = ((o.s + o.v * this.time) % per + per) % per;
          if (s < w) { x = o.x0 + s; z = o.z0; dir = Math.PI / 2; }
          else if ((s -= w) < d) { x = o.x1; z = o.z0 + s; dir = 0; }
          else if ((s -= d) < w) { x = o.x1 - s; z = o.z1; dir = -Math.PI / 2; }
          else { s -= w; x = o.x0; z = o.z1 - s; dir = Math.PI; }
          if (o.v < 0) dir += Math.PI;
        } else if (o.kind === 'wander') {
          if (Math.abs(o.x - cam.x) > 450 || Math.abs(o.z - cam.z) > 450) continue;
          const dx = o.tx - o.x, dz = o.tz - o.z, dl = Math.hypot(dx, dz);
          if (dl < 0.3) {
            o.wait -= dt;
            if (o.wait <= 0) { const pt = randomIn(o.poly, o.bb, r, this.city); if (pt) { o.tx = pt[0]; o.tz = pt[1]; } o.wait = 1 + r() * 6; }
          } else { o.x += dx / dl * o.v * dt; o.z += dz / dl * o.v * dt; o.dir = Math.atan2(dx, dz); }
          x = o.x; z = o.z; dir = o.dir || 0;
        } else {
          const mx = (o.a[0] + o.b[0]) / 2, mz = (o.a[1] + o.b[1]) / 2;
          if (Math.abs(mx - cam.x) > 500 || Math.abs(mz - cam.z) > 500) continue;
          const L2 = o.len * 2, s = ((o.s + o.v * this.time) % L2 + L2) % L2;
          const fwd = s < o.len, t = (fwd ? s : L2 - s) / o.len;
          const ux = (o.b[0] - o.a[0]) / o.len, uz = (o.b[1] - o.a[1]) / o.len;
          x = o.a[0] + (o.b[0] - o.a[0]) * t - uz * o.off; z = o.a[1] + (o.b[1] - o.a[1]) * t + ux * o.off;
          dir = Math.atan2(ux, uz) + (fwd ? 0 : Math.PI);
        }
        const dx = x - cam.x, dz = z - cam.z;
        if (dx * dx + dz * dz > R2) continue;
        q.setFromAxisAngle(up, dir);
        m.compose(p.set(x, 0.15, z), q, s3.set(1, o.h, 1));
        for (const mesh of this.meshes) mesh.setMatrixAt(n, m);
        this.meshes[0].setColorAt(n, o.shirt);
        this.meshes[1].setColorAt(n, o.legs);
        this.meshes[2].setColorAt(n, o.skin);
        n++;
      }
      for (const mesh of this.meshes) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
      this.visible = n;
    }
  }

  function areaOf(p) { let a = 0; for (let i = 0; i < p.length; i++) { const u = p[i], v = p[(i + 1) % p.length]; a += u[0] * v[1] - v[0] * u[1]; } return a / 2; }
  function bbox(p) { const xs = p.map((q) => q[0]), zs = p.map((q) => q[1]); return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]; }
  function randomIn(poly, bb, r, city) {
    for (let i = 0; i < 20; i++) {
      const x = bb[0] + r() * (bb[2] - bb[0]), z = bb[1] + r() * (bb[3] - bb[1]);
      if (city.pointInPoly([x, z], poly) && !(city.fountain && Math.hypot(x - city.fountain.x, z - city.fountain.z) < 7.5)) return [x, z];
    }
    return null;
  }

  Traffic.nsState = nsState; Traffic.ewState = ewState;
  SR.Traffic = Traffic;
  SR.Pedestrians = Pedestrians;
})();
