// Game bootstrap and main loop.
(function () {
  const S = () => SR.Player.S;

  // Step-2 placeholder: simple orbit camera behind the player.
  class SimpleCam {
    constructor(camera) { this.camera = camera; this.yaw = Math.PI; this.pitch = -0.2; this.fwd = new THREE.Vector3(); this.pos = camera.position; }
    look(inp, dt) {
      this.yaw -= inp.mouseLook.x + inp.look.x * dt;
      this.pitch = Math.max(-1.45, Math.min(1.2, this.pitch - inp.mouseLook.y - inp.look.y * dt));
      this.fwd.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    }
    update(dt, player) {
      const T = SR.TUNING;
      this.camera.position.copy(player.pos).addScaledVector(this.fwd, -T.camDistance).y += T.camHeight;
      this.camera.lookAt(player.pos.x, player.pos.y + T.camHeight * 0.5, player.pos.z);
    }
  }

  class Game {
    constructor() {
      const container = document.getElementById('game');
      const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
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
      this.cam = new SimpleCam(this.camera);
      this.web = new SR.WebLine(scene);
      this.debug = new SR.Debug(this);

      this.avatar = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 4, 10), new THREE.MeshStandardMaterial({ color: 0x19c3c9 }));
      scene.add(this.avatar);
      this.hand = new THREE.Vector3();

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
    }

    update(dt, headless) {
      const inp = this.input.poll();
      this.cam.look(inp, dt);
      const p = this.player;
      p.update(dt, inp, this.cam);
      p.events.length = 0;
      if (headless) return;
      this.cam.update(dt, p);
      this.avatar.position.copy(p.pos);
      this.hand.copy(p.pos); this.hand.y += 0.8;
      this.web.update(dt, p, this.hand);
      this.debug.update(dt);
    }

    frame(now) {
      const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
      this.last = now;
      this.update(dt, false);
      this.renderer.render(this.scene, this.camera);
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
  });
  requestAnimationFrame((t) => game.frame(t));
})();
