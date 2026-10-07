// Motivation problem 03 in 3D: the billiards scene with Codex's camera (one fixed pose) and Plumb's camera, which
// turns frame by frame. Data: data/scene-billiards.json (bodies at t=0 and the first frame's camera, MuJoCo z-up,
// quaternions [w, x, y, z]) and data/camera-billiards.json (each frame's rotation from the first frame, as a rotation
// vector in three.js camera axes). Plumb's camera does not translate in this scene; it only turns, by up to 1.4 deg,
// so the view can draw the rotation 10x larger (labelled), or at true scale.
const mount = document.getElementById('camviz');
const scaleBtn = document.getElementById('camviz-scale');
const readout = document.getElementById('camera-readout');
const LENGTH = 4.6;   // frustum length in scene units: just past the farthest moving ball
const START = 1.5;    // seconds of the clip skipped in the loop: the camera holds still until about 2.3 s
let started = false;

if (mount) {
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { if (es[0].isIntersecting) start(); }, { rootMargin: '300px' }).observe(mount);
  } else start();
}

async function start() {
  if (started) return;
  started = true;
  try {
    const THREE = await import('three');
    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
    const [world, cam] = await Promise.all(['data/scene-billiards.json', 'data/camera-billiards.json']
      .map(u => fetch(u).then(r => (r.ok ? r.json() : Promise.reject(new Error(`${u}: ${r.status}`))))));
    build(THREE, OrbitControls, world, cam);
  } catch (err) {
    console.error(err);
    mount.textContent = 'The 3D view could not load. Reload the page to try again.';
  }
}

function build(THREE, OrbitControls, world, cam) {
  const css = getComputedStyle(document.documentElement);
  const color = (name, fallback) => new THREE.Color((css.getPropertyValue(name) || fallback).trim());
  const SIM = color('--sim', '#1f5f8b'), BAD = color('--bad', '#b3261e');

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  mount.innerHTML = '';
  mount.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f10);
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x2a2420, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(2, 3, 6);
  scene.add(sun);

  // The scene at t = 0: balls and table (spheres and boxes)
  for (const b of world.bodies || []) {
    const g = new THREE.Group();
    g.position.fromArray(b.pos);
    g.quaternion.set(b.quat[1], b.quat[2], b.quat[3], b.quat[0]);
    for (const geom of b.geoms || []) {
      const s = geom.size || [];
      let geo = null;
      if (geom.type === 'sphere') geo = new THREE.SphereGeometry(s[0], 32, 16);
      else if (geom.type === 'box') geo = new THREE.BoxGeometry(2 * s[0], 2 * s[1], 2 * s[2]);
      if (!geo) continue;
      const [r, gg, bb] = geom.rgba || [0.6, 0.6, 0.6];
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color(r, gg, bb), roughness: 0.6 }));
      if (geom.pos) m.position.fromArray(geom.pos);
      if (geom.quat) m.quaternion.set(geom.quat[1], geom.quat[2], geom.quat[3], geom.quat[0]);
      g.add(m);
    }
    scene.add(g);
  }

  // Camera frustums (camera looks along -z, y up), from the first frame's pose
  const c0 = world.camera;
  const P0 = new THREE.Vector3().fromArray(c0.pos);
  const Q0 = new THREE.Quaternion(c0.quat[1], c0.quat[2], c0.quat[3], c0.quat[0]);
  const hh = LENGTH * Math.tan((c0.fovy * Math.PI) / 360), hw = hh * 16 / 9;
  const frustum = col => {
    const g = new THREE.Group();
    const c = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => new THREE.Vector3(x, y, -LENGTH));
    const o = new THREE.Vector3();
    const pts = [o, c[0], o, c[1], o, c[2], o, c[3], c[0], c[1], c[1], c[2], c[2], c[3], c[3], c[0], o, new THREE.Vector3(0, 0, -LENGTH)];
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col })));
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw, 2 * hh),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    plane.position.z = -LENGTH;
    g.add(plane);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.2), new THREE.MeshStandardMaterial({ color: col }));
    body.position.z = 0.1;
    g.add(body);
    g.position.copy(P0);
    g.quaternion.copy(Q0);
    scene.add(g);
    return g;
  };
  const codex = frustum(BAD), plumb = frustum(SIM);
  codex.renderOrder = 1;

  // Where each camera's centre ray ends: Codex's stays put, Plumb's draws a trail
  const dot = (col, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8), new THREE.MeshBasicMaterial({ color: col })); scene.add(m); return m; };
  const codexEnd = dot(BAD, 0.06), plumbEnd = dot(SIM, 0.07);
  codexEnd.position.copy(new THREE.Vector3(0, 0, -LENGTH).applyQuaternion(Q0).add(P0));
  const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: SIM }));
  scene.add(trail);

  let gain = 10;
  const rel = (i, k) => {
    const v = new THREE.Vector3().fromArray(cam.plumb_rotvec_three[i]);
    const a = v.length();
    return a > 0 ? new THREE.Quaternion().setFromAxisAngle(v.divideScalar(a), a * k) : new THREE.Quaternion();
  };
  const endOf = q => new THREE.Vector3(0, 0, -LENGTH).applyQuaternion(Q0.clone().multiply(q)).add(P0);
  const setTrail = () => trail.geometry.setFromPoints(cam.t.map((_, i) => endOf(rel(i, gain))));
  setTrail();

  // Viewpoint: behind, right of and above the cameras, looking at the scene in front of them
  const view = new THREE.PerspectiveCamera(40, 16 / 9, 0.01, 200);
  view.up.set(0, 0, 1);
  view.position.copy(new THREE.Vector3(3.2, 2.4, 3.4).applyQuaternion(Q0).add(P0));
  const controls = new OrbitControls(view, renderer.domElement);
  controls.target.copy(new THREE.Vector3(0, -0.2, -2.6).applyQuaternion(Q0).add(P0));
  controls.enableDamping = true;
  controls.update();

  const resize = () => {
    const w = mount.clientWidth, h = Math.round(w * 9 / 16);
    renderer.setSize(w, h, false);
    view.aspect = w / h;
    view.updateProjectionMatrix();
  };
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(mount);

  scaleBtn?.addEventListener('click', () => {
    gain = gain === 10 ? 1 : 10;
    scaleBtn.setAttribute('aria-pressed', String(gain === 10));
    scaleBtn.textContent = gain === 10 ? 'Rotation shown 10×' : 'True scale';
    setTrail();
  });
  if (scaleBtn) scaleBtn.disabled = false;

  // The clip's own clock from START, looped with a one-second hold at the end; paused while off screen
  const T = cam.t[cam.t.length - 1];
  const t0 = performance.now();
  let shown = true;
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { shown = es[0].isIntersecting; }).observe(mount);
  const at = (a, x) => {
    const i = cam.t.findIndex(v => v >= x);
    if (i < 0) return a.length - 1;
    return i;
  };
  const tick = () => {
    if (shown) {
      const x = Math.min(START + ((performance.now() - t0) / 1000) % (T - START + 1), T);
      const i = at(cam.t, x);
      const q = rel(i, gain);
      plumb.quaternion.copy(Q0).multiply(q);
      plumbEnd.position.copy(endOf(q));
      if (readout) readout.textContent = `${x.toFixed(2)} s · Plumb's camera: ${cam.plumb_pan_deg[i].toFixed(2)}° right, ${cam.plumb_tilt_deg[i].toFixed(2)}° up · Codex's: 0°, 0°`;
      controls.update();
      renderer.render(scene, view);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
