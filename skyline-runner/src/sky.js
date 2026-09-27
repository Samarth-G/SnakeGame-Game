// Afternoon lighting: sky dome with sun glow, a few cumulus clouds, blue-grey haze, a sun
// whose shadow map follows the hero, and an environment map captured from the real city
// so the glass towers reflect sky and skyline.
(function () {
  const U = SR.util;

  class Sky {
    constructor(scene, renderer) {
      this.scene = scene; this.renderer = renderer;
      this.sunDir = new THREE.Vector3(-0.52, 0.62, 0.58).normalize();   // afternoon sun in the south-west
      this.fogColor = new THREE.Color(0xb3c5d6);
      scene.fog = new THREE.FogExp2(this.fogColor, 0.000175);
      scene.background = this.fogColor.clone();

      // Sky dome follows the camera and is drawn first.
      this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
        uniforms: { uSun: { value: this.sunDir }, uHorizon: { value: this.fogColor } },
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
        fragmentShader: `
          uniform vec3 uSun; uniform vec3 uHorizon; varying vec3 vDir;
          void main(){
            vec3 d = normalize(vDir);
            float h = max(d.y, 0.0);
            vec3 zenith = vec3(0.19, 0.38, 0.72);
            vec3 col = mix(uHorizon * 1.02, zenith, pow(h, 0.55));
            float s = max(dot(d, uSun), 0.0);
            col += vec3(1.0, 0.86, 0.62) * (pow(s, 12.0) * 0.35 + pow(s, 400.0) * 6.0);
            col = mix(col, uHorizon, smoothstep(0.08, -0.02, d.y));
            gl_FragColor = vec4(col, 1.0);
          }`,
      }));
      this.dome.scale.setScalar(9000);
      this.dome.renderOrder = -1000;
      this.dome.frustumCulled = false;
      scene.add(this.dome);

      // Lights.
      this.hemi = new THREE.HemisphereLight(0xc4dafc, 0x76644f, 0.75);
      scene.add(this.hemi);
      const sun = this.sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
      const sc = sun.shadow.camera; sc.near = 10; sc.far = 1600;
      scene.add(sun); scene.add(sun.target);
      this.shadowR = 110;

      this.makeClouds();
    }

    makeClouds() {
      const tex = this.cloudTexture();
      const rnd = U.rng(21);
      this.clouds = [];
      for (let i = 0; i < 16; i++) {
        const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, color: 0xffffff, opacity: 0.92 });
        const s = new THREE.Sprite(m);
        const a = rnd() * Math.PI * 2, r = 3500 + rnd() * 3500;
        s.position.set(Math.cos(a) * r, 900 + rnd() * 700, Math.sin(a) * r);
        const w = 900 + rnd() * 1300;
        s.scale.set(w, w * (0.42 + rnd() * 0.15), 1);
        s.material.rotation = (rnd() - 0.5) * 0.1;
        s.renderOrder = -900;
        this.scene.add(s);
        this.clouds.push(s);
      }
    }

    cloudTexture() {
      const c = document.createElement('canvas'); c.width = 512; c.height = 256;
      const x = c.getContext('2d'), rnd = U.rng(5);
      for (let i = 0; i < 70; i++) {
        const px = 80 + rnd() * 352, py = 100 + rnd() * 90 - Math.abs(px - 256) * 0.12, r = 28 + rnd() * 52;
        const g = x.createRadialGradient(px, py - r * 0.3, r * 0.1, px, py, r);
        g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.6, 'rgba(242,246,252,0.7)'); g.addColorStop(1, 'rgba(225,232,242,0)');
        x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
      }
      // flat, slightly shaded base
      const g = x.createLinearGradient(0, 150, 0, 230);
      g.addColorStop(0, 'rgba(180,190,205,0)'); g.addColorStop(1, 'rgba(160,172,190,0.35)');
      x.globalCompositeOperation = 'source-atop'; x.fillStyle = g; x.fillRect(0, 0, 512, 256);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }

    // Capture the real city from midtown into a cube map for reflections / IBL.
    captureEnvironment(pos) {
      const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
      const cam = new THREE.CubeCamera(5, 12000, rt);
      cam.position.copy(pos);
      this.scene.add(cam);
      const prevEnv = this.scene.environment;
      this.scene.environment = null;
      cam.update(this.renderer, this.scene);
      this.scene.remove(cam);
      const pm = new THREE.PMREMGenerator(this.renderer);
      const env = pm.fromCubemap(rt.texture).texture;
      pm.dispose(); rt.dispose();
      this.scene.environment = env;
      if (prevEnv) prevEnv.dispose();
      return env;
    }

    update(camera, focus, alt) {
      this.dome.position.copy(camera.position);
      // Shadow frustum follows the hero, grows with altitude, snapped to texels to avoid shimmer.
      const R = this.shadowR = U.clamp(90 + alt * 0.6, 90, 420);
      const sc = this.sun.shadow.camera;
      if (sc.right !== R) { sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.updateProjectionMatrix(); }
      const texel = (2 * R) / this.sun.shadow.mapSize.x;
      const tx = Math.round(focus.x / texel) * texel, tz = Math.round(focus.z / texel) * texel;
      this.sun.target.position.set(tx, focus.y * 0.0, tz);
      this.sun.position.set(tx + this.sunDir.x * 800, this.sunDir.y * 800, tz + this.sunDir.z * 800);
      this.sun.target.updateMatrixWorld();
    }
  }

  // Street canyons get darker toward the ground: a cheap stand-in for GI/AO on facades.
  SR.addCanyonShading = function (mat, strength) {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCanyonY;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvCanyonY = (modelMatrix * vec4(transformed, 1.0)).y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCanyonY;')
        .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= mix(${(1 - strength).toFixed(2)}, 1.0, smoothstep(0.0, 38.0, vCanyonY));`);
    };
    mat.needsUpdate = true;
  };

  // Animated water with a procedural normal map and sky reflections.
  SR.makeWaterMaterial = function () {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'), img = x.createImageData(256, 256), d = img.data;
    const h = (i, j) => Math.sin(i * 0.19 + Math.sin(j * 0.07) * 2) * 0.5 + Math.sin(j * 0.23 + i * 0.05) * 0.35 + Math.sin((i + j) * 0.41) * 0.15 + (SR.util.hash2(i, j) - 0.5) * 0.25;
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
      const dx = h(i + 1, j) - h(i - 1, j), dy = h(i, j + 1) - h(i, j - 1);
      const k = (j * 256 + i) * 4;
      d[k] = 128 + dx * 90; d[k + 1] = 128 + dy * 90; d[k + 2] = 255; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const n = new THREE.CanvasTexture(c);
    n.wrapS = n.wrapT = THREE.RepeatWrapping; n.repeat.set(900, 900); n.colorSpace = THREE.NoColorSpace;
    const m = new THREE.MeshStandardMaterial({ color: 0x24394a, roughness: 0.12, metalness: 0.25, normalMap: n, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.1 });
    m.userData.normalTex = n;
    return m;
  };

  SR.Sky = Sky;
})();
