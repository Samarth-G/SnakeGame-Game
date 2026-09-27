// Step 1: greybox city with a free-fly camera.
(function () {
  const container = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc3e6);
  scene.fog = new THREE.FogExp2(0xa9c2dc, 0.00022);
  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.25, 12000);
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x445566, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(-0.4, 1, 0.3);
  scene.add(sun);

  const world = new SR.World(scene);
  SR.world = world;
  world.finalize();
  world.buildGreybox();

  const st = SR.WORLD.supertall;
  camera.position.set(st.x, st.height + 60, st.z - 20);
  let yaw = Math.PI, pitch = -0.25;
  const keys = {};
  addEventListener('keydown', (e) => (keys[e.code] = true));
  addEventListener('keyup', (e) => (keys[e.code] = false));
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) { yaw -= e.movementX * 0.002; pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.002)); }
  });
  const overlay = document.getElementById('overlay');
  document.getElementById('loading').hidden = true;
  document.getElementById('start').hidden = false;
  overlay.addEventListener('click', () => renderer.domElement.requestPointerLock());
  document.addEventListener('pointerlockchange', () => (overlay.style.display = document.pointerLockElement ? 'none' : 'flex'));
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const f = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const sp = keys.ShiftLeft ? 250 : 60;
    if (keys.KeyW) camera.position.addScaledVector(f, sp * dt);
    if (keys.KeyS) camera.position.addScaledVector(f, -sp * dt);
    if (keys.KeyD) camera.position.addScaledVector(r, sp * dt);
    if (keys.KeyA) camera.position.addScaledVector(r, -sp * dt);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  SR.camera = camera;
  SR.setView = (x, y, z, yw, p) => { camera.position.set(x, y, z); yaw = yw; pitch = p; overlay.style.display = 'none'; };
  SR.debugInfo = () => ({ buildings: world.layout.buildings.length, boxes: world.col.boxes.length, perches: world.perches.length });
})();
