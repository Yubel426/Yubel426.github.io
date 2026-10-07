// 3D replay of a delivered scene: recorded MuJoCo body poses per video frame, drawn with three.js.
// Data: data/scene-<case>.json (built by scripts/build_scene_data.py). MuJoCo is z-up; quaternions are [w, x, y, z].
// Optional `textures`: a GLB of the simulated bodies' meshes with video-baked textures, one node per geom name,
// in the geom's own frame (z-up); those meshes replace the flat-colored primitives.
const $ = id => document.getElementById(id);
const mount = $('replay-mount'), loadBtn = $('replay-load'), status = $('replay-status');
const playBtn = $('replay-play'), slider = $('replay-frame'), clockOut = $('replay-clock'), viewBtn = $('replay-view');
const poster = $('replay-poster');
const leadVideo = $('show-src');   // the showcase input video; the replay follows its clock while both play

let THREE = null, OrbitControls = null, GLTFLoader = null;
let renderer, scene, camera, controls, sourceCam = null, root = null;
let data = null, bodies = new Map(), frame = 0, playing = false, last = 0, acc = 0, useSource = false;
let currentCase = null, starting = null, visible = false;
let geomMeshes = new Map(), loadToken = 0;

// The showcase tabs (site.js) announce the selected case; the scene loads once it is on screen.
window.addEventListener('showcase:select', e => {
  currentCase = e.detail.slug;
  if (poster && e.detail.poster) poster.src = e.detail.poster;
  if (renderer) loadCase(currentCase).catch(fail); else if (visible) start();
});
if ('IntersectionObserver' in window && mount) {
  new IntersectionObserver(es => es.forEach(en => { visible = en.isIntersecting; if (visible && !renderer && currentCase) start(); }),
    { rootMargin: '200px' }).observe(mount);
}
loadBtn?.addEventListener('click', () => start());
if (window.__showcase) { currentCase = window.__showcase.slug; if (poster) poster.src = window.__showcase.poster; }

function fail(err) {
  console.error(err);
  if (loadBtn) loadBtn.disabled = false;
  if (status) status.textContent = 'The 3D scene could not load. Check the connection and try again.';
}

async function start() {
  if (renderer || starting || !currentCase) return starting;
  if (loadBtn) loadBtn.disabled = true;
  if (status) status.textContent = 'Loading the 3D scene…';
  starting = (async () => {
    try {
      THREE = await import('three');
      ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
      ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'));
      setup();
      await loadCase(currentCase);
    } catch (err) { fail(err); } finally { starting = null; }
  })();
  return starting;
}

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f10);
  camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.01, 500);
  camera.up.set(0, 0, 1);
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x2a2420, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, -4, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun); scene.userData.sun = sun;
  mount.innerHTML = '';
  mount.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(mount);
  playBtn.disabled = false; slider.disabled = false; viewBtn.disabled = false;
  playBtn.addEventListener('click', () => setPlaying(!playing));
  slider.addEventListener('input', () => { setPlaying(false); setFrame(Number(slider.value)); });
  viewBtn.addEventListener('click', () => setSourceView(!useSource));
  requestAnimationFrame(tick);
}

function resize() {
  if (!renderer) return;
  const w = mount.clientWidth, h = mount.clientHeight || Math.round(w * 9 / 16);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (sourceCam) { sourceCam.aspect = w / h; sourceCam.updateProjectionMatrix(); }
}

async function loadCase(id) {
  setPlaying(false);
  status && (status.textContent = 'Loading scene…');
  const token = ++loadToken;
  const r = await fetch(`data/scene-${id}.json`);
  if (!r.ok) throw new Error(`scene-${id}.json: ${r.status}`);
  const next = await r.json();
  if (token !== loadToken) return;   // another case was selected meanwhile
  // Fetch the baked textures while the primitives are built; the scene is shown only once they
  // are in place (or have failed), so it never flashes flat colors first.
  const textures = next.textures
    ? new GLTFLoader().loadAsync(next.textures).catch(err => { console.warn('textures', err); return null; })
    : null;
  const nextRoot = new THREE.Group(), nextBodies = new Map();
  geomMeshes = new Map();
  for (const b of next.bodies || []) {
    const g = new THREE.Group(); g.name = b.name;
    placeStatic(g, b);
    for (const geom of b.geoms || []) { const m = mesh(geom); if (m) g.add(m); }
    nextRoot.add(g); nextBodies.set(b.name, g);
  }
  const gltf = textures ? await textures : null;
  if (token !== loadToken) return;
  if (gltf) applyTextures(gltf);
  data = next;
  if (root) scene.remove(root);
  root = nextRoot; bodies = nextBodies;
  scene.add(root);
  slider.max = String(Math.max(0, (data.frames || 1) - 1));
  frameCamera();
  setFrame(0);
  setPlaying(true);
}

function applyTextures(gltf) {
  // Swap each textured geom's flat primitive for its baked mesh; the body Group keeps driving the pose.
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const target = geomMeshes.get(o.name);
    if (!target) return;
    const map = o.material && o.material.map;
    if (map) { map.colorSpace = THREE.SRGBColorSpace; renderer.initTexture(map); }   // upload before first draw
    target.geometry.dispose();
    target.geometry = o.geometry;
    target.material = new THREE.MeshStandardMaterial({ map: map || null, roughness: 0.65, metalness: 0.05 });
  });
}

function placeStatic(g, b) {
  const p = b.pos || b.xpos, q = b.quat || b.xquat;
  if (p) g.position.set(p[0], p[1], p[2]);
  if (q) g.quaternion.set(q[1], q[2], q[3], q[0]);
}

function material(rgba) {
  const [r, g, b, a] = rgba || [0.7, 0.7, 0.7, 1];
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(r, g, b), roughness: 0.65, metalness: 0.05, transparent: a < 1, opacity: a });
}

function mesh(geom) {
  const s = geom.size || [];
  let geo = null;
  switch (geom.type) {
    case 'sphere': geo = new THREE.SphereGeometry(s[0], 32, 16); break;
    case 'ellipsoid': geo = new THREE.SphereGeometry(1, 32, 16); geo.scale(s[0], s[1], s[2]); break;
    case 'box': geo = new THREE.BoxGeometry(2 * s[0], 2 * s[1], 2 * s[2]); break;
    case 'cylinder': geo = new THREE.CylinderGeometry(s[0], s[0], 2 * s[1], 40); geo.rotateX(Math.PI / 2); break;
    case 'capsule': geo = new THREE.CapsuleGeometry(s[0], 2 * s[1], 8, 24); geo.rotateX(Math.PI / 2); break;
    case 'plane': {
      const w = s[0] > 0 ? 2 * s[0] : 20, h = s[1] > 0 ? 2 * s[1] : 20;
      geo = new THREE.PlaneGeometry(w, h); break;
    }
    case 'mesh': {
      if (!geom.mesh) return null;
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(geom.mesh.v, 3));
      geo.setIndex(geom.mesh.f);
      geo.computeVertexNormals();
      break;
    }
    default: return null;
  }
  const m = new THREE.Mesh(geo, material(geom.rgba));
  if (geom.name) { m.name = geom.name; geomMeshes.set(THREE.PropertyBinding.sanitizeNodeName(geom.name), m); }
  if (geom.pos) m.position.set(geom.pos[0], geom.pos[1], geom.pos[2]);
  if (geom.quat) m.quaternion.set(geom.quat[1], geom.quat[2], geom.quat[3], geom.quat[0]);
  m.castShadow = geom.type !== 'plane';
  m.receiveShadow = true;
  return m;
}

function frameCamera() {
  // Orbit camera: frame where the moving bodies travel (a few sampled frames); fall back to the whole scene.
  const box = new THREE.Box3();
  const moving = Object.keys(data.poses || {}).map(n => bodies.get(n)).filter(Boolean);
  if (moving.length) {
    // A body that falls out of the scene (the Newton's cradle's released fingertip has nothing under it and drops
    // tens of metres) would stretch the framing far past the scene; skip poses more than the scene's own size
    // below its lowest point at frame 0.
    const g0 = data.gravity && Math.hypot(...data.gravity) > 0 ? data.gravity : [0, 0, -1];
    const up = new THREE.Vector3(-g0[0], -g0[1], -g0[2]).normalize();
    setFrame(0);
    const start = new THREE.Box3();
    root.traverse(o => { if (o.isMesh && o.geometry.type !== 'PlaneGeometry') { o.updateMatrixWorld(true); start.expandByObject(o); } });
    let floor = -Infinity;
    if (!start.isEmpty()) {
      floor = Infinity;
      for (const x of [start.min.x, start.max.x]) for (const y of [start.min.y, start.max.y]) for (const z of [start.min.z, start.max.z])
        floor = Math.min(floor, up.dot(new THREE.Vector3(x, y, z)));
      floor -= start.getSize(new THREE.Vector3()).length();
    }
    const n = data.frames || 1;
    for (const f of [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1]) {
      setFrame(f);
      moving.forEach(g => {
        g.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(g);
        if (!b.isEmpty() && up.dot(b.getCenter(new THREE.Vector3())) >= floor) box.union(b);
      });
    }
    setFrame(0);
  }
  if (box.isEmpty()) root.traverse(o => { if (o.isMesh && o.geometry.type !== 'PlaneGeometry') box.expandByObject(o); });
  if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(2, 2, 2));
  const c = box.getCenter(new THREE.Vector3()), size = (box.getSize(new THREE.Vector3()).length() || 2) * (moving.length ? 1.6 : 1);
  camera.near = size / 200; camera.far = size * 50;
  const cam0 = data.camera;
  if (cam0 && cam0.pos) {
    // Start from the video's own viewpoint, aimed at where the moving bodies are; orbiting stays free.
    camera.fov = cam0.fovy || camera.fov;
    camera.near = cam0.near || camera.near; camera.far = cam0.far || camera.far;
    camera.position.set(cam0.pos[0], cam0.pos[1], cam0.pos[2]);
    if (cam0.quat) {
      const q = new THREE.Quaternion(cam0.quat[1], cam0.quat[2], cam0.quat[3], cam0.quat[0]);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      const dist = Math.max(c.clone().sub(camera.position).dot(fwd), size * 0.2);
      controls.target.copy(camera.position.clone().add(fwd.multiplyScalar(dist)));
    } else {
      controls.target.copy(c);
    }
  } else {
    camera.position.set(c.x + size * 0.9, c.y - size * 1.1, c.z + size * 0.8);
    controls.target.copy(c);
  }
  camera.updateProjectionMatrix();
  controls.update();
  const sun = scene.userData.sun;
  sun.position.set(c.x + size, c.y - size, c.z + size * 2); sun.target.position.copy(c); sun.target.updateMatrixWorld();
  const sc = sun.shadow.camera; sc.left = sc.bottom = -size; sc.right = sc.top = size; sc.near = 0.01; sc.far = size * 6; sc.updateProjectionMatrix();

  // Source camera, if recorded.
  sourceCam = null;
  const cam = data.camera;
  if (cam && cam.pos) {
    sourceCam = new THREE.PerspectiveCamera(cam.fovy || 45, camera.aspect, cam.near || camera.near, cam.far || camera.far);
    sourceCam.up.set(0, 0, 1);
    sourceCam.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    if (cam.quat) { sourceCam.up.set(0, 1, 0); sourceCam.quaternion.set(cam.quat[1], cam.quat[2], cam.quat[3], cam.quat[0]); }
    else if (cam.target) sourceCam.lookAt(cam.target[0], cam.target[1], cam.target[2]);
  }
  viewBtn.disabled = !sourceCam;
  setSourceView(useSource && !!sourceCam);
}

function setSourceView(on) {
  useSource = on && !!sourceCam;
  viewBtn.setAttribute('aria-pressed', String(useSource));
  controls.enabled = !useSource;
}

function setFrame(f) {
  frame = Math.max(0, Math.min((data?.frames || 1) - 1, f));
  const poses = data?.poses || {};
  for (const [name, p] of Object.entries(poses)) {
    const g = bodies.get(name); if (!g) continue;
    const i3 = frame * 3, i4 = frame * 4;
    if (p.p && p.p.length >= i3 + 3) g.position.set(p.p[i3], p.p[i3 + 1], p.p[i3 + 2]);
    if (p.q && p.q.length >= i4 + 4) g.quaternion.set(p.q[i4 + 1], p.q[i4 + 2], p.q[i4 + 3], p.q[i4]);
  }
  slider.value = String(frame);
  const fps = data?.fps || 30;
  clockOut.textContent = `frame ${frame} / ${(data?.frames || 1) - 1} · ${(frame / fps).toFixed(2)} s`;
}

function setPlaying(on) {
  playing = on;
  if (playBtn) { playBtn.textContent = on ? '❚❚' : '▶'; playBtn.setAttribute('aria-label', on ? 'Pause replay' : 'Play replay'); }
}

function tick(t) {
  const dt = last ? (t - last) / 1000 : 0; last = t;
  if (playing && data) {
    if (leadVideo && !leadVideo.paused && leadVideo.readyState >= 2) {
      // Same clip, same frame count: show the frame the input video is on.
      setFrame(Math.min((data.frames || 1) - 1, Math.round(leadVideo.currentTime * (data.fps || 30))));
    } else {
      acc += dt * (data.fps || 30);
      if (acc >= 1) { const n = Math.floor(acc); acc -= n; setFrame((frame + n) % (data.frames || 1)); }
    }
  }
  controls?.update();
  renderer.render(scene, useSource && sourceCam ? sourceCam : camera);
  requestAnimationFrame(tick);
}
