// Web line: a thin, slightly shiny tube from the hand to the anchor. Taut while swinging,
// sagging and fading for a moment after release. Impact splats stick to facades.
(function () {
  const SEG = 14, RAD = 6;

  class WebLine {
    constructor(scene) {
      this.scene = scene;
      const g = new THREE.BufferGeometry();
      this.pos = new Float32Array((SEG + 1) * RAD * 3);
      const idx = [];
      for (let i = 0; i < SEG; i++) for (let j = 0; j < RAD; j++) {
        const a = i * RAD + j, b = i * RAD + (j + 1) % RAD, c = a + RAD, d = b + RAD;
        idx.push(a, c, b, b, c, d);
      }
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      g.setIndex(idx);
      this.geo = g;
      this.mat = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.25, metalness: 0.1, emissive: 0x333a44, transparent: true });
      this.mesh = new THREE.Mesh(g, this.mat);
      this.mesh.frustumCulled = false;
      this.mesh.visible = false;
      scene.add(this.mesh);
      this.from = new THREE.Vector3(); this.to = new THREE.Vector3();
      this.splats = [];
      this.splatTex = WebLine.makeSplatTexture();
      this.splatGeo = new THREE.CircleGeometry(0.9, 24);
      this.slackStart = new THREE.Vector3(); this.slackEnd = new THREE.Vector3();
    }

    static makeSplatTexture() {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d');
      x.translate(64, 64);
      x.strokeStyle = 'rgba(245,248,255,0.95)'; x.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2 + Math.sin(i * 7) * 0.2, r = 44 + (i % 3) * 8;
        x.lineWidth = 3; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * r, Math.sin(a) * r); x.stroke();
      }
      for (let r = 12; r < 56; r += 13) { x.lineWidth = 1.6; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke(); }
      x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.arc(0, 0, 9, 0, Math.PI * 2); x.fill();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }

    addSplat(x, y, z, nx, ny, nz) {
      const m = new THREE.Mesh(this.splatGeo, new THREE.MeshBasicMaterial({ map: this.splatTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, fog: true }));
      m.position.set(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05);
      m.lookAt(x + nx, y + ny, z + nz);
      m.rotation.z += Math.random() * 6.28;
      m.userData.t = 0;
      this.scene.add(m);
      this.splats.push(m);
      if (this.splats.length > 14) { const o = this.splats.shift(); this.scene.remove(o); o.material.dispose(); }
    }

    // hand: world position of the web-shooting hand
    update(dt, player, hand) {
      const S = SR.Player.S, T = SR.TUNING;
      for (const s of this.splats) { s.userData.t += dt; s.material.opacity = Math.max(0, 1 - Math.max(0, s.userData.t - 6) / 3); }
      let sag = 0, opacity = 1;
      if (player.state === S.SWINGING || player.state === S.ZIPPING) {
        this.from.copy(hand); this.to.copy(player.anchor);
        this.slackEnd.copy(player.anchor);
        this.mesh.visible = true;
      } else if (player.webSlack > 0) {
        const k = 1 - player.webSlack / T.webSlackTime;
        this.from.copy(hand); this.to.copy(this.slackEnd);
        sag = 1.5 + k * 6; opacity = 1 - k * 0.8;
        this.mesh.visible = true;
      } else { this.mesh.visible = false; return; }
      this.mat.opacity = opacity;
      const a = this.from, b = this.to;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz) || 1;
      const tx = dx / len, ty = dy / len, tz = dz / len;
      // Frame perpendicular to the line.
      let ux = 0, uy = 1, uz = 0;
      if (Math.abs(ty) > 0.95) { ux = 1; uy = 0; }
      let sx = ty * uz - tz * uy, sy = tz * ux - tx * uz, sz = tx * uy - ty * ux;
      const sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
      const qx = sy * tz - sz * ty, qy = sz * tx - sx * tz, qz = sx * ty - sy * tx;
      const r = 0.022;
      let o = 0;
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG;
        const cx = a.x + dx * t, cy = a.y + dy * t - sag * 4 * t * (1 - t), cz = a.z + dz * t;
        for (let j = 0; j < RAD; j++) {
          const ang = j / RAD * Math.PI * 2, c = Math.cos(ang) * r, s = Math.sin(ang) * r;
          this.pos[o++] = cx + sx * c + qx * s; this.pos[o++] = cy + sy * c + qy * s; this.pos[o++] = cz + sz * c + qz * s;
        }
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.computeVertexNormals();
    }
  }

  SR.WebLine = WebLine;
})();
