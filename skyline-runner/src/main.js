// Game bootstrap and main loop.
(function () {
  const S = () => SR.Player.S;

  class Game {
    constructor() {
      const container = document.getElementById('game');
      const renderer = new THREE.WebGLRenderer({ antialias: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.95;
      renderer.info.autoReset = false;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(innerWidth, innerHeight);
      container.appendChild(renderer.domElement);
      this.renderer = renderer;

      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const scene = new THREE.Scene();
      this.scene = scene;
      this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.25, 12000);
      this.sky = new SR.Sky(scene, renderer);

      this.world = new SR.World(scene);
      SR.world = this.world;
      this.textures = SR.buildTextures();
      this.city = new SR.City(this.world, scene, this.textures);
      this.city.build();
      this.world.finalize();
      this.traffic = new SR.Traffic(this.world, scene, this.city);
      this.polishMaterials();
      this.sky.captureEnvironment(new THREE.Vector3(150, 420, -900)); // high above the park: sky and skyline

      this.input = new SR.Input(renderer.domElement);
      this.player = new SR.Player(this.world);
      this.cam = new SR.CameraRig(this.camera, this.world);
      this.post = new SR.Post(renderer);
      this.web = new SR.WebLine(scene);
      this.debug = new SR.Debug(this);

      this.hero = new SR.Hero(scene);
      this.hud = new SR.HUD(this.world);
      this.audio = new SR.Audio();
      // Small in-world highlight of where the next web would attach.
      this.anchorMarker = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.85, fog: false }));
      this.anchorMarker.renderOrder = 10;
      this.anchorMarker.visible = false;
      scene.add(this.anchorMarker);
      this.previewTimer = 0;
      this.flash = 0;
      this.aimMarker = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.7, 32), new THREE.MeshBasicMaterial({ color: 0xffd23c, depthTest: false, transparent: true, opacity: 0.9, fog: false }));
      this.aimMarker.renderOrder = 10;
      scene.add(this.aimMarker);
      this.time = 0;

      this.input.onKey = (code) => {
        if (code === 'F3' || code === 'Backquote') this.debug.toggleOverlay();
        if (code === 'F4') this.debug.togglePanel();
        if (code === 'KeyR') this.spawn();
      };
      this.spawn();
    }

    polishMaterials() {
      const M = this.city.M;
      for (const [k, v] of [['brick', 0.45], ['limestone', 0.45], ['deco', 0.45], ['store', 0.35], ['glass', 0.35], ['trim', 0.3], ['metal', 0.3]]) SR.addCanyonShading(M[k], v);
      this.city.water.material = SR.makeWaterMaterial();
    }

    spawn() {
      const st = this.world.layout.supertall.spire;
      this.player.spawnPerched(st.x, st.y1, st.z, 0.35, 0.94);
      this.cam.yaw = Math.PI - 0.36; this.cam.pitch = -0.25;
      this.cam.snap();
    }

    update(dt, headless) {
      const inp = this.input.poll();
      this.cam.look(inp, dt);
      const p = this.player;
      p.update(dt, inp, this.cam);
      if (inp.pressed.suit) { this.hero.switchSuit(); this.flash = 0.35; p.emit('suit'); }
      if (headless) { p.events.length = 0; return; }
      this.time += dt;
      for (const e of p.events) this.onEvent(e);
      p.events.length = 0;
      this.hero.update(dt, p, this.time);
      this.cam.update(dt, p);
      this.hero.root.visible = this.camera.position.distanceTo(p.pos) > 0.55;
      this.flash = Math.max(0, this.flash - dt * 1.5);
      this.hud.draw(p, this.cam);
      this.updateAnchorPreview(dt, p);
      const q = p.aimTarget;
      this.aimMarker.visible = !!q;
      if (q) {
        this.aimMarker.position.set(q.x, q.y + 0.3, q.z);
        this.aimMarker.quaternion.copy(this.camera.quaternion);
        this.aimMarker.scale.setScalar(0.6 + this.camera.position.distanceTo(this.aimMarker.position) * 0.025);
      }
      this.web.update(dt, p, this.hero.handWorld);
      this.city.update(this.time);
      this.sky.update(this.camera, p.pos, Math.max(0, p.feetY));
      this.city.water.material.userData.normalTex.offset.set(this.time * 0.004, this.time * 0.0025);
      this.traffic.update(dt, p, this.camera.position);
      this.audio.update(dt, this);
      SR.foliageUniforms.uCamPos.value.copy(this.camera.position);
      SR.foliageUniforms.uHeroPos.value.set(p.pos.x, p.pos.y + 0.4, p.pos.z);
      this.debug.update(dt);
    }

    updateAnchorPreview(dt, p) {
      const S = SR.Player.S, m = this.anchorMarker;
      if (p.state === S.SWINGING || p.state === S.ZIPPING || p.aimTarget) { m.visible = false; return; }
      this.previewTimer -= dt;
      if (this.previewTimer <= 0) {
        this.previewTimer = 0.08;
        const a = p.findAnchor(this.cam);
        m.visible = !!a;
        if (a) m.position.set(a.x + a.nx * 0.4, a.y + a.ny * 0.4, a.z + a.nz * 0.4);
      }
      if (m.visible) {
        m.rotation.y += dt * 3;
        m.scale.setScalar(0.5 + this.camera.position.distanceTo(m.position) * 0.018);
      }
    }

    onEvent(e) {
      this.audio.onEvent(e, this.player);
      if (e.type === 'hardland') this.cam.addShake(0.9);
      else if (e.type === 'roll') this.cam.addShake(0.35);
      else if (e.type === 'land' && e.impact > 12) this.cam.addShake(0.2);
      else if (e.type === 'thwip') this.web.addSplat(e.x, e.y, e.z, e.nx, e.ny, e.nz);
    }

    render() {
      const c = this.cam;
      this.renderer.info.reset();
      this.post.render(this.scene, this.camera, { blur: c.speedFx, lines: c.speedFx, time: this.time, flash: this.flash * 0.6, flashColor: SR.Hero.SUITS[this.hero.suitIndex].name === 'Nocturne' ? new THREE.Color(0.6, 0.7, 1.0) : new THREE.Color(1.0, 0.7, 0.45) });
    }

    frame(now) {
      const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
      this.last = now;
      this.update(dt, false);
      this.render();
      requestAnimationFrame((t) => this.frame(t));
    }
  }

  const game = new Game();
  SR.game = game;
  const overlay = document.getElementById('overlay');
  document.getElementById('loading').hidden = true;
  document.getElementById('start').hidden = false;
  overlay.addEventListener('click', () => { game.audio.init(); game.renderer.domElement.requestPointerLock(); });
  document.addEventListener('pointerlockchange', () => (overlay.style.display = document.pointerLockElement ? 'none' : 'flex'));
  addEventListener('resize', () => {
    game.camera.aspect = innerWidth / innerHeight; game.camera.updateProjectionMatrix();
    game.renderer.setSize(innerWidth, innerHeight);
    game.post.setSize();
  });
  requestAnimationFrame((t) => game.frame(t));
})();
