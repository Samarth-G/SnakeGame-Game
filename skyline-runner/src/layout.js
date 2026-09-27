// Procedural city plan: street grid, blocks, lots, districts and landmarks.
// Pure data – no three.js objects are created here, so it is cheap to test.
(function () {
  const W = SR.WORLD;
  const U = SR.util;

  // ---- District / zoning helpers ---------------------------------------------------
  // 0 = residential scale, 1 = full tower district. Controls swing rhythm: tall glass
  // canyons at the downtown tip and midtown, 30–80 m brick in between.
  function tallness(z) {
    const mid = U.smoothstep(-640, -470, z) * (1 - U.smoothstep(300, 480, z));
    const down = U.smoothstep(1330, 1520, z);
    return Math.max(mid, down);
  }
  function districtAt(x, z) {
    if (z > 1400) return 'downtown';
    if (z > -520 && z < 420) return 'midtown';
    return 'residential';
  }

  // Signed distance to the centre line of the diagonal boulevard, and position along it.
  const B = W.boulevard;
  const bdx = B.x1 - B.x0, bdz = B.z1 - B.z0, blen = Math.hypot(bdx, bdz);
  const bux = bdx / blen, buz = bdz / blen;           // along
  const bnx = buz, bnz = -bux;                        // normal
  function boulevardDist(x, z) { return (x - B.x0) * bnx + (z - B.z0) * bnz; }
  function boulevardAlong(x, z) { return (x - B.x0) * bux + (z - B.z0) * buz; }
  function boulevardPoint(s) { return { x: B.x0 + bux * s, z: B.z0 + buz * s }; }
  function boulevardCrossAvenue(ax) {
    const t = (ax - B.x0) / bdx;
    return { x: ax, z: B.z0 + bdz * t, s: t * blen };
  }

  function rectLineMinDist(r) {
    const d = [boulevardDist(r.x0, r.z0), boulevardDist(r.x1, r.z0), boulevardDist(r.x0, r.z1), boulevardDist(r.x1, r.z1)];
    const lo = Math.min(...d), hi = Math.max(...d);
    if (lo <= 0 && hi >= 0) return 0;
    return Math.min(Math.abs(lo), Math.abs(hi));
  }

  function buildLayout() {
    const rnd = U.rng(W.seed);
    const L = {
      avenues: [], streets: [], columns: [], blocks: [], buildings: [],
      plazas: {}, bridges: [], piers: [], pois: [], parkWall: [], ponds: [],
      tallness, districtAt, boulevardDist, boulevardAlong, boulevardPoint,
      boulevard: { ux: bux, uz: buz, nx: bnx, nz: bnz, len: blen },
    };

    // Avenues run north–south (constant x), streets east–west (constant z).
    for (const x of W.avenueXs) L.avenues.push({ x, x0: x - W.avenueW / 2, x1: x + W.avenueW / 2, w: W.avenueW });
    for (let k = 0; k < W.streetCount; k++) {
      const z = W.firstStreetZ + k * W.streetPitch;
      L.streets.push({ z, z0: z - W.streetW / 2, z1: z + W.streetW / 2, w: W.streetW, k });
    }
    const edges = [-W.highwayInner];
    for (const a of L.avenues) edges.push(a.x0, a.x1);
    edges.push(W.highwayInner);
    for (let i = 0; i < edges.length; i += 2) L.columns.push({ x0: edges[i], x1: edges[i + 1], c: i / 2 });

    const P = W.park;
    const crossEnt = boulevardCrossAvenue(W.avenueXs[2]);   // entertainment district
    const crossGreen = boulevardCrossAvenue(W.avenueXs[3]); // triangular green plaza
    L.plazas.ent = { x: crossEnt.x, z: crossEnt.z, s: crossEnt.s, halfLen: 170 };
    L.plazas.green = { x: crossGreen.x, z: crossGreen.z, s: crossGreen.s, halfLen: 95 };

    // Width of the strip kept clear of buildings along the boulevard.
    function clearHalfWidth(x, z) {
      const s = boulevardAlong(x, z);
      if (Math.abs(s - crossEnt.s) < 170) return 40;
      if (Math.abs(s - crossGreen.s) < 95) return 42;
      return 24;
    }

    // ---- Blocks -------------------------------------------------------------------
    for (const col of L.columns) {
      for (let k = 0; k + 1 < L.streets.length; k++) {
        const z0 = L.streets[k].z1, z1 = L.streets[k + 1].z0;
        const blk = { x0: col.x0, x1: col.x1, z0, z1, c: col.c, r: k, kind: 'normal' };
        const cx = (blk.x0 + blk.x1) / 2, cz = (z0 + z1) / 2;
        blk.district = districtAt(cx, cz);
        if (cx > P.x0 && cx < P.x1 && cz > P.z0 && cz < P.z1) blk.kind = 'park';
        L.blocks.push(blk);
      }
    }

    // ---- Lots & buildings ---------------------------------------------------------
    const ST = W.supertall;
    function addBuilding(r, h, arch, district, opts) {
      const b = Object.assign({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, h, arch, district, tiers: [], id: L.buildings.length }, opts || {});
      makeTiers(b, rnd);
      L.buildings.push(b);
      return b;
    }

    for (const blk of L.blocks) {
      if (blk.kind === 'park') continue;
      const sw = W.sidewalk;
      const ix0 = blk.x0 + sw, ix1 = blk.x1 - sw, iz0 = blk.z0 + sw, iz1 = blk.z1 - sw;
      const cz = (blk.z0 + blk.z1) / 2;

      // The supertall owns its block, surrounded by a small plaza.
      if (ST.x > blk.x0 && ST.x < blk.x1 && ST.z > blk.z0 && ST.z < blk.z1) {
        const hw = 30;
        const b = addBuilding({ x0: ST.x - hw, x1: ST.x + hw, z0: ST.z - hw, z1: ST.z + hw }, ST.height, 'supertall', 'midtown');
        L.supertall = b;
        blk.kind = 'supertall';
        continue;
      }

      const tall = tallness(cz);
      const towerBlock = rnd() < tall * 0.92;
      const lots = [];
      if (towerBlock) {
        let x = ix0;
        while (x < ix1 - 1) {
          let w = rnd.range(34, 70);
          if (ix1 - (x + w) < 26) w = ix1 - x;
          const split = rnd() < 0.45;
          if (split) {
            const zm = (iz0 + iz1) / 2;
            lots.push({ x0: x, x1: x + w, z0: iz0, z1: zm - 0.5, tower: true });
            lots.push({ x0: x, x1: x + w, z0: zm + 0.5, z1: iz1, tower: true });
          } else lots.push({ x0: x, x1: x + w, z0: iz0, z1: iz1, tower: true });
          x += w + rnd.range(0, 3);
        }
      } else {
        const zm = (iz0 + iz1) / 2;
        for (const half of [[iz0, zm], [zm, iz1]]) {
          let x = ix0;
          while (x < ix1 - 1) {
            let w = rnd.range(13, 30);
            if (ix1 - (x + w) < 11) w = ix1 - x;
            const north = half[0] === iz0;
            const depth = (half[1] - half[0]) - rnd.range(0, 9);
            lots.push(north ? { x0: x, x1: x + w, z0: half[0], z1: half[0] + depth }
                            : { x0: x, x1: x + w, z0: half[1] - depth, z1: half[1] });
            x += w;
          }
        }
      }

      for (const lot of lots) {
        const lx = (lot.x0 + lot.x1) / 2, lz = (lot.z0 + lot.z1) / 2;
        if (rectLineMinDist(lot) < clearHalfWidth(lx, lz)) continue;
        if (lot.tower) {
          const district = blk.district === 'residential' ? 'midtown' : blk.district;
          if (rnd() < 0.2) {
            addBuilding(lot, rnd.range(70, 140), rnd.pick(['limestone', 'deco', 'glass']), district);
          } else {
            const peak = district === 'downtown' ? 400 : 450;
            const h = 150 + (peak - 150) * Math.pow(rnd(), 1.5) * (0.55 + 0.45 * tall);
            addBuilding(lot, h, rnd() < 0.68 ? 'glass' : 'deco', district);
          }
        } else {
          // Corner lots on avenues run a little taller, which gives swing anchors.
          const onAvenue = L.avenues.some((a) => Math.abs(lot.x0 - (a.x1 + sw)) < 1 || Math.abs(lot.x1 - (a.x0 - sw)) < 1);
          let h = 30 + 50 * Math.pow(rnd(), 1.2) + (onAvenue ? 8 : 0);
          h = Math.min(h + tall * 60, 80 + tall * 60);
          addBuilding(lot, h, rnd() < 0.62 ? 'brick' : 'limestone', blk.district);
        }
      }
    }

    // ---- Central park ---------------------------------------------------------------
    L.park = P;
    const wallT = 0.7, wallH = 1.3;
    L.parkWall.push({ x0: P.x0, x1: P.x1, z0: P.z0, z1: P.z0 + wallT, h: wallH });
    L.parkWall.push({ x0: P.x0, x1: P.x1, z0: P.z1 - wallT, z1: P.z1, h: wallH });
    L.parkWall.push({ x0: P.x0, x1: P.x0 + wallT, z0: P.z0, z1: P.z1, h: wallH });
    L.parkWall.push({ x0: P.x1 - wallT, x1: P.x1, z0: P.z0, z1: P.z1, h: wallH });
    L.ponds.push({ x: 150, z: -1010, rx: 72, rz: 46 });

    // ---- Waterfront -----------------------------------------------------------------
    for (let z = -1500; z <= 1500; z += 160) {
      if (Math.abs(z + 600) < 60) continue; // leave room for the west bridge
      L.piers.push({ x0: -W.islandHalfX - 150, x1: -W.islandHalfX, z0: z - 12, z1: z + 12 });
    }
    L.bridges.push({ side: 1, z: 1720, x0: W.islandHalfX, x1: W.eastMainlandX, deck: 42, tower: 135 });
    L.bridges.push({ side: 1, z: 820, x0: W.islandHalfX, x1: W.eastMainlandX, deck: 40, tower: 125 });
    L.bridges.push({ side: -1, z: -620, x0: -W.islandHalfX, x1: W.westMainlandX, deck: 44, tower: 140 });

    // ---- Points of interest (minimap waypoints) ---------------------------------------
    L.pois.push({ name: 'Apex Spire', x: ST.x, z: ST.z });
    L.pois.push({ name: 'Meridian Park Pond', x: 150, z: -1010 });
    L.pois.push({ name: 'Lumen Square', x: crossEnt.x, z: crossEnt.z });
    L.pois.push({ name: 'Fountain Triangle', x: crossGreen.x, z: crossGreen.z });
    L.pois.push({ name: 'Pier 9', x: -830, z: 100 });
    L.pois.push({ name: 'Battery Tip', x: 0, z: 1930 });

    return L;
  }

  // Break a building into stacked boxes (setbacks). Each tier is an AABB, which is also
  // exactly what the collision system uses.
  function makeTiers(b, rnd) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const push = (inset, y0, y1) => {
      const ix = Math.min(inset, w / 2 - 4), iz = Math.min(inset, d / 2 - 4);
      b.tiers.push({ x0: b.x0 + ix, x1: b.x1 - ix, z0: b.z0 + iz, z1: b.z1 - iz, y0, y1 });
    };
    if (b.arch === 'supertall') {
      push(0, 0, b.h * 0.38); push(5, b.h * 0.38, b.h * 0.72); push(10, b.h * 0.72, b.h * 0.93); push(15, b.h * 0.93, b.h);
      b.spire = { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, y0: b.h, y1: b.h + SR.WORLD.supertall.spire };
    } else if (b.arch === 'deco' && b.h > 90) {
      const n = rnd.int(3, 4);
      let y = 0, inset = 0;
      for (let i = 0; i < n; i++) {
        const y1 = i === n - 1 ? b.h : y + (b.h - y) * rnd.range(0.45, 0.62);
        push(inset, y, y1);
        y = y1; inset += rnd.range(3, 6);
      }
      if (rnd() < 0.55) {
        const t = b.tiers[b.tiers.length - 1];
        b.spire = { x: (t.x0 + t.x1) / 2, z: (t.z0 + t.z1) / 2, y0: b.h, y1: b.h + rnd.range(14, 38) };
      }
    } else if (b.arch === 'glass' && b.h > 150 && rnd() < 0.35) {
      const ys = b.h * rnd.range(0.55, 0.75);
      push(0, 0, ys); push(rnd.range(4, 9), ys, b.h);
    } else {
      push(0, 0, b.h);
    }
  }

  SR.buildLayout = buildLayout;
})();
