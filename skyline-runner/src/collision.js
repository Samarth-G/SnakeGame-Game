// World collision: every solid thing in the city is an axis-aligned box stored in a
// uniform XZ grid. Provides ray casts (web anchors, camera), capsule resolution
// (player) and ground probes.
(function () {
  const SOLID = 1, ANCHOR = 2, PERCH = 4, VAULT = 8, TREE = 16;

  class Collision {
    constructor(cellSize) {
      this.cs = cellSize || 32;
      this.boxes = [];
      this.grid = new Map();
      this.stamp = 1;
      this.dynamic = [];     // per-frame boxes (traffic near the player)
    }

    add(x0, y0, z0, x1, y1, z1, flags, ref) {
      const b = { x0, y0, z0, x1, y1, z1, flags: flags == null ? SOLID | ANCHOR : flags, ref: ref || null, mark: 0, id: this.boxes.length };
      this.boxes.push(b);
      return b;
    }

    key(ix, iz) { return ix * 65536 + iz; }

    build() {
      const cs = this.cs;
      this.grid.clear();
      for (const b of this.boxes) {
        const ix0 = Math.floor(b.x0 / cs), ix1 = Math.floor(b.x1 / cs);
        const iz0 = Math.floor(b.z0 / cs), iz1 = Math.floor(b.z1 / cs);
        for (let ix = ix0; ix <= ix1; ix++) {
          for (let iz = iz0; iz <= iz1; iz++) {
            const k = this.key(ix, iz);
            let cell = this.grid.get(k);
            if (!cell) { cell = []; this.grid.set(k, cell); }
            cell.push(b);
          }
        }
      }
    }

    // Collect unique boxes overlapping an XZ rectangle.
    query(x0, z0, x1, z1, mask, out) {
      out = out || [];
      out.length = 0;
      const cs = this.cs, s = ++this.stamp;
      const ix0 = Math.floor(x0 / cs), ix1 = Math.floor(x1 / cs);
      const iz0 = Math.floor(z0 / cs), iz1 = Math.floor(z1 / cs);
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const cell = this.grid.get(this.key(ix, iz));
          if (!cell) continue;
          for (const b of cell) {
            if (b.mark === s || !(b.flags & mask)) continue;
            b.mark = s;
            if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
            out.push(b);
          }
        }
      }
      for (const b of this.dynamic) {
        if (!(b.flags & mask) || b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
        out.push(b);
      }
      return out;
    }

    // Ray vs. AABB slab test. Returns entry distance or -1, writes the hit normal.
    static rayBox(b, ox, oy, oz, dx, dy, dz, maxT, n) {
      let tmin = 0, tmax = maxT, axis = -1, sign = 0;
      // X
      if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) return -1; }
      else {
        const inv = 1 / dx;
        let t0 = (b.x0 - ox) * inv, t1 = (b.x1 - ox) * inv, s = -1;
        if (t0 > t1) { const t = t0; t0 = t1; t1 = t; s = 1; }
        if (t0 > tmin) { tmin = t0; axis = 0; sign = s; }
        if (t1 < tmax) tmax = t1;
        if (tmin > tmax) return -1;
      }
      // Y
      if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.y1) return -1; }
      else {
        const inv = 1 / dy;
        let t0 = (b.y0 - oy) * inv, t1 = (b.y1 - oy) * inv, s = -1;
        if (t0 > t1) { const t = t0; t0 = t1; t1 = t; s = 1; }
        if (t0 > tmin) { tmin = t0; axis = 1; sign = s; }
        if (t1 < tmax) tmax = t1;
        if (tmin > tmax) return -1;
      }
      // Z
      if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) return -1; }
      else {
        const inv = 1 / dz;
        let t0 = (b.z0 - oz) * inv, t1 = (b.z1 - oz) * inv, s = -1;
        if (t0 > t1) { const t = t0; t0 = t1; t1 = t; s = 1; }
        if (t0 > tmin) { tmin = t0; axis = 2; sign = s; }
        if (t1 < tmax) tmax = t1;
        if (tmin > tmax) return -1;
      }
      if (axis < 0) return -1; // origin inside the box
      n.x = axis === 0 ? sign : 0; n.y = axis === 1 ? sign : 0; n.z = axis === 2 ? sign : 0;
      return tmin;
    }

    // Grid-walking ray cast (DDA in XZ). dir must be normalised.
    raycast(ox, oy, oz, dx, dy, dz, maxT, mask, hit) {
      hit = hit || {};
      hit.t = Infinity; hit.box = null;
      const cs = this.cs, s = ++this.stamp;
      let ix = Math.floor(ox / cs), iz = Math.floor(oz / cs);
      const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
      const tdx = Math.abs(dx) > 1e-9 ? cs / Math.abs(dx) : Infinity;
      const tdz = Math.abs(dz) > 1e-9 ? cs / Math.abs(dz) : Infinity;
      let tmx = Math.abs(dx) > 1e-9 ? (dx > 0 ? (ix + 1) * cs - ox : ox - ix * cs) / Math.abs(dx) : Infinity;
      let tmz = Math.abs(dz) > 1e-9 ? (dz > 0 ? (iz + 1) * cs - oz : oz - iz * cs) / Math.abs(dz) : Infinity;
      const n = { x: 0, y: 0, z: 0 };
      let t = 0, guard = 0;
      while (t <= maxT && t <= hit.t && guard++ < 512) {
        const cell = this.grid.get(this.key(ix, iz));
        if (cell) {
          for (const b of cell) {
            if (b.mark === s || !(b.flags & mask)) continue;
            b.mark = s;
            const bt = Collision.rayBox(b, ox, oy, oz, dx, dy, dz, maxT, n);
            if (bt >= 0 && bt < hit.t) { hit.t = bt; hit.box = b; hit.nx = n.x; hit.ny = n.y; hit.nz = n.z; }
          }
        }
        if (tmx < tmz) { t = tmx; tmx += tdx; ix += stepX; } else { t = tmz; tmz += tdz; iz += stepZ; }
      }
      for (const b of this.dynamic) {
        if (!(b.flags & mask)) continue;
        const bt = Collision.rayBox(b, ox, oy, oz, dx, dy, dz, maxT, n);
        if (bt >= 0 && bt < hit.t) { hit.t = bt; hit.box = b; hit.nx = n.x; hit.ny = n.y; hit.nz = n.z; }
      }
      if (!hit.box) return null;
      hit.x = ox + dx * hit.t; hit.y = oy + dy * hit.t; hit.z = oz + dz * hit.t;
      return hit;
    }

    // Resolve a vertical capsule (centre pos, radius r, half segment length hs) against
    // solid boxes. Moves pos out of penetration and fills `contacts`.
    resolveCapsule(pos, r, hs, contacts) {
      contacts.length = 0;
      const near = this.query(pos.x - r - 1, pos.z - r - 1, pos.x + r + 1, pos.z + r + 1, SOLID, this._tmp || (this._tmp = []));
      for (let iter = 0; iter < 3; iter++) {
        let moved = false;
        for (const b of near) {
          const ya = pos.y - hs, yb = pos.y + hs;
          if (yb + r < b.y0 || ya - r > b.y1) continue;
          // Point on the capsule segment closest to the box in Y.
          const sy = Math.min(Math.max(Math.min(Math.max(pos.y, b.y0), b.y1), ya), yb);
          const qx = Math.min(Math.max(pos.x, b.x0), b.x1);
          const qy = Math.min(Math.max(sy, b.y0), b.y1);
          const qz = Math.min(Math.max(pos.z, b.z0), b.z1);
          let dx = pos.x - qx, dy = sy - qy, dz = pos.z - qz;
          const d2 = dx * dx + dy * dy + dz * dz;
          let nx, ny, nz, depth;
          if (d2 > 1e-10) {
            if (d2 >= r * r) continue;
            const d = Math.sqrt(d2);
            nx = dx / d; ny = dy / d; nz = dz / d; depth = r - d;
          } else {
            // Segment point inside the box: push out along the axis of least penetration.
            const px0 = pos.x + r - b.x0, px1 = b.x1 - (pos.x - r);
            const py0 = yb + r - b.y0, py1 = b.y1 - (ya - r);
            const pz0 = pos.z + r - b.z0, pz1 = b.z1 - (pos.z - r);
            depth = Math.min(px0, px1, py0, py1, pz0, pz1);
            nx = ny = nz = 0;
            if (depth === py1) ny = 1; else if (depth === px0) nx = -1; else if (depth === px1) nx = 1;
            else if (depth === pz0) nz = -1; else if (depth === pz1) nz = 1; else ny = -1;
          }
          pos.x += nx * depth; pos.y += ny * depth; pos.z += nz * depth;
          contacts.push({ nx, ny, nz, box: b, depth });
          moved = true;
        }
        if (!moved) break;
      }
      return contacts;
    }

    // Highest walkable surface under (x,z) not above maxY. Returns -Infinity over water.
    groundAt(x, z, maxY, r) {
      r = r || 0.3;
      let g = SR.world ? SR.world.baseGround(x, z) : 0;
      const near = this.query(x - r, z - r, x + r, z + r, SOLID, this._tmpG || (this._tmpG = []));
      for (const b of near) {
        if (b.y1 <= maxY && b.y1 > g && x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) g = b.y1;
      }
      return g;
    }

    // Is a point inside any solid box? (camera safety check)
    pointInside(x, y, z, pad) {
      pad = pad || 0;
      const near = this.query(x - pad, z - pad, x + pad, z + pad, SOLID, this._tmpP || (this._tmpP = []));
      for (const b of near) {
        if (x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - pad && y < b.y1 + pad && z > b.z0 - pad && z < b.z1 + pad) return b;
      }
      return null;
    }
  }

  Collision.SOLID = SOLID;
  Collision.ANCHOR = ANCHOR;
  Collision.PERCH = PERCH;
  Collision.VAULT = VAULT;
  Collision.TREE = TREE;
  SR.Collision = Collision;
})();
