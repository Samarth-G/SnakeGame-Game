// Minimal HUD, bottom-right only: rotating minimap with bracket frame, compass strip,
// altitude bar and clamped waypoints. Everything else stays off-screen.
(function () {
  const W = SR.WORLD;
  const COL = { block: '#9DB4F0', street: '#10205A', water: '#081338', park: '#a6c8e6', player: '#F2C230', way: '#e0413a' };
  const MAP_W = 180, MAP_H = 130, STRIP_H = 20, PAD = 18;
  const PPM = 0.5;           // pre-rendered map: pixels per metre
  const VIEW_PPM = 0.42;     // on-screen scale: 180 px ≈ 430 m

  class HUD {
    constructor(world) {
      this.world = world;
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'hud';
      document.body.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.map = this.renderMap();
      this.resize();
      addEventListener('resize', () => this.resize());
    }

    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      this.dpr = dpr;
      this.cw = MAP_W + 26; this.ch = MAP_H + STRIP_H + 14;
      this.canvas.width = this.cw * dpr; this.canvas.height = this.ch * dpr;
      this.canvas.style.width = this.cw + 'px'; this.canvas.style.height = this.ch + 'px';
      this.canvas.style.right = PAD + 'px'; this.canvas.style.bottom = PAD + 'px';
    }

    // One-off top-down render of the island grid.
    renderMap() {
      const L = this.world.layout;
      const ext = 2300, size = [Math.ceil((W.islandHalfX * 2 + 800) * PPM), Math.ceil(ext * 2 * PPM)];
      const c = document.createElement('canvas'); c.width = size[0]; c.height = size[1];
      const x = c.getContext('2d');
      this.mapOrigin = { x: -(W.islandHalfX + 400), z: -ext };
      const tx = (wx) => (wx - this.mapOrigin.x) * PPM, tz = (wz) => (wz - this.mapOrigin.z) * PPM;
      x.fillStyle = COL.water; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = COL.street; x.fillRect(tx(-W.islandHalfX), tz(-W.islandHalfZ), W.islandHalfX * 2 * PPM, W.islandHalfZ * 2 * PPM);
      for (const p of L.piers) { x.fillStyle = COL.street; x.fillRect(tx(p.x0), tz(p.z0), (p.x1 - p.x0) * PPM, (p.z1 - p.z0) * PPM); }
      for (const b of L.blocks) {
        x.fillStyle = b.kind === 'park' ? COL.park : COL.block;
        x.fillRect(tx(b.x0) + 0.5, tz(b.z0) + 0.5, (b.x1 - b.x0) * PPM - 1, (b.z1 - b.z0) * PPM - 1);
      }
      const P = W.park;
      x.fillStyle = COL.park; x.fillRect(tx(P.x0), tz(P.z0), (P.x1 - P.x0) * PPM, (P.z1 - P.z0) * PPM);
      // Boulevard cut through the blocks.
      const B = W.boulevard;
      x.strokeStyle = COL.street; x.lineWidth = 24 * PPM;
      x.beginPath(); x.moveTo(tx(B.x0), tz(B.z0)); x.lineTo(tx(B.x1), tz(B.z1)); x.stroke();
      for (const br of L.bridges) {
        x.strokeStyle = '#2a3a78'; x.lineWidth = 22 * PPM;
        x.beginPath(); x.moveTo(tx(br.x0), tz(br.z)); x.lineTo(tx(br.x1), tz(br.z)); x.stroke();
      }
      return c;
    }

    draw(player, cam) {
      const x = this.ctx, d = this.dpr;
      x.setTransform(d, 0, 0, d, 0, 0);
      x.clearRect(0, 0, this.cw, this.ch);
      const mx = 4, my = STRIP_H + 8;           // minimap top-left inside the canvas
      const yaw = cam.yaw;
      const heading = ((Math.atan2(-Math.sin(yaw), Math.cos(yaw)) * 180 / Math.PI) + 360) % 360; // 0 = north, 90 = east

      // --- minimap -------------------------------------------------------------------------------------
      x.save();
      x.beginPath(); x.rect(mx, my, MAP_W, MAP_H); x.clip();
      x.fillStyle = COL.water; x.fillRect(mx, my, MAP_W, MAP_H);
      x.translate(mx + MAP_W / 2, my + MAP_H / 2);
      x.rotate(yaw);
      const s = VIEW_PPM / PPM;
      x.scale(s, s);
      x.translate(-(player.pos.x - this.mapOrigin.x) * PPM, -(player.pos.z - this.mapOrigin.z) * PPM);
      x.imageSmoothingEnabled = true;
      x.drawImage(this.map, 0, 0);
      x.restore();

      // Waypoints (clamped to the map edge when off-screen).
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      for (const poi of this.world.layout.pois) {
        const dx = (poi.x - player.pos.x) * VIEW_PPM, dz = (poi.z - player.pos.z) * VIEW_PPM;
        let px = dx * cy - dz * sy, pz = dx * sy + dz * cy;
        const hx = MAP_W / 2 - 7, hz = MAP_H / 2 - 7;
        const k = Math.max(Math.abs(px) / hx, Math.abs(pz) / hz, 1);
        px /= k; pz /= k;
        const ox = mx + MAP_W / 2 + px, oz = my + MAP_H / 2 + pz;
        x.fillStyle = COL.way; x.strokeStyle = '#fff'; x.lineWidth = 1.2;
        x.beginPath(); x.arc(ox, oz, k > 1 ? 4 : 5, 0, Math.PI * 2); x.fill(); x.stroke();
        x.fillStyle = '#fff'; x.beginPath(); x.arc(ox, oz, 1.4, 0, Math.PI * 2); x.fill();
      }

      // Player arrow, fixed in the centre, rotated by facing relative to the camera.
      const fYaw = Math.atan2(-player.facing.x, -player.facing.z);
      x.save();
      x.translate(mx + MAP_W / 2, my + MAP_H / 2);
      x.rotate(yaw - fYaw);
      x.fillStyle = COL.player; x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(0, -8); x.lineTo(6, 6); x.lineTo(0, 3); x.lineTo(-6, 6); x.closePath(); x.fill(); x.stroke();
      x.restore();

      // Bracket frame.
      x.strokeStyle = 'rgba(235,240,255,0.9)'; x.lineWidth = 1.5;
      const bl = 14;
      for (const [cx, cz, sx, sz] of [[mx, my, 1, 1], [mx + MAP_W, my, -1, 1], [mx, my + MAP_H, 1, -1], [mx + MAP_W, my + MAP_H, -1, -1]]) {
        x.beginPath(); x.moveTo(cx + sx * bl, cz); x.lineTo(cx, cz); x.lineTo(cx, cz + sz * bl); x.stroke();
      }
      x.strokeStyle = 'rgba(235,240,255,0.25)'; x.lineWidth = 1; x.strokeRect(mx + 0.5, my + 0.5, MAP_W - 1, MAP_H - 1);

      // Altitude bar on the right edge.
      const alt = Math.max(0, player.feetY), frac = Math.min(1, alt / 520);
      const bx = mx + MAP_W + 6;
      x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(bx, my, 3, MAP_H);
      x.fillStyle = '#ff8a1e'; x.fillRect(bx, my + MAP_H * (1 - frac), 3, MAP_H * frac);
      x.fillRect(bx - 2, my + MAP_H * (1 - frac) - 1, 7, 2);

      // --- compass strip ---------------------------------------------------------------------------------
      const sx0 = mx, sw = MAP_W, syc = 3 + STRIP_H / 2, span = 120, pxPerDeg = sw / span;
      x.save();
      x.beginPath(); x.rect(sx0, 0, sw, STRIP_H + 4); x.clip();
      x.fillStyle = 'rgba(8,14,40,0.45)'; x.fillRect(sx0, 2, sw, STRIP_H);
      const facing = ['N', 'E', 'S', 'W'][Math.round(heading / 90) % 4];
      for (let deg = Math.floor((heading - span / 2) / 15) * 15; deg <= heading + span / 2; deg += 15) {
        const px = sx0 + sw / 2 + (deg - heading) * pxPerDeg;
        const norm = ((deg % 360) + 360) % 360;
        const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[norm];
        if (card) {
          x.fillStyle = card === facing ? '#ff8a1e' : '#ffffff';
          x.font = 'bold 12px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
          x.fillText(card, px, syc + 1);
        } else {
          x.fillStyle = 'rgba(255,255,255,0.85)';
          x.fillRect(px - 0.5, syc - (norm % 45 === 0 ? 5 : 3), 1, norm % 45 === 0 ? 10 : 6);
        }
      }
      x.restore();
      x.fillStyle = '#F2C230';
      x.beginPath(); x.moveTo(sx0 - 1, syc - 5); x.lineTo(sx0 + 6, syc); x.lineTo(sx0 - 1, syc + 5); x.closePath(); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(sx0 + sw / 2 - 0.5, 2, 1, 4);
    }
  }

  SR.HUD = HUD;
})();
