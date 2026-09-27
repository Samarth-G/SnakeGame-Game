// World: owns the layout, the collision database, perch points and the visuals.
(function () {
  const W = SR.WORLD;
  const C = SR.Collision;

  class World {
    constructor(scene) {
      this.scene = scene;
      this.layout = SR.buildLayout();
      this.col = new C(32);
      this.perches = [];
      this.perchGrid = new Map();
      this.addStaticColliders();
    }

    // Base terrain height: island and piers at 0, everything else is river.
    baseGround(x, z) {
      if (Math.abs(x) <= W.islandHalfX && Math.abs(z) <= W.islandHalfZ) return 0;
      for (const p of this.layout.piers) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return 0;
      return -Infinity;
    }

    addStaticColliders() {
      const L = this.layout, col = this.col;
      for (const b of L.buildings) {
        for (const t of b.tiers) {
          col.add(t.x0, t.y0, t.z0, t.x1, t.y1, t.z1, C.SOLID | C.ANCHOR, b);
          // Perch spots on the corners of each roof / setback.
          const ins = 0.35;
          for (const [x, z] of [[t.x0 + ins, t.z0 + ins], [t.x1 - ins, t.z0 + ins], [t.x0 + ins, t.z1 - ins], [t.x1 - ins, t.z1 - ins]]) {
            this.addPerch(x, t.y1, z, 'ledge');
          }
        }
        if (b.spire) {
          const s = b.spire, r = b.arch === 'supertall' ? 1.1 : 0.6;
          col.add(s.x - r, s.y0, s.z - r, s.x + r, s.y1, s.z + r, C.SOLID | C.ANCHOR, b);
          this.addPerch(s.x, s.y1, s.z, 'spire');
        }
      }
      for (const w of L.parkWall) col.add(w.x0, 0, w.z0, w.x1, w.h, w.z1, C.SOLID, null);
    }

    addPerch(x, y, z, kind) {
      const p = { x, y, z, kind };
      this.perches.push(p);
      const k = Math.floor(x / 64) * 65536 + Math.floor(z / 64);
      let cell = this.perchGrid.get(k);
      if (!cell) { cell = []; this.perchGrid.set(k, cell); }
      cell.push(p);
      return p;
    }

    perchesNear(x, z, r, out) {
      out.length = 0;
      const ix0 = Math.floor((x - r) / 64), ix1 = Math.floor((x + r) / 64);
      const iz0 = Math.floor((z - r) / 64), iz1 = Math.floor((z + r) / 64);
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
        const cell = this.perchGrid.get(ix * 65536 + iz);
        if (cell) for (const p of cell) out.push(p);
      }
      return out;
    }

    finalize() { this.col.build(); }

    // Step-1 greybox visuals: flat-shaded boxes coloured by archetype.
    buildGreybox() {
      const L = this.layout, scene = this.scene;
      const gb = new SR.GeoBuilder();
      const tint = { glass: [0.55, 0.65, 0.78], deco: [0.78, 0.72, 0.62], brick: [0.66, 0.42, 0.34], limestone: [0.82, 0.78, 0.68], supertall: [0.7, 0.8, 0.9] };
      for (const b of L.buildings) {
        for (const t of b.tiers) gb.box(t.x0, t.y0, t.z0, t.x1, t.y1, t.z1, tint[b.arch], 63 & ~8);
        if (b.spire) gb.box(b.spire.x - 0.8, b.spire.y0, b.spire.z - 0.8, b.spire.x + 0.8, b.spire.y1, b.spire.z + 0.8, [0.8, 0.8, 0.85]);
      }
      const bmesh = new THREE.Mesh(gb.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
      scene.add(bmesh);

      const g2 = new SR.GeoBuilder();
      g2.flat(-W.islandHalfX, -W.islandHalfZ, W.islandHalfX, W.islandHalfZ, 0, [0.2, 0.2, 0.22]);
      for (const blk of L.blocks) g2.flat(blk.x0, blk.z0, blk.x1, blk.z1, 0.15, blk.kind === 'park' ? [0.3, 0.55, 0.25] : [0.55, 0.55, 0.55]);
      for (const p of L.piers) g2.flat(p.x0, p.z0, p.x1, p.z1, 0, [0.45, 0.4, 0.35]);
      scene.add(new THREE.Mesh(g2.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));

      const water = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.MeshLambertMaterial({ color: 0x3a5a78 }));
      water.rotation.x = -Math.PI / 2; water.position.y = W.waterY;
      scene.add(water);
    }
  }

  SR.World = World;
})();
