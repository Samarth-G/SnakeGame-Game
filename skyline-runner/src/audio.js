// Procedural Web Audio: no sound files. Web thwip, rope creak, release whoosh, wind that
// rises with speed, landing thuds, city ambience (traffic bed, horns, crowd murmur) and
// distant sirens. World sounds go through HRTF panners so they pan and fade with distance.
(function () {
  const U = SR.util;

  class Audio {
    constructor() { this.ctx = null; this.enabled = false; this.t = 0; }

    // Must be called from a user gesture.
    init() {
      if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain(); this.master.gain.value = 0.8;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(ctx.destination);
      this.white = this.noiseBuffer('white', 2);
      this.brown = this.noiseBuffer('brown', 4);
      this.pink = this.noiseBuffer('pink', 3);

      // Wind: filtered noise whose level and brightness follow speed.
      this.wind = this.loop(this.pink);
      this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.Q.value = 0.6;
      this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
      this.wind.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.master);
      // Traffic bed: low rumble that fades with altitude.
      this.bed = this.loop(this.brown);
      const bedF = ctx.createBiquadFilter(); bedF.type = 'lowpass'; bedF.frequency.value = 420;
      this.bedGain = ctx.createGain(); this.bedGain.gain.value = 0.1;
      this.bed.connect(bedF); bedF.connect(this.bedGain); this.bedGain.connect(this.master);
      // Crowd murmur at the two plazas (spatial).
      this.crowds = [];
      for (const p of SR.game ? this.plazaSpots() : []) this.crowds.push(this.makeCrowd(p));
      this.nextHorn = 2; this.nextSiren = 6; this.nextCreak = 0;
      this.enabled = true;
    }

    plazaSpots() {
      const g = SR.game, spots = [];
      if (g.city.fountain) spots.push({ x: g.city.fountain.x, y: 2, z: g.city.fountain.z, level: 0.5 });
      const e = g.world.layout.plazas.ent; spots.push({ x: e.x, y: 2, z: e.z, level: 0.7 });
      return spots;
    }

    noiseBuffer(kind, secs) {
      const ctx = this.ctx, n = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
      let last = 0, b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w;
        else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        else { b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048; d[i] = (b0 + b1 + b2 + w * 0.05) * 0.6; }
      }
      return b;
    }

    loop(buf) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * buf.duration); return s; }

    panner(x, y, z, ref, rolloff) {
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
      p.refDistance = ref || 12; p.rolloffFactor = rolloff == null ? 1.2 : rolloff; p.maxDistance = 5000;
      this.setPos(p, x, y, z);
      p.connect(this.master);
      return p;
    }
    setPos(p, x, y, z) {
      if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
    }

    makeCrowd(spot) {
      const ctx = this.ctx, src = this.loop(this.pink);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 1.2;
      const g = ctx.createGain(); g.gain.value = spot.level;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 3.3;
      const lfoG = ctx.createGain(); lfoG.gain.value = spot.level * 0.35;
      lfo.connect(lfoG); lfoG.connect(g.gain); lfo.start();
      src.connect(bp); bp.connect(g); g.connect(this.panner(spot.x, spot.y, spot.z, 25, 1.4));
      return g;
    }

    // Short envelope helper.
    env(node, t0, peak, a, d) { const g = node.gain; g.setValueAtTime(0.0001, t0); g.exponentialRampToValueAtTime(peak, t0 + a); g.exponentialRampToValueAtTime(0.0001, t0 + a + d); }

    noiseHit(dest, dur, f0, f1, q, peak, type) {
      const ctx = this.ctx, t = ctx.currentTime, s = ctx.createBufferSource();
      s.buffer = this.white;
      const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain(); this.env(g, t, peak, Math.min(0.01, dur * 0.2), dur);
      s.connect(f); f.connect(g); g.connect(dest);
      s.start(t, Math.random()); s.stop(t + dur + 0.05);
    }

    tone(dest, type, f0, f1, dur, peak, delay) {
      const ctx = this.ctx, t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      this.env(g, t, peak, 0.005, dur);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    }

    // -------------------------------------------------------------------------- events
    onEvent(e, player) {
      if (!this.enabled) return;
      const m = this.master;
      switch (e.type) {
        case 'thwip':
          this.noiseHit(m, 0.13, 2600, 6500, 2.5, 0.5);
          this.tone(m, 'triangle', 1500, 380, 0.11, 0.12);
          this.noiseHit(this.panner(e.x, e.y, e.z, 6, 1.2), 0.08, 1800, 900, 1.5, 0.6); // splat at the anchor
          break;
        case 'nofire': this.tone(m, 'sine', 420, 300, 0.06, 0.05); break;
        case 'release': {
          const k = U.clamp((e.speed || 20) / 45, 0.3, 1.3);
          this.noiseHit(m, 0.45, 380, 2400, 1.1, 0.35 * k);
          break;
        }
        case 'jump': case 'walljump': this.noiseHit(m, 0.18, 500, 1500, 1, 0.12); break;
        case 'land': this.tone(m, 'sine', 110, 50, 0.16, 0.25 * U.clamp((e.impact || 5) / 15, 0.2, 1)); this.noiseHit(m, 0.1, 500, 200, 1, 0.12, 'lowpass'); break;
        case 'hardland': case 'roll':
          this.tone(m, 'sine', 90, 32, 0.45, 0.9);
          this.noiseHit(m, 0.35, 900, 120, 0.7, 0.6, 'lowpass');
          this.tone(m, 'triangle', 60, 30, 0.6, 0.3, 0.02);
          break;
        case 'vault': this.noiseHit(m, 0.12, 900, 500, 1.2, 0.1); break;
        case 'wallrun': this.noiseHit(m, 0.1, 700, 400, 1.5, 0.12); break;
        case 'zip': this.tone(m, 'sawtooth', 200, 900, 0.5, 0.05); this.noiseHit(m, 0.13, 2600, 6500, 2.5, 0.35); break;
        case 'perch': this.noiseHit(m, 0.08, 800, 400, 1, 0.12); break;
        case 'launch': this.noiseHit(m, 0.6, 300, 3000, 1, 0.4); break;
        case 'dive': this.noiseHit(m, 0.5, 250, 1400, 0.8, 0.2); break;
        case 'suit':
          for (const [f, d] of [[1320, 0], [1760, 0.05], [2640, 0.1]]) this.tone(m, 'sine', f, f * 1.01, 0.35, 0.08, d);
          this.noiseHit(m, 0.4, 6000, 9000, 3, 0.06);
          break;
        case 'lowpoint': break;
        case 'splash': this.noiseHit(m, 0.8, 1800, 300, 0.6, 0.6, 'lowpass'); break;
      }
    }

    // -------------------------------------------------------------------------- frame
    update(dt, game) {
      if (!this.enabled) return;
      const ctx = this.ctx, t = ctx.currentTime, cam = game.camera, p = game.player;
      this.t += dt;
      // Listener follows the camera.
      const L = ctx.listener, f = new THREE.Vector3(), u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      cam.getWorldDirection(f);
      if (L.positionX) {
        L.positionX.value = cam.position.x; L.positionY.value = cam.position.y; L.positionZ.value = cam.position.z;
        L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z;
      } else { L.setPosition(cam.position.x, cam.position.y, cam.position.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }

      const speed = p.vel.length(), alt = Math.max(0, p.feetY);
      const w = U.smoothstep(4, 70, speed);
      this.windGain.gain.setTargetAtTime(0.03 + w * 1.4 + (alt > 150 ? 0.08 : 0), t, 0.15);
      this.windFilter.frequency.setTargetAtTime(250 + w * 1600, t, 0.2);
      this.bedGain.gain.setTargetAtTime((0.03 + 0.17 * (1 - U.smoothstep(15, 250, alt))) * (1 - 0.6 * w), t, 0.4);

      // Rope creak under tension.
      if (p.state === SR.Player.S.SWINGING && p.tension > 0.05) {
        this.nextCreak -= dt;
        if (this.nextCreak <= 0) {
          this.nextCreak = 0.18 + Math.random() * 0.3 * (1.2 - p.tension);
          const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
          o.type = 'sawtooth'; o.frequency.setValueAtTime(70 + Math.random() * 60, t); o.frequency.linearRampToValueAtTime(110 + Math.random() * 80, t + 0.09);
          bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 600; bp.Q.value = 6;
          this.env(g, t, 0.05 + 0.12 * p.tension, 0.01, 0.1);
          o.connect(bp); bp.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.15);
        }
      }

      // Horns from nearby traffic.
      this.nextHorn -= dt;
      if (this.nextHorn <= 0) {
        this.nextHorn = 1.5 + Math.random() * 5;
        const car = game.traffic.nearestCar(cam.position.x + (Math.random() - 0.5) * 200, cam.position.z + (Math.random() - 0.5) * 200);
        if (car) {
          const pan = this.panner(car.x, 1.2, car.z, 14, 1.3);
          const n = Math.random() < 0.35 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const d = i * 0.22, len = 0.14 + Math.random() * 0.25;
            for (const fr of [405, 510]) this.tone(pan, 'square', fr, fr * 0.99, len, 0.05, d);
          }
        }
      }
      // Distant sirens.
      this.nextSiren -= dt;
      if (this.nextSiren <= 0) {
        this.nextSiren = 18 + Math.random() * 25;
        const a = Math.random() * Math.PI * 2, r = 350 + Math.random() * 500;
        const pan = this.panner(cam.position.x + Math.cos(a) * r, 5, cam.position.z + Math.sin(a) * r, 60, 1.0);
        const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = 900;
        lfo.frequency.value = Math.random() < 0.5 ? 0.25 : 2.6; lg.gain.value = 320;
        lfo.connect(lg); lg.connect(o.frequency);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 1.5); g.gain.setValueAtTime(0.14, t + 7); g.gain.exponentialRampToValueAtTime(0.0001, t + 10);
        o.connect(lp); lp.connect(g); g.connect(pan);
        o.start(t); lfo.start(t); o.stop(t + 10.2); lfo.stop(t + 10.2);
        // drift the siren along a street
        const sx = cam.position.x + Math.cos(a) * r, sz = cam.position.z + Math.sin(a) * r, vx = (Math.random() - 0.5) * 30, vz = (Math.random() - 0.5) * 30;
        for (let k = 1; k <= 10; k++) {
          if (pan.positionX) { pan.positionX.linearRampToValueAtTime(sx + vx * k, t + k); pan.positionZ.linearRampToValueAtTime(sz + vz * k, t + k); }
        }
      }
    }
  }

  SR.Audio = Audio;
})();
