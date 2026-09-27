// Turns the layout into meshes: modular facades per archetype, rooftop kit, street level,
// park, plazas, waterfront, bridges and the distant mainland. Geometry is merged per
// material per 500 m chunk (frustum-cullable) and props are instanced per chunk.
(function () {
  const W = SR.WORLD, U = SR.util, C = SR.Collision;
  const M4 = THREE.Matrix4, V3 = THREE.Vector3, Q = THREE.Quaternion;
  const _m = new M4(), _q = new Q(), _s = new V3(), _p = new V3(), _e = new THREE.Euler();

  function mat4(x, y, z, ry, sx, sy, sz) {
    _q.setFromEuler(_e.set(0, ry || 0, 0));
    return _m.compose(_p.set(x, y, z), _q, _s.set(sx || 1, sy == null ? sx || 1 : sy, sz == null ? sx || 1 : sz));
  }

  // Convex polygon clipped by the half-plane a*x + c*z + e >= 0.
  function clip(pts, a, c, e) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const fp = a * p[0] + c * p[1] + e, fq = a * q[0] + c * q[1] + e;
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    return out;
  }
  function polyArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
  function centroid(pts) { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; }

  class City {
    constructor(world, scene, textures) {
      this.world = world; this.scene = scene; this.T = textures; this.L = world.layout; this.col = world.col;
      this.rnd = U.rng(4242);
      this.groups = new Map();           // chunkKey -> { mat -> GeoBuilder }
      this.inst = {};                    // type -> ChunkedInstances
      this.animated = [];                // billboards / ticker updated per frame
      this.meshes = [];
      this.makeMaterials();
    }

    // ------------------------------------------------------------------ materials
    makeMaterials() {
      const T = this.T, std = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.85, metalness: 0 }, o));
      this.M = {
        brick: std({ map: T.brick, roughness: 0.92 }),
        limestone: std({ map: T.limestone, roughness: 0.88 }),
        deco: std({ map: T.deco, roughness: 0.75 }),
        glass: std({ map: T.glass, roughness: 0.08, metalness: 0.88, envMapIntensity: 1.25 }),
        store: std({ map: T.store, emissiveMap: T.storeEmissive, emissive: 0xffe2b8, emissiveIntensity: 0.55, roughness: 0.6 }),
        roof: std({ map: T.roof, roughness: 0.95 }),
        trim: std({ color: 0xd9d1c1, roughness: 0.8 }),
        metal: std({ color: 0xffffff, roughness: 0.5, metalness: 0.55 }),
        asphalt: std({ map: T.asphalt, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }),
        boulevard: std({ map: T.asphalt, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
        sidewalk: std({ map: T.sidewalk, roughness: 0.9 }),
        grass: std({ map: T.grass, roughness: 0.95 }),
        path: std({ map: T.path, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
        redPavers: std({ map: T.redPavers, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
        plazaPavers: std({ map: T.plazaPavers, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
        marking: std({ roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
        arrow: std({ map: T.arrow, transparent: true, alphaTest: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
        signs: std({ map: T.signs, emissive: 0xffffff, emissiveMap: T.signs, emissiveIntensity: 0.35, roughness: 0.5 }),
        pondWater: std({ color: 0x3d5c63, roughness: 0.05, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
        wood: std({ color: 0x7b6149, roughness: 0.9 }),
        bridge: std({ color: 0x9aa4a8, roughness: 0.55, metalness: 0.4 }),
        far: std({ roughness: 0.9 }),
      };
      this.M.foliage = SR.makeFoliageMaterial();
      this.M.prop = std({ roughness: 0.7 });
      this.M.propMetal = std({ roughness: 0.45, metalness: 0.5 });
    }

    chunkKey(x, z) {
      if (Math.abs(x) > W.islandHalfX + 200 || Math.abs(z) > W.islandHalfZ + 60) return 'far';
      const cx = x < 0 ? 0 : 1, cz = U.clamp(Math.floor((z + 2000) / 500), 0, 7);
      return cx * 8 + cz;
    }
    gb(x, z, mat) {
      const k = this.chunkKey(x, z);
      let g = this.groups.get(k);
      if (!g) { g = {}; this.groups.set(k, g); }
      return g[mat] || (g[mat] = new SR.GeoBuilder());
    }
    instances(type, geoFn, material, opts) {
      if (!this.inst[type]) this.inst[type] = new SR.geo.ChunkedInstances(this.scene, geoFn(), material, 500, opts);
      return this.inst[type];
    }

    build() {
      this.buildBuildings();
      this.buildStreets();
      this.buildBoulevard();
      this.buildPark();
      this.buildStreetFurniture();
      this.buildWaterfront();
      this.buildBridges();
      this.buildMainland();
      this.buildEntertainment();
      this.finish();
    }

    // ------------------------------------------------------------------ buildings
    faceFrontsStreet(b, face) {
      const L = this.L, near = (d) => d >= -0.5 && d <= 6.5;
      if (face === '+z') return L.streets.some((s) => near(s.z0 - b.z1)) || near(W.islandHalfZ - 31 - b.z1);
      if (face === '-z') return L.streets.some((s) => near(b.z0 - s.z1)) || near(b.z0 + W.islandHalfZ - 31);
      if (face === '+x') return L.avenues.some((a) => near(a.x0 - b.x1)) || near(W.highwayInner - b.x1);
      return L.avenues.some((a) => near(b.x0 - a.x1)) || near(b.x0 + W.highwayInner);
    }

    buildBuildings() {
      const r = this.rnd, col = this.col;
      const pal = {
        brick: [[1, 1, 1], [0.95, 0.78, 0.72], [0.82, 0.66, 0.58], [1.06, 0.96, 0.86], [0.72, 0.6, 0.55], [0.92, 0.9, 0.94], [1.08, 0.9, 0.78]],
        limestone: [[1, 1, 1], [0.96, 0.93, 0.87], [1.02, 0.96, 0.86], [0.88, 0.86, 0.83], [0.98, 0.9, 0.82]],
        glass: [[0.78, 0.9, 1.04], [0.72, 0.9, 0.9], [0.95, 0.96, 1.0], [0.92, 0.84, 0.72], [0.62, 0.74, 0.92], [0.85, 0.95, 0.98]],
        deco: [[1, 1, 1], [0.96, 0.9, 0.8], [0.88, 0.86, 0.84], [1.02, 0.94, 0.86]],
      };
      pal.supertall = [[0.8, 0.9, 1.05]];
      const acs = this.instances('ac', SR.props.acUnit, this.M.prop, { detail: 2 });
      const fes = this.instances('fireEscape', SR.props.fireEscape, this.M.propMetal, { detail: 2 });
      const awn = this.instances('awning', SR.props.awning, this.M.prop, { detail: 1 });
      const sideFaces = 1 | 2 | 16 | 32;
      const shopCells = SR.SHOPS.length;

      for (const b of this.L.buildings) {
        const arch = b.arch, fm = arch === 'supertall' ? 'glass' : arch;
        const tint = r.pick(pal[arch]);
        const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
        const residential = arch === 'brick' || arch === 'limestone';
        const hasStore = residential || (arch === 'deco' && r() < 0.6);
        const uOff = r.int(0, 3) * 4;
        const trimCol = arch === 'brick' ? [0.92, 0.88, 0.8] : [0.95, 0.92, 0.86];

        b.tiers.forEach((t, i) => {
          const ybase = i === 0 && hasStore ? 5 : t.y0;
          if (i === 0 && hasStore) {
            this.gb(cx, cz, 'store').box(t.x0, 0, t.z0, t.x1, 5, t.z1, [1, 1, 1], sideFaces, r.int(0, 2) * 4, 0);
            this.gb(cx, cz, 'trim').box(t.x0 - 0.25, 4.95, t.z0 - 0.25, t.x1 + 0.25, 5.35, t.z1 + 0.25, trimCol, 63);
          }
          this.gb(cx, cz, fm).box(t.x0, ybase, t.z0, t.x1, t.y1, t.z1, tint, sideFaces, uOff, -(i === 0 ? ybase : 0));
          this.gb(cx, cz, 'roof').flat(t.x0, t.z0, t.x1, t.z1, t.y1, [0.9 + r() * 0.15, 0.9 + r() * 0.12, 0.9 + r() * 0.1]);
          // Parapet ring (a vaultable collider) and cornice.
          const ph = fm === 'glass' ? 1.2 : 1.0, pt = 0.35, pm = fm === 'glass' ? 'metal' : 'trim';
          const pc = fm === 'glass' ? [0.55, 0.6, 0.65] : trimCol;
          const rings = [[t.x0, t.z0, t.x1, t.z0 + pt], [t.x0, t.z1 - pt, t.x1, t.z1], [t.x0, t.z0, t.x0 + pt, t.z1], [t.x1 - pt, t.z0, t.x1, t.z1]];
          for (const q of rings) {
            this.gb(cx, cz, pm).box(q[0], t.y1, q[1], q[2], t.y1 + ph, q[3], pc, 63 & ~8);
            col.add(q[0], t.y1, q[1], q[2], t.y1 + ph, q[3], C.SOLID, b);
          }
          if (residential && i === b.tiers.length - 1) {
            this.gb(cx, cz, 'trim').box(t.x0 - 0.45, t.y1 - 1.0, t.z0 - 0.45, t.x1 + 0.45, t.y1 - 0.25, t.z1 + 0.45, trimCol, 63);
          } else if (arch === 'deco') {
            this.gb(cx, cz, 'trim').box(t.x0 - 0.2, t.y1 - 0.6, t.z0 - 0.2, t.x1 + 0.2, t.y1, t.z1 + 0.2, trimCol, sideFaces | 8);
          }
          this.roofKit(b, t, i === b.tiers.length - 1);
        });

        if (b.spire) {
          // Tapered mast: stepped plinth, shaft and a small cap to perch on.
          const s = b.spire, rr = arch === 'supertall' ? 1.1 : 0.6, hgt = s.y1 - s.y0;
          const g = this.gb(cx, cz, 'metal'), steel = [0.42, 0.45, 0.5];
          g.box(s.x - rr * 3, s.y0, s.z - rr * 3, s.x + rr * 3, s.y0 + hgt * 0.12, s.z + rr * 3, steel);
          g.box(s.x - rr * 2, s.y0, s.z - rr * 2, s.x + rr * 2, s.y0 + hgt * 0.35, s.z + rr * 2, steel);
          g.box(s.x - rr * 1.3, s.y0, s.z - rr * 1.3, s.x + rr * 1.3, s.y0 + hgt * 0.7, s.z + rr * 1.3, steel);
          g.box(s.x - rr * 0.7, s.y0, s.z - rr * 0.7, s.x + rr * 0.7, s.y1 - 0.25, s.z + rr * 0.7, [0.55, 0.58, 0.62]);
          g.box(s.x - rr * 0.8, s.y1 - 0.25, s.z - rr * 0.8, s.x + rr * 0.8, s.y1, s.z + rr * 0.8, [0.45, 0.12, 0.1]);
        }

        // Street-facing facade details: shop signs, awnings, AC units, fire escapes.
        const t0 = b.tiers[0];
        const faces = [['+z', t0.z1, 0], ['-z', t0.z0, Math.PI], ['+x', t0.x1, Math.PI / 2], ['-x', t0.x0, -Math.PI / 2]];
        for (const [f, plane, ry] of faces) {
          if (!this.faceFrontsStreet(b, f)) continue;
          const alongX = f[1] === 'z';
          const a0 = alongX ? t0.x0 : t0.z0, a1 = alongX ? t0.x1 : t0.z1, len = a1 - a0;
          const sign = f[0] === '+' ? 1 : -1;
          // Face-local "u" runs left→right when looking at the face.
          const toWorld = (u, y, out) => {
            if (f === '+z') return [t0.x0 + u, y, plane + out];
            if (f === '-z') return [t0.x1 - u, y, plane - out];
            if (f === '+x') return [plane + out, y, t0.z1 - u];
            return [plane - out, y, t0.z0 + u];
          };
          if (hasStore) {
            const sg = this.gb(cx, cz, 'signs');
            for (let u = 0; u + 4 <= len + 0.01; u += 4) {
              const cell = r.int(0, shopCells - 1), cu = (cell % 4) / 4, cv = 1 - (Math.floor(cell / 4) + 1) / 8;
              const A = toWorld(u + 0.4, 3.95, 0.12), B = toWorld(u + 3.4, 3.95, 0.12), Cc = toWorld(u + 3.4, 4.85, 0.12), D = toWorld(u + 0.4, 4.85, 0.12);
              const nx = f === '+x' ? 1 : f === '-x' ? -1 : 0, nz = f === '+z' ? 1 : f === '-z' ? -1 : 0;
              sg.quad(A, B, Cc, D, nx, 0, nz, [cu + 0.004, cv + 0.004, cu + 0.246, cv + 0.004, cu + 0.246, cv + 0.121, cu + 0.004, cv + 0.121], [1, 1, 1]);
              if (r() < 0.45) {
                const p = toWorld(u + 1.9, 3.75, 0);
                awn.add(mat4(p[0], p[1], p[2], ry, 3.4, 1, 1.3).clone(), new THREE.Color().setHSL(r(), 0.55, 0.38));
              }
            }
          }
          if (residential) {
            const floors = Math.floor((t0.y1 - 5 - 2) / 3.2);
            for (let k = 0; k < floors; k++) for (let u = 2; u < len - 1.5; u += 4) {
              if (r() < 0.12) {
                const p = toWorld(u, 5 + 0.85 + 3.2 * k + 0.2, 0);
                acs.add(mat4(p[0], p[1], p[2], ry).clone());
              }
            }
            if (arch === 'brick' && len > 10 && floors > 3 && r() < 0.55) {
              const u = 2 + 4 * r.int(0, Math.floor((len - 4) / 4));
              for (let k = 0; k < floors; k++) {
                const p = toWorld(u, 5 + 0.85 + 3.2 * k - 0.1, 0);
                fes.add(mat4(p[0], p[1], p[2], ry).clone());
              }
            }
          }
          void sign;
        }
      }
    }

    // Rooftops matter: the player lands and runs on them constantly.
    roofKit(b, t, top) {
      const r = this.rnd, col = this.col, w = t.x1 - t.x0, d = t.z1 - t.z0;
      if (w < 7 || d < 7) return;
      const y = t.y1, cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2;
      const residential = b.arch === 'brick' || b.arch === 'limestone';
      // Slot grid so props don't overlap.
      const cs = 4.5, nx = Math.floor((w - 3) / cs), nz = Math.floor((d - 3) / cs);
      const free = [];
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) free.push([t.x0 + 1.5 + cs * (i + 0.5), t.z0 + 1.5 + cs * (j + 0.5)]);
      const take = () => (free.length ? free.splice(Math.floor(r() * free.length), 1)[0] : null);
      const solidBox = (x, z, hw, hd, h, flags) => col.add(x - hw, y, z - hd, x + hw, y + h, z + hd, flags == null ? C.SOLID | C.ANCHOR : flags, b);
      const bulk = this.instances('bulkhead', SR.props.bulkhead, this.M.prop, { castShadow: true });
      const hv = this.instances('hvac', SR.props.hvac, this.M.propMetal, { castShadow: true, detail: 1 });

      if (!top && !residential && r() < 0.5) return;
      if (residential) {
        let s = take();
        if (s) { const bw = 3, bh = 3.2, bd = 3.6; bulk.add(mat4(s[0], y, s[1], r.int(0, 3) * Math.PI / 2, bw, bh, bd).clone(), new THREE.Color(0.75 + r() * 0.2, 0.55 + r() * 0.15, 0.48 + r() * 0.1)); solidBox(s[0], s[1], bw / 2, bd / 2, bh); }
        if (top && w > 11 && d > 11 && r() < 0.6 && (s = take())) {
          this.instances('waterTower', SR.props.waterTower, this.M.prop, { castShadow: true }).add(mat4(s[0], y, s[1], r() * 6).clone());
          solidBox(s[0], s[1], 2.3, 2.3, 10);
          this.world.addPerch(s[0], y + 10, s[1], 'watertower');
        }
        for (let i = 0, n = r.int(0, 2); i < n; i++) if ((s = take())) { const hw = 1 + r(), hh = 1 + r() * 0.8, hd = 0.8 + r() * 0.7; hv.add(mat4(s[0], y, s[1], 0, hw * 2, hh, hd * 2).clone()); solidBox(s[0], s[1], hw, hd, hh); }
        if (r() < 0.3 && (s = take())) this.instances('skylight', SR.props.skylight, this.M.prop, { detail: 1 }).add(mat4(s[0], y, s[1], 0, 2.4, 1, 2.4).clone());
        if (r() < 0.25) {
          const sol = this.instances('solar', SR.props.solar, this.M.propMetal, { detail: 1 });
          for (let i = 0; i < 3; i++) if ((s = take())) for (let a = -1; a <= 1; a += 2) for (let c = -1; c <= 1; c += 2) sol.add(mat4(s[0] + a * 0.95, y, s[1] + c * 1.1).clone());
        }
        if (top && r() < 0.09 && w > 12) {
          // Rooftop billboard frame facing the nearest avenue / street.
          const bw = Math.min(14, w - 2), bh = 5.5, by = y + 2.5, bz = t.z0 + 3;
          this.instances('bbFrame', SR.props.billboardFrame, this.M.propMetal, { castShadow: true }).add(mat4(cx, y, bz, 0, bw, bh + 2.5, 3).clone());
          const g = this.gb(cx, cz, 'billboard');
          const cell = r.int(0, 7), cu = (cell % 2) / 2, cv = 1 - (Math.floor(cell / 2) + 1) / 4;
          g.quad([cx - bw / 2, by, bz - 0.2], [cx + bw / 2, by, bz - 0.2], [cx + bw / 2, by + bh, bz - 0.2], [cx - bw / 2, by + bh, bz - 0.2], 0, 0, -1, [cu + 0.5, cv, cu, cv, cu, cv + 0.25, cu + 0.5, cv + 0.25], [1, 1, 1]);
          col.add(cx - bw / 2, y, bz - 0.4, cx + bw / 2, by + bh, bz + 0.2, C.SOLID | C.ANCHOR, b);
          this.world.addPerch(cx, by + bh, bz, 'billboard');
        }
      } else {
        // Towers: mechanical penthouse, HVAC arrays, antennas.
        let s;
        if (top) {
          const pw = Math.min(w * 0.45, 14), pd = Math.min(d * 0.45, 12), ph = 4 + r() * 3;
          bulk.add(mat4(cx, y, cz, 0, pw, ph, pd).clone(), new THREE.Color(0.62, 0.64, 0.66));
          col.add(cx - pw / 2, y, cz - pd / 2, cx + pw / 2, y + ph, cz + pd / 2, C.SOLID | C.ANCHOR, b);
          for (const [px, pz] of [[cx - pw / 2 + 0.3, cz - pd / 2 + 0.3], [cx + pw / 2 - 0.3, cz + pd / 2 - 0.3]]) this.world.addPerch(px, y + ph, pz, 'ledge');
          for (let i = free.length - 1; i >= 0; i--) if (Math.abs(free[i][0] - cx) < pw / 2 + 2.5 && Math.abs(free[i][1] - cz) < pd / 2 + 2.5) free.splice(i, 1);
          if (!b.spire && r() < 0.45) {
            const ant = this.instances('antenna', SR.props.antenna, this.M.propMetal, {});
            for (let i = 0, n = r.int(1, 3); i < n; i++) {
              const ah = 8 + r() * 18, ax = cx + (r() - 0.5) * pw * 0.6, az = cz + (r() - 0.5) * pd * 0.6;
              ant.add(mat4(ax, y + ph, az, r() * 3, 1, ah, 1).clone());
              col.add(ax - 0.25, y + ph, az - 0.25, ax + 0.25, y + ph + ah, az + 0.25, C.SOLID | C.ANCHOR, b);
              this.world.addPerch(ax, y + ph + ah, az, 'antenna');
            }
          }
        }
        for (let i = 0, n = r.int(2, 6); i < n; i++) if ((s = take())) { const hw = 1.2 + r() * 1.2, hh = 1.4 + r(), hd = 1 + r(); hv.add(mat4(s[0], y, s[1], 0, hw * 2, hh, hd * 2).clone()); solidBox(s[0], s[1], hw, hd, hh); }
        if (r() < 0.12) { const sol = this.instances('solar', SR.props.solar, this.M.propMetal, { detail: 1 }); for (let i = 0; i < 4; i++) if ((s = take())) for (let a = -1; a <= 1; a += 2) sol.add(mat4(s[0] + a * 0.95, y, s[1]).clone()); }
      }
    }

    // ------------------------------------------------------------------ streets
    buildStreets() {
      const L = this.L, r = this.rnd;
      const HX = W.islandHalfX, HZ = W.islandHalfZ;
      // Island asphalt base, split into chunk-sized tiles.
      for (let x = -HX; x < HX; x += HX) for (let z = -HZ; z < HZ; z += 500) this.gb(x + 1, z + 1, 'asphalt').flat(x, z, x + HX, Math.min(z + 500, HZ), 0, [1, 1, 1]);

      // Blocks: raised sidewalks with curbs (park and supertall plaza get their own surface).
      for (const blk of L.blocks) {
        const cx = (blk.x0 + blk.x1) / 2, cz = (blk.z0 + blk.z1) / 2;
        const mat = blk.kind === 'park' ? null : blk.kind === 'supertall' ? 'plazaPavers' : 'sidewalk';
        if (!mat) continue;
        const g = this.gb(cx, cz, mat);
        g.flat(blk.x0, blk.z0, blk.x1, blk.z1, 0.15, [1, 1, 1], 1);
        g.box(blk.x0, 0, blk.z0, blk.x1, 0.15, blk.z1, [0.8, 0.8, 0.78], 1 | 2 | 16 | 32);
      }

      const mk = (x, z) => this.gb(x, z, 'marking');
      const WHITE = [0.95, 0.95, 0.92], YELLOW = [0.95, 0.75, 0.15];
      const yM = 0.02;
      const arrows = (x, z) => this.gb(x, z, 'arrow');
      const arrowQuad = (g, x, z, dirx, dirz) => {
        // 1.4 m x 5 m arrow pointing along (dirx, dirz)
        const hw = 0.7, hl = 2.5, px = -dirz, pz = dirx;
        const P = (a, b) => [x + px * a + dirx * b, yM + 0.01, z + pz * a + dirz * b];
        g.quad(P(-hw, -hl), P(hw, -hl), P(hw, hl), P(-hw, hl), 0, 1, 0, [0, 0, 1, 0, 1, 1, 0, 1], [1, 1, 1]);
      };

      // Avenue segments between cross streets.
      for (const a of L.avenues) {
        for (let k = 0; k + 1 < L.streets.length; k++) {
          const z0 = L.streets[k].z1, z1 = L.streets[k + 1].z0, zc = (z0 + z1) / 2;
          if (a.x > W.park.x0 && a.x < W.park.x1 && zc > W.park.z0 && zc < W.park.z1) continue;
          const g = mk(a.x, zc);
          g.flat(a.x - 0.4, z0 + 4, a.x - 0.15, z1 - 4, yM, YELLOW);
          g.flat(a.x + 0.15, z0 + 4, a.x + 0.4, z1 - 4, yM, YELLOW);
          for (const lx of [a.x0 + 9.5, a.x1 - 9.5]) for (let z = z0 + 6; z < z1 - 8; z += 9) g.flat(lx - 0.08, z, lx + 0.08, z + 3, yM, WHITE);
          for (const lx of [a.x0 + 3, a.x1 - 3]) g.flat(lx - 0.07, z0 + 4, lx + 0.07, z1 - 4, yM, WHITE);
          // Crosswalks (zebra) at both ends + stop lines.
          for (const [zz, dir] of [[z0, 1], [z1, -1]]) {
            for (let x = a.x0 + 0.8; x < a.x1 - 0.8; x += 1.3) g.flat(x, Math.min(zz + dir * 0.6, zz + dir * 3.6), x + 0.65, Math.max(zz + dir * 0.6, zz + dir * 3.6), yM, WHITE);
          }
          g.flat(a.x0 + 5, z1 - 4.4, a.x - 0.5, z1 - 3.9, yM, WHITE);   // southbound stop line (west half)
          g.flat(a.x + 0.5, z0 + 3.9, a.x1 - 5, z0 + 4.4, yM, WHITE);   // northbound stop line (east half)
          const ag = arrows(a.x, zc);
          for (const lx of [a.x0 + 7.25, a.x0 + 11.75]) arrowQuad(ag, lx, z1 - 9, 0, 1);
          for (const lx of [a.x1 - 7.25, a.x1 - 11.75]) arrowQuad(ag, lx, z0 + 9, 0, -1);
        }
      }
      // Street segments between avenues (per block column).
      for (const s of L.streets) {
        for (const c of L.columns) {
          const xc = (c.x0 + c.x1) / 2;
          if (xc > W.park.x0 && xc < W.park.x1 && s.z > W.park.z0 && s.z < W.park.z1) continue;
          const g = mk(xc, s.z);
          const x0 = c.x0, x1 = c.x1;
          g.flat(x0 + 4, s.z - 0.3, x1 - 4, s.z - 0.12, yM, YELLOW);
          g.flat(x0 + 4, s.z + 0.12, x1 - 4, s.z + 0.3, yM, YELLOW);
          for (const lz of [s.z0 + 2.5, s.z1 - 2.5]) g.flat(x0 + 4, lz - 0.07, x1 - 4, lz + 0.07, yM, WHITE);
          const isAvenueEnd = (x) => L.avenues.some((a) => Math.abs(a.x1 - x) < 0.5 || Math.abs(a.x0 - x) < 0.5);
          for (const [xx, dir] of [[x0, 1], [x1, -1]]) {
            if (!isAvenueEnd(xx)) continue;
            for (let z = s.z0 + 0.6; z < s.z1 - 0.6; z += 1.3) g.flat(Math.min(xx + dir * 0.6, xx + dir * 3.6), z, Math.max(xx + dir * 0.6, xx + dir * 3.6), z + 0.65, yM, WHITE);
          }
          const ag = arrows(xc, s.z);
          if (isAvenueEnd(x1)) arrowQuad(ag, x1 - 9, s.z1 - 5.75, 1, 0);
          if (isAvenueEnd(x0)) arrowQuad(ag, x0 + 9, s.z0 + 5.75, -1, 0);
        }
      }
      // Riverside highway lanes.
      for (const side of [-1, 1]) {
        const xm = side * (W.highwayInner + W.highwayOuter) / 2;
        for (let z = -HZ + 40; z < HZ - 40; z += 500) {
          const g = mk(xm, z + 1);
          for (let zz = z; zz < Math.min(z + 500, HZ - 40); zz += 12) for (const off of [-12, -6, 6, 12]) g.flat(xm + off - 0.08, zz, xm + off + 0.08, zz + 4, yM, WHITE);
        }
      }
      void r;
    }

    // Diagonal boulevard and its plazas, built by clipping blocks against the strip.
    buildBoulevard() {
      const L = this.L, B = L.boulevard, W0 = W.boulevard;
      const ent = L.plazas.ent, green = L.plazas.green;
      const zones = [{ s0: ent.s - ent.halfLen, s1: ent.s + ent.halfLen, kind: 'ent', hw: 40 }, { s0: green.s - green.halfLen, s1: green.s + green.halfLen, kind: 'green', hw: 42 }].sort((a, b) => a.s0 - b.s0);
      const ranges = [];
      let s = -1e5;
      for (const z of zones) { ranges.push({ s0: s, s1: z.s0, kind: 'plain', hw: 24 }); ranges.push(z); s = z.s1; }
      ranges.push({ s0: s, s1: 1e5, kind: 'plain', hw: 24 });
      const hp = {
        dLess: (w) => [-B.nx, -B.nz, w + W0.x0 * B.nx + W0.z0 * B.nz],
        dMore: (w) => [B.nx, B.nz, -w - W0.x0 * B.nx - W0.z0 * B.nz],
        sMore: (s0) => [B.ux, B.uz, -s0 - W0.x0 * B.ux - W0.z0 * B.uz],
        sLess: (s1) => [-B.ux, -B.uz, s1 + W0.x0 * B.ux + W0.z0 * B.uz],
      };
      const roadHW = 12;
      this.greenPieces = [];
      this.entPieces = [];
      for (const blk of L.blocks) {
        if (blk.kind === 'park' || blk.kind === 'supertall') continue;
        const rect = [[blk.x0, blk.z1], [blk.x1, blk.z1], [blk.x1, blk.z0], [blk.x0, blk.z0]];
        for (const rg of ranges) {
          let base = clip(rect, ...hp.sMore(rg.s0));
          base = clip(base, ...hp.sLess(rg.s1));
          if (base.length < 3) continue;
          // road strip
          let road = clip(clip(base, ...hp.dLess(roadHW)), ...hp.dMore(-roadHW));
          const roadMat = rg.kind === 'ent' ? 'redPavers' : 'boulevard';
          if (road.length >= 3) { this.fan(road, 0.17, roadMat); if (rg.kind === 'ent') this.entPieces.push(road); }
          for (const side of [1, -1]) {
            let piece = side > 0 ? clip(clip(base, ...hp.dMore(roadHW)), ...hp.dLess(rg.hw)) : clip(clip(base, ...hp.dLess(-roadHW)), ...hp.dMore(-rg.hw));
            if (piece.length < 3) continue;
            const m = rg.kind === 'ent' ? 'redPavers' : rg.kind === 'green' ? 'grass' : 'plazaPavers';
            this.fan(piece, rg.kind === 'green' ? 0.18 : 0.17, m);
            if (rg.kind === 'green') this.greenPieces.push(piece);
            if (rg.kind === 'ent') this.entPieces.push(piece);
          }
        }
      }
      this.buildGreenPlaza();
    }

    fan(pts, y, mat, col) {
      if (polyArea(pts) > 0) pts = pts.slice().reverse();
      const [cx, cz] = centroid(pts);
      const g = this.gb(cx, cz, mat);
      const c = col || [1, 1, 1], s = 1;
      for (let i = 1; i + 1 < pts.length; i++) {
        const a = pts[0], b = pts[i], d = pts[i + 1];
        g.quad([a[0], y, a[1]], [b[0], y, b[1]], [d[0], y, d[1]], [d[0], y, d[1]], 0, 1, 0, [a[0] * s, -a[1] * s, b[0] * s, -b[1] * s, d[0] * s, -d[1] * s, d[0] * s, -d[1] * s], c);
      }
    }

    buildGreenPlaza() {
      if (!this.greenPieces.length) return;
      const best = this.greenPieces.reduce((a, b) => (Math.abs(polyArea(b)) > Math.abs(polyArea(a)) ? b : a));
      const [fx, fz] = centroid(best);
      this.fountain = { x: fx, z: fz };
      const r = this.rnd;
      // Paths radiating from the fountain to each corner of the triangle.
      for (const p of best) {
        const dx = p[0] - fx, dz = p[1] - fz, len = Math.hypot(dx, dz), px = -dz / len * 1.6, pz = dx / len * 1.6;
        this.fan([[fx + px, fz + pz], [p[0] + px, p[1] + pz], [p[0] - px, p[1] - pz], [fx - px, fz - pz]], 0.2, 'path');
      }
      // Fountain: basin, water, central column with tiers.
      const g = this.gb(fx, fz, 'trim');
      const basin = new THREE.CylinderGeometry(6.5, 6.8, 0.7, 32), rim = new THREE.CylinderGeometry(1.2, 1.6, 2.4, 16), bowl = new THREE.CylinderGeometry(2.6, 1.0, 0.5, 20);
      g.addGeometry(basin, mat4(fx, 0.5, fz), [0.85, 0.82, 0.76]);
      g.addGeometry(rim, mat4(fx, 1.4, fz), [0.82, 0.8, 0.74]);
      g.addGeometry(bowl, mat4(fx, 2.8, fz), [0.82, 0.8, 0.74]);
      this.fan(Array.from({ length: 24 }, (_, i) => [fx + Math.cos(i / 24 * 6.283) * 6.1, fz + Math.sin(i / 24 * 6.283) * 6.1]), 0.8, 'pondWater');
      this.col.add(fx - 6.5, 0, fz - 6.5, fx + 6.5, 0.85, fz + 6.5, C.SOLID, null);
      const spray = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.5, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide }));
      spray.position.set(fx, 4.6, fz); spray.rotation.x = Math.PI;
      this.scene.add(spray);
      this.animated.push((t) => { spray.scale.set(1 + Math.sin(t * 6) * 0.05, 1 + Math.sin(t * 4.3) * 0.08, 1 + Math.cos(t * 5) * 0.05); });
      // Café tables and umbrellas around the fountain.
      const cafe = this.instances('cafe', SR.props.cafe, this.M.prop, { detail: 1 });
      const umb = this.instances('umbrella', SR.props.umbrella, this.M.prop, { detail: 1 });
      for (let i = 0; i < 26; i++) {
        const a = r() * 6.28, d = 10 + r() * 14, x = fx + Math.cos(a) * d, z = fz + Math.sin(a) * d;
        if (!this.pointInPoly([x, z], best)) continue;
        cafe.add(mat4(x, 0.18, z, r() * 3).clone());
        if (r() < 0.6) umb.add(mat4(x, 0.18, z).clone(), new THREE.Color().setHSL(r() < 0.5 ? 0.02 : 0.58, 0.6, 0.5));
      }
      this.plazaCrowd = { x: fx, z: fz, poly: best };
      this.world.layout.pois.find((p) => p.name === 'Fountain Triangle').x = fx;
      this.world.layout.pois.find((p) => p.name === 'Fountain Triangle').z = fz;
    }

    pointInPoly(p, poly) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      }
      return inside;
    }

    // ------------------------------------------------------------------ park
    buildPark() {
      const P = W.park, r = this.rnd, L = this.L;
      for (let z = P.z0; z < P.z1; z += 250) this.gb((P.x0 + P.x1) / 2, z + 1, 'grass').flat(P.x0, z, P.x1, Math.min(P.z1, z + 250), 0.15, [1, 1, 1]);
      // Stone wall around the edge (colliders were added by the world).
      for (const w of L.parkWall) this.gb((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2, 'trim').box(w.x0, 0, w.z0, w.x1, w.h, w.z1, [0.72, 0.68, 0.6], 63 & ~8);
      // Paths: perimeter loop, a north–south drive, and diagonals.
      const segs = [];
      const loop = [[P.x0 + 18, P.z0 + 18], [P.x1 - 18, P.z0 + 18], [P.x1 - 18, P.z1 - 18], [P.x0 + 18, P.z1 - 18]];
      for (let i = 0; i < 4; i++) segs.push([loop[i], loop[(i + 1) % 4], 5]);
      segs.push([[P.x0 + 90, P.z0 + 18], [P.x0 + 110, P.z1 - 18], 6]);
      segs.push([[P.x0 + 18, P.z0 + 200], [P.x1 - 18, P.z0 + 380], 3.5]);
      segs.push([[P.x1 - 18, P.z0 + 120], [P.x0 + 18, P.z0 + 330], 3.5]);
      segs.push([[P.x0 + 18, P.z1 - 160], [P.x1 - 18, P.z1 - 40], 3.5]);
      for (const k of [2, 6, 10, 14]) { const z = P.z0 + (P.z1 - P.z0) * k / 16; segs.push([[P.x0, z], [P.x0 + 18, z], 3]); segs.push([[P.x1 - 18, z], [P.x1, z], 3]); }
      for (const [a, b, w] of segs) {
        const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), px = -dz / len * w / 2, pz = dx / len * w / 2;
        this.fan([[a[0] + px, a[1] + pz], [b[0] + px, b[1] + pz], [b[0] - px, b[1] - pz], [a[0] - px, a[1] - pz]], 0.17, 'path');
      }
      this.parkPaths = segs;
      // Pond with a stone rim.
      for (const pd of L.ponds) {
        const pts = Array.from({ length: 40 }, (_, i) => [pd.x + Math.cos(i / 40 * 6.283) * pd.rx, pd.z + Math.sin(i / 40 * 6.283) * pd.rz]);
        this.fan(pts, 0.19, 'pondWater');
        const g = this.gb(pd.x, pd.z, 'trim');
        for (let i = 0; i < 40; i++) {
          const a0 = i / 40 * 6.283, a1 = (i + 1) / 40 * 6.283;
          const o = (a, k) => [pd.x + Math.cos(a) * (pd.rx + k), pd.z + Math.sin(a) * (pd.rz + k)];
          const A = o(a0, 0), B = o(a1, 0), C2 = o(a1, 1.6), D = o(a0, 1.6);
          g.quad([A[0], 0.32, A[1]], [D[0], 0.32, D[1]], [C2[0], 0.32, C2[1]], [B[0], 0.32, B[1]], 0, 1, 0, [0, 0, 1, 0, 1, 1, 0, 1], [0.7, 0.68, 0.62]);
        }
      }
      // Dense deciduous trees. Tall ones can be web anchors (the only anchors in the park).
      const tree = this.instances('tree', SR.props.tree, this.M.foliage, { castShadow: true });
      const distSeg = (x, z, a, b) => {
        const dx = b[0] - a[0], dz = b[1] - a[1], t = U.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
        return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
      };
      let placed = 0;
      for (let i = 0; i < 5200 && placed < 1900; i++) {
        const x = P.x0 + 4 + r() * (P.x1 - P.x0 - 8), z = P.z0 + 4 + r() * (P.z1 - P.z0 - 8);
        if (L.ponds.some((p) => ((x - p.x) / (p.rx + 5)) ** 2 + ((z - p.z) / (p.rz + 5)) ** 2 < 1)) continue;
        if (segs.some(([a, b, w]) => distSeg(x, z, a, b) < w / 2 + 2.5)) continue;
        // leave a few open meadows
        if ((Math.hypot(x - (P.x0 + 200), z - (P.z0 + 520)) < 45) || (Math.hypot(x - (P.x0 + 150), z - (P.z0 + 110)) < 40)) continue;
        const h = 9 + Math.pow(r(), 0.8) * 15;
        tree.add(mat4(x, 0.15, z, r() * 6.3, h * (0.85 + r() * 0.3), h, h * (0.85 + r() * 0.3)).clone(), this.autumn(r, 0.35));
        if (h > 15) this.col.add(x - h * 0.28, 0.15 + h * 0.4, z - h * 0.28, x + h * 0.28, 0.15 + h * 0.95, z + h * 0.28, C.ANCHOR | C.TREE, null);
        placed++;
      }
      this.parkTrees = placed;
    }

    autumn(r, greenBias) {
      const k = r();
      const c = new THREE.Color();
      if (k < (greenBias || 0.15)) c.setRGB(0.32 + r() * 0.1, 0.5 + r() * 0.12, 0.18);
      else if (k < 0.45) c.setRGB(0.95, 0.42 + r() * 0.12, 0.08);          // orange
      else if (k < 0.7) c.setRGB(0.97, 0.62 + r() * 0.1, 0.12);            // amber
      else if (k < 0.88) c.setRGB(0.95, 0.8 + r() * 0.08, 0.22);           // yellow
      else c.setRGB(0.78, 0.22 + r() * 0.1, 0.1);                           // red
      return c;
    }

    // ------------------------------------------------------------------ street furniture
    buildStreetFurniture() {
      const L = this.L, r = this.rnd;
      const tree = this.instances('tree', SR.props.tree, this.M.foliage, { castShadow: true });
      const lamp = this.instances('lamp', SR.props.lamp, this.M.propMetal, { detail: 1 });
      const hyd = this.instances('hydrant', SR.props.hydrant, this.M.prop, { detail: 2 });
      const news = this.instances('newsbox', SR.props.newsbox, this.M.prop, { detail: 2 });
      const bin = this.instances('bin', SR.props.bin, this.M.prop, { detail: 2 });
      const rack = this.instances('bikerack', SR.props.bikerack, this.M.propMetal, { detail: 2 });
      const sig = this.instances('signal', SR.props.signal, this.M.propMetal, { detail: 1 });
      this.signalPoses = [];
      const Y = 0.15;
      for (const blk of L.blocks) {
        if (blk.kind === 'park') continue;
        const cx = (blk.x0 + blk.x1) / 2, cz = (blk.z0 + blk.z1) / 2;
        const residential = L.tallness(cz) < 0.5;
        const nearBoulevard = (x, z) => Math.abs(L.boulevardDist(x, z)) < 26;
        // Street (east–west) edges: trees, lamps, hydrants.
        for (const [z, dir] of [[blk.z0 + 1.2, -1], [blk.z1 - 1.2, 1]]) {
          for (let x = blk.x0 + 8; x < blk.x1 - 8; x += 13 + r() * 3) {
            if (nearBoulevard(x, z)) continue;
            if (residential && r() < 0.85) tree.add(mat4(x, Y, z, r() * 6.3, 7 + r() * 3.5).clone(), this.autumn(r));
          }
          for (let x = blk.x0 + 15; x < blk.x1 - 10; x += 34) {
            if (nearBoulevard(x, z)) continue;
            lamp.add(mat4(x + 4, Y, z + dir * 0.4, dir > 0 ? 0 : Math.PI).clone());
            this.world.addPerch(x + 4, Y + 6.95, z + dir * 2.2, 'lamp');
            if (r() < 0.35) hyd.add(mat4(x + 11, Y, z + dir * 0.3, r() * 6).clone());
            if (r() < 0.2) rack.add(mat4(x - 6, Y, z - dir * 1.2, 0).clone());
          }
        }
        // Avenue (north–south) edges.
        for (const [x, dir] of [[blk.x0 + 1.2, -1], [blk.x1 - 1.2, 1]]) {
          if (Math.abs(Math.abs(x) - W.highwayInner) < 3) continue;
          for (let z = blk.z0 + 8; z < blk.z1 - 8; z += 14 + r() * 4) {
            if (nearBoulevard(x, z)) continue;
            if (residential && r() < 0.5) tree.add(mat4(x, Y, z, r() * 6.3, 7 + r() * 3.5).clone(), this.autumn(r));
          }
          const z = cz + (r() - 0.5) * 20;
          if (!nearBoulevard(x, z)) {
            lamp.add(mat4(x + dir * 0.4, Y, z, dir > 0 ? Math.PI / 2 : -Math.PI / 2).clone());
            this.world.addPerch(x + dir * 2.2, Y + 6.95, z, 'lamp');
          }
        }
        // Corners: bins and newspaper boxes.
        for (const [x, z] of [[blk.x0 + 2.2, blk.z0 + 2.2], [blk.x1 - 2.2, blk.z1 - 2.2]]) {
          if (nearBoulevard(x, z)) continue;
          if (r() < 0.7) bin.add(mat4(x, Y, z).clone());
          if (r() < 0.5) news.add(mat4(x + 1.2, Y, z, r() < 0.5 ? 0 : Math.PI / 2).clone(), new THREE.Color().setHSL(r.pick([0, 0.6, 0.12, 0.33]), 0.6, 0.45));
        }
      }
      // Traffic signals: two mast arms per avenue × street intersection.
      for (const a of L.avenues) for (const s of L.streets) {
        const inPark = a.x > W.park.x0 && a.x < W.park.x1 && s.z > W.park.z0 && s.z < W.park.z1;
        if (inPark) continue;
        // Arm over the avenue's southbound lanes, from the NW corner, reaching east (+x).
        const p1 = [a.x0 - 1.0, s.z0 - 1.0];
        sig.add(mat4(p1[0], Y, p1[1], Math.PI / 2).clone());
        this.world.addPerch(p1[0] + 8.5, 7.05, p1[1], 'signal');
        // Arm over the street's eastbound lanes, from the SE corner, reaching north (−z).
        const p2 = [a.x1 + 1.0, s.z1 + 1.0];
        sig.add(mat4(p2[0], Y, p2[1], Math.PI).clone());
        this.world.addPerch(p2[0], 7.05, p2[1] - 8.5, 'signal');
        this.signalPoses.push({ x: p1[0], z: p1[1], ry: Math.PI / 2, axis: 'ns' }, { x: p2[0], z: p2[1], ry: Math.PI, axis: 'ew' });
      }
    }

    // ------------------------------------------------------------------ waterfront
    buildWaterfront() {
      const L = this.L, HX = W.islandHalfX, HZ = W.islandHalfZ, r = this.rnd;
      // Promenades along the island edge, with railings and a stone sea wall.
      for (const side of [-1, 1]) {
        for (let z = -HZ; z < HZ; z += 500) {
          const x0 = side > 0 ? W.highwayOuter : -HX, x1 = side > 0 ? HX : -W.highwayOuter;
          this.gb(side * 700, z + 1, 'plazaPavers').flat(x0, z, x1, z + 500, 0.15, [0.95, 0.95, 0.95]);
          const g = this.gb(side * 700, z + 1, 'trim');
          g.box(x0, 0, z, x1, 0.15, z + 500, [0.8, 0.8, 0.78], side > 0 ? 2 : 1);
          const rx = side * (HX - 0.3);
          g.box(rx - 0.06, 0.15, z, rx + 0.06, 1.15, z + 500, [0.35, 0.37, 0.4], 63);
          const sx = side * HX;
          g.box(Math.min(sx, sx + side * 0.01), W.waterY - 3, z, Math.max(sx, sx + side * 0.01), 0, z + 500, [0.55, 0.53, 0.5], side > 0 ? 1 : 2);
          this.col.add(rx - 0.1, 0, z, rx + 0.1, 1.15, z + 500, C.SOLID, null);
          // Jersey barrier between highway carriageways.
          const bx = side * (W.highwayInner + W.highwayOuter) / 2;
          g.box(bx - 0.3, 0, z, bx + 0.3, 0.85, z + 500, [0.75, 0.74, 0.7], 63 & ~8);
          this.col.add(bx - 0.3, 0, z, bx + 0.3, 0.85, z + 500, C.SOLID, null);
        }
      }
      for (const zs of [-1, 1]) {
        const z0 = zs > 0 ? W.firstStreetZ + (W.streetCount - 1) * W.streetPitch + 9 : -HZ, z1 = zs > 0 ? HZ : W.firstStreetZ - 9;
        for (let x = -HX; x < HX; x += HX) this.gb(x + 1, zs * 1900, 'plazaPavers').flat(x, z0, x + HX, z1, 0.15, [0.95, 0.95, 0.95]);
        const g = this.gb(0, zs * 1990, 'trim');
        const rz = zs * (HZ - 0.3);
        g.box(-HX, 0.15, rz - 0.06, HX, 1.15, rz + 0.06, [0.35, 0.37, 0.4], 63);
        g.box(-HX, W.waterY - 3, zs > 0 ? HZ - 0.01 : -HZ, HX, 0, zs > 0 ? HZ : -HZ + 0.01, [0.55, 0.53, 0.5], zs > 0 ? 16 : 32);
        this.col.add(-HX, 0, rz - 0.1, HX, 1.15, rz + 0.1, C.SOLID, null);
      }
      // Piers along the west shore, some with sheds.
      for (const p of L.piers) {
        const g = this.gb(p.x0, (p.z0 + p.z1) / 2, 'wood');
        g.box(p.x0, -1.4, p.z0, p.x1, 0.05, p.z1, [1, 1, 1], 63 & ~8);
        if (r() < 0.6) {
          const sx0 = p.x0 + 20, sx1 = p.x0 + 20 + 50 + r() * 50, sh = 7 + r() * 5;
          const t = this.gb(p.x0, (p.z0 + p.z1) / 2, 'limestone');
          t.box(sx0, 0, p.z0 + 2, sx1, sh, p.z1 - 2, [0.8, 0.82, 0.85], 1 | 2 | 16 | 32, 0, 0);
          this.gb(p.x0, (p.z0 + p.z1) / 2, 'roof').flat(sx0, p.z0 + 2, sx1, p.z1 - 2, sh, [0.8, 0.8, 0.8]);
          this.col.add(sx0, 0, p.z0 + 2, sx1, sh, p.z1 - 2, C.SOLID | C.ANCHOR, null);
          this.world.addPerch(sx0 + 0.4, sh, p.z0 + 2.4, 'ledge');
        }
      }
    }

    // ------------------------------------------------------------------ bridges (seen, not reached)
    buildBridges() {
      for (const b of this.L.bridges) {
        const g = this.gb(b.x0 + b.side * 500, b.z, 'bridge');
        const xa = b.x0, xb = b.x1, xmin = Math.min(xa, xb), xmax = Math.max(xa, xb), z = b.z, hw = 13;
        g.box(xmin, b.deck - 3, z - hw, xmax, b.deck, z + hw, [0.8, 0.8, 0.8]);
        g.box(xmin, b.deck, z - hw, xmax, b.deck + 1.2, z - hw + 0.4, [0.6, 0.6, 0.6]);
        g.box(xmin, b.deck, z + hw - 0.4, xmax, b.deck + 1.2, z + hw, [0.6, 0.6, 0.6]);
        const span = xmax - xmin, t1 = xmin + span * 0.22, t2 = xmax - span * 0.22;
        for (const tx of [t1, t2]) {
          for (const zz of [z - hw - 1, z + hw + 1]) g.box(tx - 3, W.waterY - 2, zz - 2.5, tx + 3, b.tower, zz + 2.5, [0.85, 0.83, 0.8]);
          for (const yy of [b.deck + 25, b.tower - 20, b.tower - 4]) g.box(tx - 2.5, yy, z - hw - 1, tx + 2.5, yy + 4, z + hw + 1, [0.85, 0.83, 0.8]);
        }
        // Approach piers under the deck.
        for (let x = xmin + 60; x < xmax; x += 120) if (x < t1 - 40 || x > t2 + 40) g.box(x - 3, W.waterY - 2, z - 8, x + 3, b.deck - 3, z + 8, [0.75, 0.74, 0.72]);
        // Main cables (catenary) + suspenders.
        const cable = (zz) => {
          const pts = [];
          const push = (x0, y0, x1, y1, sag, n) => { for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t; pts.push(new V3(x, y0 + (y1 - y0) * t - sag * 4 * t * (1 - t), zz)); } };
          push(xmin, b.deck + 2, t1, b.tower, 12, 10);
          push(t1, b.tower, t2, b.tower, b.tower - b.deck - 6, 40);
          push(t2, b.tower, xmax, b.deck + 2, 12, 10);
          const curve = new THREE.CatmullRomCurve3(pts);
          g.addGeometry(new THREE.TubeGeometry(curve, 120, 0.7, 6, false), new M4(), [0.7, 0.72, 0.74]);
          for (let x = t1 + 12; x < t2 - 6; x += 12) {
            const t = (x - t1) / (t2 - t1), y = b.tower - (b.tower - b.deck - 6) * 4 * t * (1 - t);
            g.box(x - 0.1, b.deck, zz - 0.1, x + 0.1, y, zz + 0.1, [0.6, 0.62, 0.64]);
          }
        };
        cable(z - hw - 1); cable(z + hw + 1);
      }
    }

    // ------------------------------------------------------------------ mainland skyline
    buildMainland() {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.MeshStandardMaterial({ color: 0x2f4a5c, roughness: 0.18, metalness: 0.1 }));
      water.rotation.x = -Math.PI / 2; water.position.y = W.waterY;
      water.receiveShadow = true;
      this.scene.add(water);
      this.water = water;
      const r = U.rng(77);
      const far = new SR.GeoBuilder();
      const ground = new SR.GeoBuilder();
      ground.flat(W.eastMainlandX, -7000, 9000, 7000, 0.5, [0.52, 0.5, 0.47]);
      ground.flat(-9000, -7000, W.westMainlandX, 7000, 0.5, [0.52, 0.5, 0.47]);
      ground.flat(W.westMainlandX, -7000, W.eastMainlandX, -2700, 0.5, [0.5, 0.49, 0.46]);
      const addBlock = (x0, x1, z0, z1, tallChance) => {
        for (let i = 0; i < 900; i++) {
          const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
          const w = 20 + r() * 40, d = 20 + r() * 40;
          const tall = r() < tallChance, h = tall ? 60 + r() * 140 : 8 + r() * 30;
          const c = tall ? [0.62 + r() * 0.1, 0.68 + r() * 0.1, 0.78 + r() * 0.1] : [0.72 + r() * 0.15, 0.6 + r() * 0.12, 0.52 + r() * 0.1];
          far.box(x - w / 2, 0.5, z - d / 2, x + w / 2, h, z + d / 2, c, 63 & ~8);
        }
      };
      addBlock(W.eastMainlandX + 60, W.eastMainlandX + 2600, -3500, 3500, 0.06);
      addBlock(W.westMainlandX - 2600, W.westMainlandX - 60, -3500, 3500, 0.08);
      addBlock(-2500, 2500, -5200, -2800, 0.05);
      const mesh = new THREE.Mesh(far.build(), this.M.far);
      mesh.receiveShadow = false;
      this.scene.add(mesh);
      const gm = new THREE.Mesh(ground.build(), this.M.far);
      this.scene.add(gm);
      this.meshes.push(mesh, gm);
    }

    // ------------------------------------------------------------------ entertainment district
    buildEntertainment() {
      const L = this.L, ent = L.plazas.ent, r = U.rng(31);
      const cx = ent.x, cz = ent.z;
      // Planters, umbrellas, café tables across the red pedestrian plaza.
      const planter = this.instances('planter', SR.props.planter, this.M.prop, { detail: 1 });
      const umb = this.instances('umbrella', SR.props.umbrella, this.M.prop, { detail: 1 });
      const cafe = this.instances('cafe', SR.props.cafe, this.M.prop, { detail: 1 });
      const B = L.boulevard;
      for (let s = -150; s <= 150; s += 12) {
        for (const off of [-18, 18]) {
          const x = cx + B.ux * s + B.nx * off, z = cz + B.uz * s + B.nz * off;
          if (!this.entPieces.some((p) => this.pointInPoly([x, z], p))) continue;
          const kind = r();
          if (kind < 0.4) { planter.add(mat4(x, 0.17, z, Math.atan2(B.ux, B.uz)).clone()); this.col.add(x - 1.1, 0, z - 1.1, x + 1.1, 0.95, z + 1.1, C.SOLID, null); }
          else if (kind < 0.8) { cafe.add(mat4(x, 0.17, z, r() * 3).clone()); umb.add(mat4(x, 0.17, z).clone(), new THREE.Color().setHSL(r.pick([0, 0.95, 0.08]), 0.7, 0.5)); }
        }
      }
      // Ticket kiosk.
      const kx = cx + B.ux * 40 + B.nx * 6, kz = cz + B.uz * 40 + B.nz * 6;
      const kg = this.gb(kx, kz, 'metal');
      kg.box(kx - 3, 0.17, kz - 2, kx + 3, 3.2, kz + 2, [0.8, 0.12, 0.12]);
      this.col.add(kx - 3, 0, kz - 2, kx + 3, 3.2, kz + 2, C.SOLID | C.ANCHOR, null);
      this.world.addPerch(kx - 2.8, 3.2, kz - 1.8, 'ledge');
      const ks = this.gb(kx, kz, 'signs'), cell = SR.SHOPS.indexOf('SHOW TICKETS');
      const cu = (cell % 4) / 4, cv = 1 - (Math.floor(cell / 4) + 1) / 8;
      ks.quad([kx - 2.8, 3.25, kz + 2.05], [kx + 2.8, 3.25, kz + 2.05], [kx + 2.8, 4.6, kz + 2.05], [kx - 2.8, 4.6, kz + 2.05], 0, 0, 1, [cu, cv, cu + 0.25, cv, cu + 0.25, cv + 0.125, cu, cv + 0.125], [1, 1, 1]);

      // Stacks of huge animated billboards on facades facing the plaza.
      const bbMatBase = this.T.billboards;
      const faces = [];
      for (const b of L.buildings) {
        const bx = (b.x0 + b.x1) / 2, bz = (b.z0 + b.z1) / 2;
        if (Math.hypot(bx - cx, bz - cz) > 230) continue;
        const t = b.tiers[0];
        for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const fx = nx ? (nx > 0 ? t.x1 : t.x0) : bx, fz = nz ? (nz > 0 ? t.z1 : t.z0) : bz;
          const d0 = Math.abs(L.boulevardDist(fx, fz)), d1 = Math.abs(L.boulevardDist(fx + nx * 10, fz + nz * 10));
          const along = Math.abs(L.boulevardAlong(fx, fz) - ent.s);
          if (d1 < d0 && d0 < 75 && along < 175) faces.push({ b, t, nx, nz, fx, fz, width: nz ? t.x1 - t.x0 : t.z1 - t.z0 });
        }
      }
      faces.sort((a, c) => Math.hypot(a.fx - cx, a.fz - cz) - Math.hypot(c.fx - cx, c.fz - cz));
      let tickerDone = false, count = 0;
      for (const f of faces) {
        if (f.width < 12 || f.t.y1 < 24) continue;
        const w = Math.min(f.width - 2, 12 + r() * 10);
        let y = 9 + r() * 3;
        const ry = Math.atan2(f.nx, f.nz);
        if (!tickerDone && f.width >= 20) {
          this.addTicker(f, ry);
          tickerDone = true;
          y = 13;
        }
        const stack = Math.min(3, Math.floor((Math.min(f.t.y1, 80) - y) / 11));
        for (let i = 0; i < stack; i++) {
          const h = 7 + r() * 3, bw = w * (0.8 + r() * 0.2);
          const off = (r() - 0.5) * (f.width - bw);
          const tex = bbMatBase.clone();
          tex.needsUpdate = true;
          tex.repeat.set(0.5, 0.25);
          const cell0 = r.int(0, 7);
          const setCell = (c) => tex.offset.set((c % 2) * 0.5, 1 - (Math.floor(c / 2) + 1) * 0.25);
          setCell(cell0);
          const m = new THREE.Mesh(new THREE.PlaneGeometry(bw, h), new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff }));
          m.position.set(f.fx + f.nx * 0.35 + (f.nz ? off : 0), y + h / 2, f.fz + f.nz * 0.35 + (f.nx ? off : 0));
          m.rotation.y = ry;
          this.scene.add(m);
          // Frame behind the screen.
          // Frame between the facade and the screen.
          const fxA = f.nx ? f.fx : m.position.x - bw / 2 - 0.3, fxB = f.nx ? f.fx + f.nx * 0.3 : m.position.x + bw / 2 + 0.3;
          const fzA = f.nz ? f.fz : m.position.z - bw / 2 - 0.3, fzB = f.nz ? f.fz + f.nz * 0.3 : m.position.z + bw / 2 + 0.3;
          this.gb(f.fx, f.fz, 'metal').box(Math.min(fxA, fxB), y - 0.3, Math.min(fzA, fzB), Math.max(fxA, fxB), y + h + 0.3, Math.max(fzA, fzB), [0.12, 0.12, 0.13]);
          let cell = cell0;
          const period = 3 + r() * 4, phase = r() * period;
          this.animated.push((t) => {
            const c = (cell0 + Math.floor((t + phase) / period)) % 8;
            if (c !== cell) { cell = c; setCell(c); }
          });
          y += h + 2 + r() * 2;
          count++;
        }
        if (count > 22) break;
      }
      this.billboardCount = count;
    }

    addTicker(f, ry) {
      const headlines = ['HEIST ON 7TH AVE', 'MARKET 38,221 ▲0.4%', 'KNIGHTS WIN 104–99', 'FERRY SERVICE RESUMES AT PIER 9', 'MAYOR OPENS NEW BIKE LANES',
        'WEATHER: SUNNY 18°C', 'METEOR SHOWER VISIBLE TONIGHT', 'HARBOR RATS 3 – 1 GULLS', 'TRANSIT FARES UNCHANGED', 'MARKET CLOSE 38,240 ▲0.5%'];
      const c = document.createElement('canvas'); c.width = 4096; c.height = 64;
      const x = c.getContext('2d');
      x.fillStyle = '#050505'; x.fillRect(0, 0, c.width, c.height);
      x.font = 'bold 44px Arial, Helvetica, sans-serif'; x.textBaseline = 'middle'; x.fillStyle = '#ffb000';
      let px = 20;
      for (let i = 0; px < c.width - 200; i++) {
        const t = headlines[i % headlines.length] + '   ·   ';
        x.fillText(t, px, 34);
        px += x.measureText(t).width;
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
      const h = 2.4, w = f.width - 1;
      tex.repeat.x = (w / h) / (c.width / c.height);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
      m.position.set(f.fx + f.nx * 0.4, 9.5, f.fz + f.nz * 0.4);
      m.rotation.y = ry;
      this.scene.add(m);
      this.animated.push((t) => { tex.offset.x = (t * 0.035) % 1; });
      this.ticker = m;
    }

    // ------------------------------------------------------------------ finish
    finish() {
      const castMats = new Set(['brick', 'limestone', 'glass', 'deco', 'trim', 'metal', 'store', 'bridge']);
      this.M.billboard = new THREE.MeshBasicMaterial({ map: this.T.billboards, side: THREE.DoubleSide });
      for (const [key, g] of this.groups) {
        for (const mat in g) {
          if (g[mat].empty) continue;
          const mesh = new THREE.Mesh(g[mat].build(), this.M[mat]);
          mesh.castShadow = castMats.has(mat) && key !== 'far';
          mesh.receiveShadow = true;
          mesh.userData.chunk = key;
          mesh.userData.detail = mat === 'marking' || mat === 'arrow' || mat === 'signs' ? 1 : 0;
          this.scene.add(mesh);
          this.meshes.push(mesh);
        }
      }
      for (const k in this.inst) this.meshes.push(...this.inst[k].build());
    }

    update(t) { for (const f of this.animated) f(t); }
  }

  // Foliage fades out (dithered) where it sits between the camera and the hero.
  SR.foliageUniforms = { uCamPos: { value: new THREE.Vector3() }, uHeroPos: { value: new THREE.Vector3() } };
  SR.makeFoliageMaterial = function () {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uCamPos = SR.foliageUniforms.uCamPos;
      sh.uniforms.uHeroPos = SR.foliageUniforms.uHeroPos;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFadeWorld;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          vec4 fw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            fw = instanceMatrix * fw;
          #endif
          vFadeWorld = (modelMatrix * fw).xyz;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFadeWorld;\nuniform vec3 uCamPos;\nuniform vec3 uHeroPos;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          {
            vec3 seg = uHeroPos - uCamPos;
            float len2 = max(dot(seg, seg), 1e-4);
            float t = clamp(dot(vFadeWorld - uCamPos, seg) / len2, 0.0, 1.0);
            float d = length(vFadeWorld - (uCamPos + seg * t));
            float fade = (1.0 - smoothstep(1.2, 3.2, d)) * step(t, 0.97);
            float n = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
            if (fade > n * 0.95) discard;
          }`);
    };
    return m;
  };

  SR.City = City;
})();
