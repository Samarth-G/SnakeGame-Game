// Procedural canvas textures: facades, ground, signs and billboards. No image files.
// Facade textures tile in metres: see SR.TEX_TILE for the size one texture covers.
(function () {
  const U = SR.util;
  const rnd = U.rng(99);

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function tex(c, repeatW, repeatH, srgb) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeatW) t.repeat.set(1 / repeatW, 1 / repeatH);
    t.colorSpace = srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }

  // Per-pixel value noise on top of whatever is drawn.
  function grain(ctx, w, h, amp, scale) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    scale = scale || 1;
    for (let i = 0; i < d.length; i += 4) {
      const px = (i / 4) % w, py = Math.floor(i / 4 / w);
      const n = (U.hash2(Math.floor(px / scale), Math.floor(py / scale)) - 0.5) * amp + (rnd() - 0.5) * amp * 0.5;
      d[i] = U.clamp(d[i] + n, 0, 255); d[i + 1] = U.clamp(d[i + 1] + n, 0, 255); d[i + 2] = U.clamp(d[i + 2] + n, 0, 255);
    }
    ctx.putImageData(img, 0, 0);
  }

  function windowGlass(x, px, py, w, h, style) {
    const g = x.createLinearGradient(px, py, px, py + h);
    const lit = rnd() < 0.08;
    if (lit) { g.addColorStop(0, '#d8c79a'); g.addColorStop(1, '#8a7650'); }
    else if (style === 'dark') { g.addColorStop(0, '#5b6a7c'); g.addColorStop(0.5, '#2c3440'); g.addColorStop(1, '#1b2129'); }
    else { g.addColorStop(0, '#9bb0c6'); g.addColorStop(0.45, '#4d5d70'); g.addColorStop(1, '#232b35'); }
    x.fillStyle = g; x.fillRect(px, py, w, h);
    // blinds / curtains
    const r = rnd();
    if (r < 0.35) { x.fillStyle = `rgba(${220 + rnd() * 30},${205 + rnd() * 30},${170 + rnd() * 40},0.85)`; x.fillRect(px, py, w, h * (0.15 + rnd() * 0.5)); }
    else if (r < 0.45) { x.fillStyle = 'rgba(240,240,235,0.55)'; x.fillRect(px, py, w * 0.3, h); x.fillRect(px + w * 0.7, py, w * 0.3, h); }
  }

  // --- facades: 512 px texture covers 16 m x 12.8 m (4 bays x 4 floors) ---------------------
  function brick() {
    const W = 512, H = 512, c = canvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#c98d74'; x.fillRect(0, 0, W, H);
    // mortar courses
    x.fillStyle = 'rgba(90,50,40,0.18)';
    for (let y = 0; y < H; y += 3) x.fillRect(0, y, W, 1);
    for (let y = 0; y < H; y += 6) for (let i = 0; i < W; i += 8) x.fillRect(i + ((y / 6) % 2) * 4, y, 1, 3);
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
      const px = bx * 128 + 43, py = fy * 128 + 30, w = 42, h = 64;
      x.fillStyle = '#e8e0d0'; x.fillRect(px - 5, py - 9, w + 10, 8);   // lintel
      x.fillRect(px - 4, py + h, w + 8, 5);                             // sill
      x.fillStyle = '#f2efe8'; x.fillRect(px - 3, py - 2, w + 6, h + 4); // frame
      windowGlass(x, px, py, w, h);
      x.fillStyle = '#f2efe8'; x.fillRect(px + w / 2 - 1.5, py, 3, h); x.fillRect(px, py + h * 0.48, w, 3);
    }
    grain(x, W, H, 26, 2);
    return c;
  }

  function limestone() {
    const W = 512, H = 512, c = canvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#e2d8c3'; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(120,105,80,0.22)';
    for (let y = 0; y < H; y += 21) x.fillRect(0, y, W, 2);
    for (let y = 0; y < H; y += 21) for (let i = (y / 21 % 2) * 30; i < W; i += 60) x.fillRect(i, y, 2, 21);
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
      const px = bx * 128 + 38, py = fy * 128 + 24, w = 52, h = 74;
      x.fillStyle = '#c9bca2'; x.fillRect(px - 8, py - 14, w + 16, 12);
      x.fillStyle = '#d6cab0'; x.fillRect(px - 6, py - 4, w + 12, h + 10);
      windowGlass(x, px, py, w, h);
      x.fillStyle = '#ece6da'; x.fillRect(px + w / 2 - 1.5, py, 3, h); x.fillRect(px, py + h * 0.4, w, 3);
    }
    grain(x, W, H, 18, 2);
    return c;
  }

  // Glass curtain wall: 512 px covers 12 m x 12 m (panels 1.5 m, floors 4 m).
  function glass() {
    const W = 512, H = 512, c = canvas(W, H), x = c.getContext('2d');
    const pw = W / 8, fh = H / 3;
    for (let fy = 0; fy < 3; fy++) for (let px = 0; px < 8; px++) {
      const t = 0.85 + rnd() * 0.3;
      const g = x.createLinearGradient(0, fy * fh, 0, fy * fh + fh);
      g.addColorStop(0, `rgb(${170 * t | 0},${192 * t | 0},${214 * t | 0})`);
      g.addColorStop(1, `rgb(${120 * t | 0},${140 * t | 0},${165 * t | 0})`);
      x.fillStyle = g; x.fillRect(px * pw, fy * fh, pw, fh);
      if (rnd() < 0.06) { x.fillStyle = 'rgba(255,240,200,0.35)'; x.fillRect(px * pw, fy * fh + fh * 0.2, pw, fh * 0.6); }
    }
    x.fillStyle = '#56606c';
    for (let fy = 0; fy < 3; fy++) x.fillRect(0, fy * fh + fh - 20, W, 20); // spandrel
    x.fillStyle = '#d9dee4';
    for (let px = 0; px <= 8; px++) x.fillRect(px * pw - 2, 0, 4, H);
    for (let fy = 0; fy <= 3; fy++) x.fillRect(0, fy * fh - 2, W, 4);
    grain(x, W, H, 8, 4);
    return c;
  }

  // Art-deco: stone piers with recessed window strips. 512 px covers 12 m x 12.8 m.
  function deco() {
    const W = 512, H = 512, c = canvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#d7ccb2'; x.fillRect(0, 0, W, H);
    const bay = W / 4;
    for (let b = 0; b < 4; b++) {
      const sx = b * bay + 22, sw = bay - 44;
      x.fillStyle = '#3b4148'; x.fillRect(sx, 0, sw, H);
      for (let fy = 0; fy < 4; fy++) {
        const py = fy * 128;
        windowGlass(x, sx + 4, py + 10, sw - 8, 84, 'dark');
        x.fillStyle = '#6b6152'; x.fillRect(sx, py + 100, sw, 28);
        x.fillStyle = '#a89878';
        for (let k = 0; k < 3; k++) x.fillRect(sx + 8 + k * (sw - 16) / 2 - 3, py + 106, 6, 16);
      }
      x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(b * bay, 0, 6, H);
    }
    grain(x, W, H, 16, 2);
    return c;
  }

  // Ground-floor shops: 512 x 256 covers 12 m x 5 m (3 shopfronts). Also returns an
  // emissive mask so display windows glow.
  function storefront() {
    const W = 512, H = 256, c = canvas(W, H), x = c.getContext('2d');
    const e = canvas(W, H), ex = e.getContext('2d');
    ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
    x.fillStyle = '#4a4540'; x.fillRect(0, 0, W, H);
    const sw = W / 3;
    for (let i = 0; i < 3; i++) {
      const sx = i * sw;
      x.fillStyle = '#2d2a28'; x.fillRect(sx, 0, 10, H); // pilaster
      const hue = [30, 45, 200, 350, 120][Math.floor(rnd() * 5)];
      const g = x.createLinearGradient(0, 70, 0, H);
      g.addColorStop(0, `hsl(${hue},35%,78%)`); g.addColorStop(1, `hsl(${hue},25%,45%)`);
      x.fillStyle = g; x.fillRect(sx + 18, 72, sw - 70, H - 90);
      // merchandise silhouettes
      for (let k = 0; k < 6; k++) {
        x.fillStyle = `hsl(${(hue + k * 40) % 360},45%,${35 + rnd() * 30}%)`;
        const bw = 10 + rnd() * 18, bh = 12 + rnd() * 40;
        x.fillRect(sx + 26 + k * (sw - 90) / 6, H - 20 - bh, bw, bh);
      }
      x.fillStyle = '#1d1b1a'; x.fillRect(sx + sw - 46, 80, 32, H - 80);   // door
      x.fillStyle = '#8fa0b0'; x.fillRect(sx + sw - 42, 86, 24, 90);
      x.fillStyle = '#23201e'; x.fillRect(sx + 10, 0, sw - 10, 60);        // sign band
      ex.fillStyle = `hsl(${hue},40%,62%)`; ex.fillRect(sx + 18, 72, sw - 70, H - 90);
      ex.fillStyle = '#556'; ex.fillRect(sx + sw - 42, 86, 24, 90);
    }
    grain(x, W, H, 14, 2);
    return { map: c, emissive: e };
  }

  function roof() {
    const W = 256, c = canvas(W, W), x = c.getContext('2d');
    x.fillStyle = '#8d8a85'; x.fillRect(0, 0, W, W);
    for (let i = 0; i < 40; i++) {
      x.fillStyle = `rgba(${40 + rnd() * 40},${40 + rnd() * 40},${40 + rnd() * 40},0.25)`;
      x.beginPath(); x.ellipse(rnd() * W, rnd() * W, 10 + rnd() * 40, 6 + rnd() * 20, rnd() * 3, 0, 7); x.fill();
    }
    x.strokeStyle = 'rgba(40,40,40,0.3)';
    for (let i = 0; i < W; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, W); x.stroke(); }
    grain(x, W, W, 40, 1);
    return c;
  }

  function asphalt() {
    const W = 512, c = canvas(W, W), x = c.getContext('2d');
    x.fillStyle = '#4a4b4e'; x.fillRect(0, 0, W, W);
    for (let i = 0; i < 30; i++) {
      x.fillStyle = `rgba(${20 + rnd() * 30},${20 + rnd() * 30},${25 + rnd() * 30},0.18)`;
      x.beginPath(); x.ellipse(rnd() * W, rnd() * W, 20 + rnd() * 80, 10 + rnd() * 30, rnd() * 3, 0, 7); x.fill();
    }
    x.strokeStyle = 'rgba(25,25,25,0.5)'; x.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) {
      x.beginPath(); let px = rnd() * W, py = rnd() * W; x.moveTo(px, py);
      for (let k = 0; k < 6; k++) { px += (rnd() - 0.5) * 40; py += (rnd() - 0.5) * 40; x.lineTo(px, py); }
      x.stroke();
    }
    grain(x, W, W, 30, 1);
    return c;
  }

  function sidewalk() {
    const W = 256, c = canvas(W, W), x = c.getContext('2d');
    x.fillStyle = '#b9b5ad'; x.fillRect(0, 0, W, W);
    x.fillStyle = 'rgba(70,65,60,0.35)';
    for (let i = 0; i < W; i += 64) { x.fillRect(i, 0, 2, W); x.fillRect(0, i, W, 2); }
    for (let i = 0; i < 25; i++) { x.fillStyle = `rgba(60,55,50,${0.05 + rnd() * 0.1})`; x.beginPath(); x.arc(rnd() * W, rnd() * W, 2 + rnd() * 10, 0, 7); x.fill(); }
    grain(x, W, W, 22, 1);
    return c;
  }

  function grass() {
    const W = 256, c = canvas(W, W), x = c.getContext('2d');
    x.fillStyle = '#5f7f3a'; x.fillRect(0, 0, W, W);
    for (let i = 0; i < 2500; i++) {
      x.fillStyle = `hsla(${70 + rnd() * 40},${35 + rnd() * 25}%,${25 + rnd() * 25}%,0.6)`;
      x.fillRect(rnd() * W, rnd() * W, 1, 2 + rnd() * 3);
    }
    for (let i = 0; i < 30; i++) { x.fillStyle = `hsla(${30 + rnd() * 20},60%,45%,0.35)`; x.beginPath(); x.arc(rnd() * W, rnd() * W, 1 + rnd() * 2, 0, 7); x.fill(); }
    grain(x, W, W, 18, 2);
    return c;
  }

  function pavers(base) {
    const W = 256, c = canvas(W, W), x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, W, W);
    x.fillStyle = 'rgba(40,20,20,0.3)';
    for (let y = 0; y < W; y += 16) { x.fillRect(0, y, W, 1.5); for (let i = ((y / 16) % 2) * 16; i < W; i += 32) x.fillRect(i, y, 1.5, 16); }
    grain(x, W, W, 22, 1);
    return c;
  }

  function gravelPath() {
    const W = 128, c = canvas(W, W), x = c.getContext('2d');
    x.fillStyle = '#c4b596'; x.fillRect(0, 0, W, W);
    grain(x, W, W, 45, 1);
    return c;
  }

  // Shop signs atlas: 4 x 8 cells of 256 x 64.
  const SHOPS = ['SNEAKERS', 'RAMEN', 'DRUGSTORE · OPEN 24 HOURS', 'PIZZA', 'SUSHI', 'DINER', 'DELI', 'BAGELS', 'LAUNDROMAT', 'FLOWERS',
    'COFFEE', 'HARDWARE', 'BOOKS', 'NAILS', 'TACOS', 'SHOW TICKETS', 'BODEGA', 'NOODLE BAR', 'OPTICIAN', 'BAKERY', 'DUMPLINGS', 'VINYL',
    'GYM', 'PHARMACY', 'FALAFEL', 'THRIFT', 'BIKE SHOP', 'CAMERAS', 'TOYS', 'SALON', 'GROCERY', 'TAILOR'];
  function signs() {
    const c = canvas(1024, 512), x = c.getContext('2d');
    const palettes = [['#b21f24', '#fff'], ['#123a6b', '#ffe07a'], ['#f4f0e6', '#1c1c1c'], ['#1b6b3a', '#fff'], ['#231f20', '#ff5a3c'],
      ['#ffcc1a', '#1b1b1b'], ['#5b2a86', '#fff'], ['#0f7c8c', '#fff']];
    SHOPS.forEach((name, i) => {
      const cx = (i % 4) * 256, cy = Math.floor(i / 4) * 64;
      const [bg, fg] = palettes[i % palettes.length];
      x.fillStyle = bg; x.fillRect(cx + 2, cy + 2, 252, 60);
      x.fillStyle = fg;
      x.font = `bold ${name.length > 14 ? 17 : 30}px Arial, Helvetica, sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(name, cx + 128, cy + 33, 240);
    });
    return c;
  }

  // Billboard ads (made-up brands): 2 x 4 cells of 512 x 256.
  const ADS = [
    ['ZEPHYR SODA', 'taste the updraft', '#ff3d6e', '#ffd23c'],
    ['KITE PHONES', 'the K9 is here', '#1a1a2e', '#3cf2ff'],
    ['AURORA', 'THE MUSICAL · NOW PLAYING', '#2b1055', '#ff9de2'],
    ['BLUE MOTH', 'denim since 1931', '#0d3b66', '#faf0ca'],
    ['ORBIT AIR', 'fly further for less', '#f95738', '#ffffff'],
    ['FJORD', 'watches for the bold', '#111111', '#e0c068'],
    ['PULSE', 'energy that keeps up', '#00a878', '#fefefe'],
    ['MOONBEAM TV', 'season 4 streaming', '#240046', '#ffb703'],
  ];
  function billboards() {
    const c = canvas(1024, 1024), x = c.getContext('2d');
    ADS.forEach((ad, i) => {
      const cx = (i % 2) * 512, cy = Math.floor(i / 2) * 256;
      const g = x.createLinearGradient(cx, cy, cx + 512, cy + 256);
      g.addColorStop(0, ad[2]); g.addColorStop(1, shade(ad[2], -40));
      x.fillStyle = g; x.fillRect(cx, cy, 512, 256);
      x.globalAlpha = 0.25; x.fillStyle = ad[3];
      for (let k = 0; k < 5; k++) { x.beginPath(); x.arc(cx + 60 + rnd() * 400, cy + rnd() * 256, 20 + rnd() * 90, 0, 7); x.fill(); }
      x.globalAlpha = 1;
      x.fillStyle = ad[3]; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
      x.font = 'bold 74px Arial Black, Arial, sans-serif'; x.fillText(ad[0], cx + 28, cy + 130, 460);
      x.font = 'italic 30px Arial, sans-serif'; x.fillText(ad[1], cx + 32, cy + 185, 440);
      x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillRect(cx + 28, cy + 205, 120, 6);
    });
    return c;
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = U.clamp((n >> 16) + amt, 0, 255), g = U.clamp(((n >> 8) & 255) + amt, 0, 255), b = U.clamp((n & 255) + amt, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  function arrow() {
    const c = canvas(64, 128), x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(26, 40, 12, 88);
    x.beginPath(); x.moveTo(32, 0); x.lineTo(58, 44); x.lineTo(6, 44); x.fill();
    return c;
  }

  function build() {
    const sf = storefront();
    const T = {
      brick: tex(brick(), 16, 12.8), limestone: tex(limestone(), 16, 12.8), glass: tex(glass(), 12, 12), deco: tex(deco(), 12, 12.8),
      store: tex(sf.map, 12, 5), storeEmissive: tex(sf.emissive, 12, 5), roof: tex(roof(), 16, 16),
      asphalt: tex(asphalt(), 24, 24), sidewalk: tex(sidewalk(), 6, 6), grass: tex(grass(), 10, 10),
      redPavers: tex(pavers('#b5535a'), 4, 4), plazaPavers: tex(pavers('#b9ab98'), 4, 4), path: tex(gravelPath(), 6, 6),
      signs: tex(signs()), billboards: tex(billboards()), arrow: tex(arrow()),
    };
    T.signs.wrapS = T.signs.wrapT = THREE.ClampToEdgeWrapping;
    T.billboards.wrapS = T.billboards.wrapT = THREE.ClampToEdgeWrapping;
    return T;
  }

  SR.TEX_TILE = { brick: [16, 12.8], limestone: [16, 12.8], glass: [12, 12], deco: [12, 12.8], store: [12, 5] };
  SR.SHOPS = SHOPS;
  SR.ADS = ADS;
  SR.buildTextures = build;
})();
