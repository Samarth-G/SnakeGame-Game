// Unit geometries for instanced props, built from primitives with baked vertex colours.
(function () {
  const G = THREE, merge = SR.geo.mergeParts;
  const col = (hex) => { const c = new G.Color(hex); return [c.r, c.g, c.b]; };
  const box = (w, h, d) => new G.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, s) => new G.CylinderGeometry(rt, rb, h, s || 8);

  function jitter(geo, amt, seed) {
    const r = SR.util.rng(seed || 3), p = geo.attributes.position;
    const map = new Map();
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!map.has(k)) map.set(k, [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]);
      const d = map.get(k);
      p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
    }
    geo.computeVertexNormals();
    return geo;
  }

  const P = {};

  // Deciduous tree, 1 m tall unit scaled per instance. Canopy is white so the instance
  // colour gives autumn tones; the trunk is dark so tinting barely affects it.
  P.tree = () => {
    const canopy = jitter(new G.IcosahedronGeometry(0.34, 1), 0.08, 5);
    const c2 = jitter(new G.IcosahedronGeometry(0.22, 1), 0.06, 8);
    return merge([
      { geo: cyl(0.011, 0.018, 0.55, 5), pos: [0, 0.275, 0], col: [0.28, 0.2, 0.14] },
      { geo: cyl(0.006, 0.01, 0.25, 4), pos: [0.05, 0.45, 0], rot: [0, 0, -0.7], col: [0.28, 0.2, 0.14] },
      { geo: canopy, pos: [0, 0.68, 0], scale: [1, 0.85, 1], col: [1, 1, 1] },
      { geo: c2, pos: [0.16, 0.58, 0.08], col: [0.88, 0.88, 0.88] },
      { geo: c2, pos: [-0.14, 0.62, -0.1], col: [0.94, 0.94, 0.94] },
    ]);
  };

  P.lamp = () => merge([
    { geo: cyl(0.07, 0.11, 7, 6), pos: [0, 3.5, 0], col: col(0x2e3a34) },
    { geo: box(0.08, 0.08, 1.9), pos: [0, 6.9, 0.9], col: col(0x2e3a34) },
    { geo: box(0.35, 0.18, 0.6), pos: [0, 6.82, 1.8], col: col(0x39443e) },
    { geo: box(0.3, 0.04, 0.5), pos: [0, 6.72, 1.8], col: [1.4, 1.35, 1.2] },
  ]);

  // Traffic signal: pole at origin, mast arm reaching +z over the road.
  P.signal = () => merge([
    { geo: cyl(0.12, 0.16, 7.2, 8), pos: [0, 3.6, 0], col: col(0x6b6e70) },
    { geo: box(0.14, 0.14, 8.5), pos: [0, 6.9, 4.25], col: col(0x6b6e70) },
    { geo: box(0.36, 1.05, 0.34), pos: [0, 6.3, 5.2], col: col(0x2b2b20) },
    { geo: box(0.36, 1.05, 0.34), pos: [0, 6.3, 7.8], col: col(0x2b2b20) },
    { geo: box(0.3, 0.8, 0.3), pos: [0, 2.9, 0.2], col: col(0x2b2b20) },
  ]);
  // Signal lamps (one sphere per head); coloured per phase by traffic.js.
  P.signalLamp = () => merge([
    { geo: new G.SphereGeometry(0.13, 8, 6), pos: [0.19, 6.3, 5.2], col: [1, 1, 1] },
    { geo: new G.SphereGeometry(0.13, 8, 6), pos: [0.19, 6.3, 7.8], col: [1, 1, 1] },
  ]);

  P.hydrant = () => merge([
    { geo: cyl(0.16, 0.18, 0.6, 8), pos: [0, 0.3, 0], col: col(0xc9302c) },
    { geo: new G.SphereGeometry(0.16, 8, 6), pos: [0, 0.62, 0], col: col(0xd8b43a) },
    { geo: cyl(0.06, 0.06, 0.45, 6), pos: [0, 0.4, 0], rot: [0, 0, Math.PI / 2], col: col(0xc9302c) },
  ]);
  P.newsbox = () => merge([{ geo: box(0.5, 1.1, 0.45), pos: [0, 0.55, 0], col: [1, 1, 1] }, { geo: box(0.4, 0.3, 0.02), pos: [0, 0.85, 0.23], col: [0.9, 0.9, 0.85] }]);
  P.bin = () => merge([{ geo: cyl(0.32, 0.28, 0.95, 10), pos: [0, 0.475, 0], col: col(0x2f4a38) }, { geo: cyl(0.34, 0.34, 0.06, 10), pos: [0, 0.97, 0], col: col(0x22342a) }]);
  P.bikerack = () => {
    const parts = [];
    for (let i = 0; i < 4; i++) {
      parts.push({ geo: box(0.05, 0.8, 0.05), pos: [i * 0.7, 0.4, -0.3], col: col(0x9aa0a6) });
      parts.push({ geo: box(0.05, 0.8, 0.05), pos: [i * 0.7, 0.4, 0.3], col: col(0x9aa0a6) });
      parts.push({ geo: box(0.05, 0.05, 0.65), pos: [i * 0.7, 0.8, 0], col: col(0x9aa0a6) });
    }
    return merge(parts);
  };
  P.planter = () => merge([
    { geo: box(2.2, 0.8, 1.2), pos: [0, 0.4, 0], col: col(0x6d655a) },
    { geo: jitter(new G.IcosahedronGeometry(0.7, 1), 0.2, 11), pos: [-0.5, 1.0, 0], scale: [1, 0.7, 0.8], col: col(0x3f6b2f) },
    { geo: jitter(new G.IcosahedronGeometry(0.6, 1), 0.2, 12), pos: [0.5, 0.95, 0], scale: [1, 0.7, 0.8], col: col(0x4f7a33) },
  ]);
  P.umbrella = () => merge([
    { geo: cyl(0.04, 0.04, 2.4, 5), pos: [0, 1.2, 0], col: [0.85, 0.85, 0.85] },
    { geo: new G.ConeGeometry(1.6, 0.6, 8), pos: [0, 2.5, 0], col: [1, 1, 1] },
  ]);
  P.cafe = () => {
    const parts = [
      { geo: cyl(0.4, 0.4, 0.04, 12), pos: [0, 0.75, 0], col: [0.92, 0.92, 0.9] },
      { geo: cyl(0.03, 0.03, 0.75, 5), pos: [0, 0.375, 0], col: [0.2, 0.2, 0.2] },
    ];
    for (const a of [0, Math.PI]) parts.push({ geo: box(0.42, 0.45, 0.42), pos: [Math.cos(a) * 0.75, 0.225, Math.sin(a) * 0.75], col: [0.25, 0.25, 0.28] });
    return merge(parts);
  };
  P.awning = () => merge([{ geo: box(1, 0.08, 1), pos: [0, 0, 0.5], rot: [0.32, 0, 0], col: [1, 1, 1] }, { geo: box(1, 0.35, 0.03), pos: [0, -0.2, 0.98], col: [0.9, 0.9, 0.9] }]);

  // Roof kit
  P.hvac = () => merge([
    { geo: box(1, 1, 1), pos: [0, 0.5, 0], col: col(0xa9adb0) },
    { geo: cyl(0.3, 0.3, 0.06, 12), pos: [0, 1.02, 0], col: col(0x5c6064) },
    { geo: box(1.02, 0.12, 1.02), pos: [0, 0.06, 0], col: col(0x7d8185) },
  ]);
  P.bulkhead = () => merge([
    { geo: box(1, 1, 1), pos: [0, 0.5, 0], col: [1, 1, 1] },
    { geo: box(1.08, 0.08, 1.08), pos: [0, 1.0, 0], col: [0.75, 0.75, 0.75] },
    { geo: box(0.3, 0.7, 0.02), pos: [0, 0.35, 0.51], col: col(0x4a3b30) },
  ]);
  P.waterTower = () => {
    const parts = [
      { geo: cyl(2.2, 2.2, 4.4, 14), pos: [0, 6.2, 0], col: col(0x8a6a4a) },
      { geo: new G.ConeGeometry(2.4, 1.6, 14), pos: [0, 9.2, 0], col: col(0x5a4636) },
      { geo: cyl(2.3, 2.3, 0.2, 14), pos: [0, 5.0, 0], col: col(0x3a3a3a) },
    ];
    for (const [x, z] of [[1.5, 1.5], [-1.5, 1.5], [1.5, -1.5], [-1.5, -1.5]]) parts.push({ geo: box(0.25, 4, 0.25), pos: [x, 2, z], col: col(0x333333) });
    for (const y of [4.6, 5.8, 7.0, 8.0]) parts.push({ geo: cyl(2.24, 2.24, 0.08, 14), pos: [0, y + 0.4, 0], col: col(0x3a3a3a) });
    return merge(parts);
  };
  P.solar = () => merge([{ geo: box(1.7, 0.06, 1.0), pos: [0, 0.6, 0], rot: [-0.45, 0, 0], col: col(0x1f3564) }, { geo: box(0.08, 0.6, 0.08), pos: [0, 0.3, 0.2], col: col(0x888888) }]);
  P.skylight = () => merge([{ geo: box(1, 0.3, 1), pos: [0, 0.15, 0], col: col(0x7a7f85) }, { geo: new G.ConeGeometry(0.72, 0.5, 4, 1), pos: [0, 0.55, 0], rot: [0, Math.PI / 4, 0], col: col(0x9fc2d8) }]);
  P.antenna = () => merge([
    { geo: cyl(0.12, 0.2, 1, 6), pos: [0, 0.5, 0], col: col(0xb0b4b8) },
    { geo: box(0.6, 0.06, 0.06), pos: [0, 0.75, 0], col: col(0xd04040) },
  ]);
  P.billboardFrame = () => {
    const parts = [];
    for (const x of [-0.45, 0, 0.45]) parts.push({ geo: box(0.02, 1, 0.02), pos: [x, 0.5, 0], col: col(0x3c3f42) });
    parts.push({ geo: box(1, 0.02, 0.12), pos: [0, 0.4, 0], col: col(0x3c3f42) });
    return merge(parts);
  };
  P.acUnit = () => merge([{ geo: box(0.7, 0.42, 0.5), pos: [0, 0, 0.25], col: col(0xd9d9d2) }, { geo: box(0.6, 0.3, 0.02), pos: [0, 0, 0.51], col: col(0x9a9a92) }]);
  // One storey of fire escape for a 3.6 m bay: landing, railing and a stair to the next floor.
  P.fireEscape = () => {
    const c = col(0x1d1f22), parts = [
      { geo: box(3.6, 0.06, 1.2), pos: [0, 0, 0.6], col: c },
      { geo: box(3.6, 0.05, 0.05), pos: [0, 0.95, 1.18], col: c },
      { geo: box(0.05, 0.95, 0.05), pos: [-1.78, 0.47, 1.18], col: c },
      { geo: box(0.05, 0.95, 0.05), pos: [1.78, 0.47, 1.18], col: c },
      { geo: box(3.6, 0.03, 0.03), pos: [0, 0.5, 1.18], col: c },
      { geo: box(0.05, 0.95, 1.2), pos: [-1.78, 0.47, 0.6], col: c },
      { geo: box(0.5, 0.05, 3.6), pos: [0.6, 1.6, 0.8], rot: [0, Math.PI / 2, 0.72], col: c },
    ];
    return merge(parts);
  };

  SR.props = P;
})();
