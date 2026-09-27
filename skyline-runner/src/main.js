// Game bootstrap and main loop.
(function () {
  const S = () => SR.Player.S;

  class Game {
    constructor() {
      const container = document.getElementById('game');
      const renderer = new THREE.WebGLRenderer({ antialias: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(innerWidth, innerHeight);
      container.appendChild(renderer.domElement);
      this.renderer = renderer;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x9fc3e6);
      scene.fog = new THREE.FogExp2(0xa9c2dc, 0.00022);
      this.scene = scene;
      this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.25, 12000);
      scene.add(new THREE.HemisphereLight(0xdfefff, 0x445566, 1.2));
      const sun = new THREE.DirectionalLight(0xffffff, 2.0);
      sun.position.set(-0.4, 1, 0.3);
      scene.add(sun);

      this.world = new SR.World(scene);
      SR.world = this.world;
      this.world.finalize();
      this.world.buildGreybox();

      this.input = new SR.Input(renderer.domElement);
      this.player = new SR.Player(this.world);
      this.cam = new SR.CameraRig(this.camera, this.world);
      this.post = new SR.Post(renderer);
      this.web = new SR.WebLine(scene);
      this.debug = new SR.Debug(this);

      this.avatar = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 4, 10), new THREE.MeshStandardMaterial({ color: 0x19c3c9 }));
      scene.add(this.avatar);
      this.hand = new THREE.Vector3();
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
      if (headless) { p.events.length = 0; return; }
      this.time += dt;
      for (const e of p.events) this.onEvent(e);
      p.events.length = 0;
      this.cam.update(dt, p);
      this.avatar.position.copy(p.pos);
      const q = p.aimTarget;
      this.aimMarker.visible = !!q;
      if (q) {
        this.aimMarker.position.set(q.x, q.y + 0.3, q.z);
        this.aimMarker.quaternion.copy(this.camera.quaternion);
        this.aimMarker.scale.setScalar(0.6 + this.camera.position.distanceTo(this.aimMarker.position) * 0.025);
      }
      this.hand.copy(p.pos); this.hand.y += 0.8;
      this.web.update(dt, p, this.hand);
      this.debug.update(dt);
    }

    onEvent(e) {
      if (e.type === 'hardland') this.cam.addShake(0.9);
      else if (e.type === 'roll') this.cam.addShake(0.35);
      else if (e.type === 'land' && e.impact > 12) this.cam.addShake(0.2);
      else if (e.type === 'thwip') this.web.addSplat(e.x, e.y, e.z, e.nx, e.ny, e.nz);
    }

    render() {
      const c = this.cam;
      this.post.render(this.scene, this.camera, { blur: c.speedFx, lines: c.speedFx, time: this.time });
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
  overlay.addEventListener('click', () => game.renderer.domElement.requestPointerLock());
  document.addEventListener('pointerlockchange', () => (overlay.style.display = document.pointerLockElement ? 'none' : 'flex'));
  addEventListener('resize', () => {
    game.camera.aspect = innerWidth / innerHeight; game.camera.updateProjectionMatrix();
    game.renderer.setSize(innerWidth, innerHeight);
    game.post.setSize();
  });
  requestAnimationFrame((t) => game.frame(t));
})();
