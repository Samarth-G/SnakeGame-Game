// Geometry helpers: a batching builder that merges thousands of boxes/quads into a
// single BufferGeometry (one draw call per material per chunk), plus instancing helpers.
(function () {
  class GeoBuilder {
    constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.idx = []; this.vc = 0; }

    get empty() { return this.vc === 0; }

    // Quad from four corners (counter-clockwise seen from the front).
    quad(a, b, c, d, nx, ny, nz, uvs, col) {
      const v = this.vc;
      this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
      for (let k = 0; k < 4; k++) this.n.push(nx, ny, nz);
      this.uv.push(uvs[0], uvs[1], uvs[2], uvs[3], uvs[4], uvs[5], uvs[6], uvs[7]);
      const r = col ? col[0] : 1, g = col ? col[1] : 1, bl = col ? col[2] : 1;
      for (let k = 0; k < 4; k++) this.c.push(r, g, bl);
      this.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      this.vc += 4;
    }

    // Axis-aligned box. UVs are in metres (u along the face, v up) so tiled facade
    // textures keep a constant window size; uOff/vOff shift the pattern per building.
    // faces: bitmask  1=+x 2=-x 4=+y 8=-y 16=+z 32=-z
    box(x0, y0, z0, x1, y1, z1, col, faces, uOff, vOff) {
      faces = faces == null ? 63 : faces;
      uOff = uOff || 0; vOff = vOff || 0;
      const w = x1 - x0, d = z1 - z0, v0 = y0 + vOff, v1 = y1 + vOff;
      if (faces & 16) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, [uOff, v0, uOff + w, v0, uOff + w, v1, uOff, v1], col);
      if (faces & 32) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, [uOff, v0, uOff + w, v0, uOff + w, v1, uOff, v1], col);
      if (faces & 1) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, [uOff, v0, uOff + d, v0, uOff + d, v1, uOff, v1], col);
      if (faces & 2) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, [uOff, v0, uOff + d, v0, uOff + d, v1, uOff, v1], col);
      if (faces & 4) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, [x0, z1, x1, z1, x1, z0, x0, z0], col);
      if (faces & 8) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0, [x0, z0, x1, z0, x1, z1, x0, z1], col);
    }

    // Horizontal rectangle at height y (UV = world XZ in metres * scale).
    flat(x0, z0, x1, z1, y, col, s) {
      s = s || 1;
      this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], 0, 1, 0, [x0 * s, -z1 * s, x1 * s, -z1 * s, x1 * s, -z0 * s, x0 * s, -z0 * s], col);
    }

    // Arbitrary horizontal quad given 4 XZ points (CCW from above).
    flatPoly(pts, y, col, s) {
      s = s || 1;
      const P = pts.map((q) => [q[0], y, q[1]]);
      this.quad(P[0], P[1], P[2], P[3], 0, 1, 0, pts.flatMap((q) => [q[0] * s, -q[1] * s]), col);
    }

    // Append an existing (non-indexed or indexed) geometry transformed by a matrix.
    addGeometry(geo, matrix, col) {
      const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
      const colAttr = geo.attributes.color;
      const v = new THREE.Vector3(), nn = new THREE.Vector3();
      const nm = new THREE.Matrix3().getNormalMatrix(matrix);
      const base = this.vc;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
        this.p.push(v.x, v.y, v.z);
        if (nor) { nn.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); this.n.push(nn.x, nn.y, nn.z); } else this.n.push(0, 1, 0);
        if (uv) this.uv.push(uv.getX(i), uv.getY(i)); else this.uv.push(0, 0);
        const cr = colAttr ? colAttr.getX(i) : 1, cg = colAttr ? colAttr.getY(i) : 1, cb = colAttr ? colAttr.getZ(i) : 1;
        if (col) this.c.push(col[0] * cr, col[1] * cg, col[2] * cb); else this.c.push(cr, cg, cb);
      }
      if (geo.index) for (let i = 0; i < geo.index.count; i++) this.idx.push(base + geo.index.getX(i));
      else for (let i = 0; i < pos.count; i++) this.idx.push(base + i);
      this.vc += pos.count;
    }

    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setIndex(this.vc > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      return g;
    }
  }

  // Bake per-vertex colours into a primitive so it can be merged/instanced with a tint.
  function colored(geo, rgb) {
    geo = geo.index ? geo.toNonIndexed() : geo;
    const n = geo.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return geo;
  }

  // Merge several (geometry, matrix, colour) parts into one geometry.
  function mergeParts(parts) {
    const gb = new GeoBuilder();
    const m = new THREE.Matrix4();
    for (const p of parts) {
      m.compose(new THREE.Vector3(...(p.pos || [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot || [0, 0, 0]))), new THREE.Vector3(...(p.scale || [1, 1, 1])));
      gb.addGeometry(p.geo, m, p.col);
    }
    return gb.build();
  }

  // Groups instances by spatial chunk so frustum culling (camera and shadow) works for
  // instanced props spread over the whole island.
  class ChunkedInstances {
    constructor(scene, geometry, material, chunkSize, opts) {
      this.scene = scene; this.geo = geometry; this.mat = material; this.cs = chunkSize || 400;
      this.chunks = new Map(); this.opts = opts || {}; this.meshes = [];
    }
    add(matrix, color) {
      const e = matrix.elements;
      const k = Math.floor(e[12] / this.cs) * 1000 + Math.floor(e[14] / this.cs);
      let c = this.chunks.get(k);
      if (!c) { c = { m: [], c: [] }; this.chunks.set(k, c); }
      c.m.push(matrix.clone());
      c.c.push(color ? color.clone() : null);
    }
    build() {
      for (const c of this.chunks.values()) {
        const mesh = new THREE.InstancedMesh(this.geo, this.mat, c.m.length);
        const hasColor = c.c.some((x) => x);
        for (let i = 0; i < c.m.length; i++) {
          mesh.setMatrixAt(i, c.m[i]);
          if (hasColor) mesh.setColorAt(i, c.c[i] || new THREE.Color(1, 1, 1));
        }
        mesh.castShadow = !!this.opts.castShadow;
        mesh.receiveShadow = this.opts.receiveShadow !== false;
        mesh.computeBoundingSphere();
        mesh.userData.detail = this.opts.detail || 0;
        this.scene.add(mesh);
        this.meshes.push(mesh);
      }
      this.chunks.clear();
      return this.meshes;
    }
  }

  SR.GeoBuilder = GeoBuilder;
  SR.geo = { colored, mergeParts, ChunkedInstances };
})();
