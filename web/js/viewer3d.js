// 3D showroom renderer: white studio environment + orbitable glTF car with
// VLT-driven physical glass. Exposes window.VIEWER3D and fires 'viewer3d-ready'.
// Model-agnostic: finds glass and paintable body by material/mesh name and
// auto-frames any model. Side glass (near-vertical faces) tints; the windshield
// stays factory-clear like real tint rules; sloped rear glass is tintable.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// Default model: Corvette C7 by Martin Trafas, CC BY 4.0 (license.txt alongside the model).
// Its glass is one "Windows" material, so the face-angle splitter separates the tintable
// near-vertical side glass from the windshield/rear slope automatically.
// (Alternate: assets/models/carconcept.glb — Khronos Car Concept, CC BY 4.0, named glass
// zones front/rear/windshield — a canopy-style hypercar, structure-perfect but side glass
// is too small to demo tint well.)
// ?car=proc switches to the in-code procedural brandless sedan (js/procar.js)
const USE_PROC = new URLSearchParams(location.search).get("car") === "proc";

const MODEL = window.CAR3D_MODEL || {
  // car.glb is the Draco-compressed build artifact (created on Render at deploy);
  // scene.gltf is the raw fallback for local dev where the build step hasn't run.
  urls: ["assets/models/corvette/car.glb", "assets/models/corvette/scene.gltf"],
  credit: "Chevrolet Corvette (C7) model © Martin Trafas · CC BY 4.0",
};

const state = {
  renderer: null, scene: null, camera: null, controls: null,
  bodyMats: [], frontGlassMat: null, rearGlassMat: null, fixedGlassMat: null,
  carReady: false, container: null,
};

const GLASS_RE = /glass|window|windshield|vidrio|glas[s]?_/i;
// trim/covers that merely mention glass ("WindowBorder", "Blinker_Glass_Cover") are NOT panes
const NOT_GLASS_RE = /border|cover|frame|trim|blinker|light|gasket|wiper/i;
const BODY_RE = /body|paint|carpaint|carroceria|shell|exterior/i;

function tintScalar(vlt) {
  if (vlt == null) return 1.0; // factory glass
  return Math.pow(vlt / 100, 0.85);
}

// Split a single glass mesh into tint zones by world-space geometry:
//   steep glass (|face-normal Y| ≥ 0.6) on the FRONT half = windshield → stays clear;
//   steep glass on the rear half = rear window → tintable (rear zone);
//   near-vertical glass (side windows, incl. tumblehome up to ~35°) → front/rear zone
//   by triangle position along the car's length axis.
function splitGlass(mesh) {
  mesh.updateWorldMatrix(true, false);
  const mw = mesh.matrixWorld;
  const nMat = new THREE.Matrix3().getNormalMatrix(mw);
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const pos = geo.getAttribute("position");
  const norm = geo.getAttribute("normal");
  const uv = geo.getAttribute("uv");

  const v = new THREE.Vector3(), n = new THREE.Vector3();
  const bb = new THREE.Box3();
  const tris = [];
  for (let i = 0; i < pos.count; i += 3) {
    let ny = 0;
    const cen = new THREE.Vector3();
    for (let j = i; j < i + 3; j++) {
      n.set(norm.getX(j), norm.getY(j), norm.getZ(j)).applyMatrix3(nMat).normalize();
      ny += n.y;
      v.set(pos.getX(j), pos.getY(j), pos.getZ(j)).applyMatrix4(mw);
      cen.add(v);
      bb.expandByPoint(v);
    }
    tris.push({ i, ny: Math.abs(ny / 3), cen: cen.multiplyScalar(1 / 3) });
  }

  const size = bb.getSize(new THREE.Vector3());
  const center = bb.getCenter(new THREE.Vector3());
  const axis = size.x > size.z ? "x" : "z";
  const steep = tris.filter((t) => t.ny >= 0.6);
  // The windshield is the steep glass cluster toward the nose; its rear edge (plus a small
  // margin) is the front/rear boundary — bbox-center splits can cut a door pane in half.
  const wsMean = steep.length ? steep.reduce((s, t) => s + t.cen[axis], 0) / steep.length : center[axis];
  const frontSign = Math.sign(wsMean - center[axis]) || 1;
  let wsRearEdge = center[axis];
  steep.forEach((t) => {
    const towardRear = -frontSign;
    if (Math.sign(t.cen[axis] - center[axis]) === frontSign || t.cen[axis] === center[axis]) {
      // track how far the windshield cluster extends back toward the cabin
      if ((t.cen[axis] - wsRearEdge) * towardRear > 0) wsRearEdge = t.cen[axis];
    }
  });
  const boundary = wsRearEdge + -frontSign * size[axis] * 0.06;

  const buckets = { front: [], rear: [], fixed: [] };
  tris.forEach((t) => {
    const onFrontHalf = Math.sign(t.cen[axis] - center[axis]) === frontSign;
    const forwardOfBoundary = (t.cen[axis] - boundary) * frontSign > 0;
    if (t.ny >= 0.6) (onFrontHalf ? buckets.fixed : buckets.rear).push(t.i);
    else (forwardOfBoundary ? buckets.front : buckets.rear).push(t.i);
  });

  const build = (idxs) => {
    if (!idxs.length) return null;
    const p = [], nn = [], u = [];
    idxs.forEach((i) => {
      for (let j = i; j < i + 3; j++) {
        p.push(pos.getX(j), pos.getY(j), pos.getZ(j));
        nn.push(norm.getX(j), norm.getY(j), norm.getZ(j));
        if (uv) u.push(uv.getX(j), uv.getY(j));
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nn, 3));
    if (uv && u.length) g.setAttribute("uv", new THREE.Float32BufferAttribute(u, 2));
    return g;
  };
  return { frontGeo: build(buckets.front), rearGeo: build(buckets.rear), fixedGeo: build(buckets.fixed) };
}

function glassMat() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.15, roughness: 0.05, transmission: 1.0,
  });
}

function prepareCar(root) {
  const frontGlassMat = glassMat();
  const rearGlassMat = glassMat();
  const fixedGlassMat = glassMat();
  const bodyMats = [];
  const glassMeshes = [];
  let hasBakedShadow = false;

  const zones = MODEL.glassZones;
  const zoneOf = (o) => {
    if (!zones) return null;
    const names = [o.name, o.parent && o.parent.name].filter(Boolean);
    for (const [zone, list] of Object.entries(zones)) {
      if (names.some((n) => list.some((z) => n === z || n.startsWith(z)))) return zone;
    }
    return null;
  };

  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const matNames = mats.map((m) => m && m.name || "").join(" ");
    if (/shadow/i.test(o.name) || /shadow/i.test(matNames)) { hasBakedShadow = true; return; }
    const zone = zoneOf(o);
    if (zone === "front") { o.material = frontGlassMat; return; }
    if (zone === "rear") { o.material = rearGlassMat; return; }
    if (zone === "windshield") { o.material = fixedGlassMat; return; }
    if (!zones && (GLASS_RE.test(o.name) || GLASS_RE.test(matNames))
        && !(NOT_GLASS_RE.test(o.name) || NOT_GLASS_RE.test(matNames))) { glassMeshes.push(o); return; }
    if (BODY_RE.test(o.name) || BODY_RE.test(matNames)) {
      mats.forEach((m) => {
        if (m && m.color && !bodyMats.includes(m)) {
          // drop baked paint textures and use a paint-like response so the picker's color shows true
          m.map = null;
          m.metalness = 0.15;
          m.roughness = 0.4;
          m.envMapIntensity = 1.15;
          m.needsUpdate = true;
          bodyMats.push(m);
        }
      });
    }
  });

  // No named zones: split generic glass into windshield/front-sides/rear by geometry.
  glassMeshes.forEach((glass) => {
    const { frontGeo, rearGeo, fixedGeo } = splitGlass(glass);
    const parent = glass.parent;
    [[frontGeo, frontGlassMat], [rearGeo, rearGlassMat], [fixedGeo, fixedGlassMat]].forEach(([g, m]) => {
      if (!g) return;
      const mesh = new THREE.Mesh(g, m);
      mesh.position.copy(glass.position); mesh.rotation.copy(glass.rotation); mesh.scale.copy(glass.scale);
      parent.add(mesh);
    });
    parent.remove(glass);
  });

  normalizeCar(root);
  return { bodyMats, frontGlassMat, rearGlassMat, fixedGlassMat, hasBakedShadow };
}

// normalize size + rest on ground, centered
function normalizeCar(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const scale = 4.5 / Math.max(size.x, size.z);
  root.scale.setScalar(scale);
  const box2 = new THREE.Box3().setFromObject(root);
  const center = box2.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box2.min.y;
}

// soft radial contact shadow (model-independent)
function contactShadow() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 126);
  grad.addColorStop(0, "rgba(0,0,0,.42)");
  grad.addColorStop(0.6, "rgba(0,0,0,.18)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(6.2, 3.4),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.01;
  mesh.renderOrder = 1;
  return mesh;
}

function mount(container) {
  if (state.renderer) { // re-mount into a fresh container after re-render
    container.appendChild(state.renderer.domElement);
    state.container = container;
    if (state.resizeObserver) { state.resizeObserver.disconnect(); state.resizeObserver.observe(container); }
    resize();
    return;
  }
  state.container = container;

  // loading overlay (the model is a multi-MB download on first visit)
  container.insertAdjacentHTML("beforeend",
    `<div class="viewer-loading" id="viewerLoading"><div class="spin"></div><div class="pct">LOADING</div></div>`);
  const loadingEl = container.querySelector("#viewerLoading");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (e) {
    document.dispatchEvent(new Event("viewer3d-unavailable"));
    loadingEl.querySelector(".pct").textContent = "3D not supported on this device";
    loadingEl.querySelector(".spin").remove();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f3f5);
  scene.fog = new THREE.Fog(0xf2f3f5, 10, 26);

  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
  camera.position.set(-5.0, 1.35, 2.2);

  const env = new THREE.PMREMGenerator(renderer);
  scene.environment = env.fromScene(new RoomEnvironment(), 0.04).texture;

  // floor tone matches the background so the horizon melts away instead of drawing an arc
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 1, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const fallbackShadow = contactShadow();
  scene.add(fallbackShadow);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.6, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2.06;
  controls.minDistance = 3.4;
  controls.maxDistance = 10;
  controls.enablePan = false;
  // let vertical swipes scroll the page on touch; horizontal drags still rotate the car
  renderer.domElement.style.touchAction = "pan-y";

  if (USE_PROC) {
    import(`./procar.js?ts=${Date.now()}`).then(({ buildCar }) => {
      const built = buildCar();
      normalizeCar(built.group);
      scene.add(built.group);
      Object.assign(state, {
        bodyMats: built.bodyMats,
        frontGlassMat: built.frontGlassMat,
        rearGlassMat: built.rearGlassMat,
        fixedGlassMat: built.fixedGlassMat,
      });
      state.carReady = true;
      loadingEl.classList.add("done");
      window.VIEWER3D.credit = ""; // ours — no attribution needed
      document.dispatchEvent(new Event("viewer3d-car-loaded"));
    }).catch(() => {
      loadingEl.querySelector(".pct").textContent = "Couldn't build the 3D model";
      document.dispatchEvent(new Event("viewer3d-unavailable"));
    });
  }

  const draco = new DRACOLoader().setDecoderPath("vendor/draco/");
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const urls = MODEL.urls || [MODEL.url];
  const tryLoad = (i) => loader.load(
    urls[i],
    (gltf) => {
      const car = gltf.scene;
      const { bodyMats, frontGlassMat, rearGlassMat, fixedGlassMat, hasBakedShadow } = prepareCar(car);
      if (hasBakedShadow) scene.remove(fallbackShadow); // model ships its own authored shadow
      scene.add(car);
      Object.assign(state, { bodyMats, frontGlassMat, rearGlassMat, fixedGlassMat });
      state.carReady = true;
      loadingEl.classList.add("done");
      document.dispatchEvent(new Event("viewer3d-car-loaded"));
    },
    (xhr) => {
      if (xhr.total) {
        loadingEl.querySelector(".pct").textContent = `LOADING ${Math.round((xhr.loaded / xhr.total) * 100)}%`;
      }
    },
    () => {
      if (i + 1 < urls.length) { tryLoad(i + 1); return; }
      loadingEl.querySelector(".pct").textContent = "Couldn't load the 3D model";
      loadingEl.querySelector(".spin").remove();
      document.dispatchEvent(new Event("viewer3d-unavailable"));
    }
  );
  if (!USE_PROC) tryLoad(0);

  Object.assign(state, { renderer, scene, camera, controls });

  state.resizeObserver = new ResizeObserver(resize);
  state.resizeObserver.observe(container);
  window.addEventListener("resize", resize);
  resize();

  // render only while the stage is on screen and the tab is visible
  const loop = () => { controls.update(); renderer.render(scene, camera); };
  const setRunning = (on) => renderer.setAnimationLoop(on ? loop : null);
  setRunning(true);
  new IntersectionObserver((entries) =>
    setRunning(entries[0].isIntersecting && !document.hidden)
  ).observe(container);
  document.addEventListener("visibilitychange", () => setRunning(!document.hidden));
}

function resize() {
  if (!state.renderer || !state.container) return;
  const w = state.container.clientWidth || 800;
  const h = state.container.clientHeight || Math.round(w * 9 / 16);
  state.renderer.setSize(w, h);
  state.camera.aspect = w / h;
  state.camera.updateProjectionMatrix();
}

window.VIEWER3D = {
  mount,
  credit: MODEL.credit,
  hasZones: !!MODEL.glassZones,
  get carReady() { return state.carReady; },
  setPaint(hex) { state.bodyMats.forEach((m) => m.color.set(hex)); },
  setTint(frontVlt, rearVlt) {
    if (state.frontGlassMat) state.frontGlassMat.color.setScalar(tintScalar(frontVlt));
    if (state.rearGlassMat) state.rearGlassMat.color.setScalar(tintScalar(rearVlt ?? frontVlt));
  },
  setView(x, y, z) { if (state.camera) { state.camera.position.set(x, y, z); state.controls.update(); } },
  snapshot(w = 900, q = 0.82) { // render + read pixels directly off the GL canvas (works in background tabs)
    if (!state.renderer) return null;
    state.renderer.render(state.scene, state.camera);
    const src = state.renderer.domElement;
    const c = document.createElement("canvas");
    c.width = w; c.height = Math.round(w * src.height / src.width);
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", q);
  },
  debugGlass() {
    const g = (m) => m ? m.color.getHexString() : null;
    return { front: g(state.frontGlassMat), rear: g(state.rearGlassMat), fixed: g(state.fixedGlassMat) };
  },
  debugMats() { // material inventory for console inspection
    const out = [];
    state.scene && state.scene.traverse((o) => {
      if (o.isMesh) out.push({ mesh: o.name, parent: o.parent && o.parent.name, mat: Array.isArray(o.material) ? o.material.map(m => m.name).join("|") : o.material.name });
    });
    return out;
  },
};
document.dispatchEvent(new Event("viewer3d-ready"));
