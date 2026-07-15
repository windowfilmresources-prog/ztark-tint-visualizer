// 3D showroom renderer: white studio environment + orbitable glTF cars with
// four independently tintable glass zones: windshield / front sides / rear sides /
// back window. Exposes window.VIEWER3D and fires 'viewer3d-ready' + 'viewer3d-car-loaded'.
// Model-agnostic: named glass zones when the model follows the naming contract
// (Windshield / WindowFront[LR] / WindowRear[LR] / RearWindow), or a world-space
// geometry splitter for single-glass-mesh models (steep front faces = windshield,
// steep rear = back window, near-vertical sides split at the windshield's rear edge).

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export const ZONES = ["windshield", "front", "rear", "back"];

// Default fleet. app.js can override with window.CAR3D_FLEET before this module runs.
// ?car=proc → procedural sedan; ?car=<name> → lab model (contract mesh names).
const LAB_ZONES = {
  windshield: ["Windshield"],
  front: ["WindowFront"],
  rear: ["WindowRear"],
  back: ["RearWindow"],
};

const CAR_PARAM = (new URLSearchParams(location.search).get("car") || "").replace(/[^a-z0-9_-]/gi, "");

// Credits: CC BY 4.0 requires author, license, source link, and a modification
// note (models are debadged/re-materialed/compressed) — title is optional in 4.0
// and deliberately omitted in the UI. Full titles + notices live in each model
// dir's LICENSE.txt.
const DEFAULT_FLEET = [
  {
    id: "sports",
    label: "Sports",
    urls: ["assets/models/corvette/car.glb?v=2"],
    credit: "Vehicle 3D model © Martin Trafas · CC BY 4.0 · modified",
    creditUrl: "https://sketchfab.com/3d-models/chevrolet-corvette-c7-2b509d1bce104224b147c81757f6f43a",
  },
  {
    id: "truck",
    label: "Truck",
    urls: ["assets/models/truck/truck.glb?v=3"], // bump ?v= when the model file changes
    credit: "Vehicle 3D model © David_Holiday · CC BY 4.0 · modified",
    creditUrl: "https://sketchfab.com/3d-models/2018-ford-f-150-lariat-super-crew-014ebfab735341248431da3d6447bbb5",
  },
  {
    id: "suv",
    label: "SUV",
    urls: ["assets/models/suv/suv.glb?v=3"],
    credit: "Vehicle 3D model © David_Holiday · CC BY 4.0 · modified",
    creditUrl: "https://sketchfab.com/3d-models/2020-bmw-x5-m-competition-9b211d525797457e988c903f67d0b753",
  },
];

const FLEET = window.CAR3D_FLEET || DEFAULT_FLEET;

const state = {
  renderer: null, scene: null, camera: null, controls: null,
  bodyMats: [], zoneMats: null, zoneMeshes: null,
  carRoot: null, carReady: false, container: null, loadingEl: null,
  resizeObserver: null, raycaster: new THREE.Raycaster(),
  loadGen: 0, visible: true, intersecting: true,
};

const GLASS_RE = /glass|window|windshield|vidrio|glas[s]?_/i;
const NOT_GLASS_RE = /border|cover|frame|trim|blinker|light|gasket|wiper/i;
// Paint detection is a 3-tier ladder (see prepareCar):
//   1. the exact contract — a material named Body_Paint (all fleet models ship it)
//   2. per-MATERIAL name heuristic, with a not-paint guard (legacy/lab models)
//   3. largest-surface-area fallback
// Never match on MESH names: meshes like "CarBody 2_Chrome_0" would drag their
// chrome/interior/trim materials into the paint bucket (the "paints things it
// shouldn't" bug).
const PAINT_EXACT_RE = /^body[ _-]?paint$/i;
const BODY_RE = /body|paint|carpaint|carroceria|shell|exterior/i;
const NOT_PAINT_RE = /chrome|glass|interior|trim|tire|tyre|rim|wheel|light|lamp|caliper|grille|mirror|plate|leather|seat|shadow/i;

function tintScalar(vlt) {
  if (vlt == null) return 1.0; // factory glass
  return Math.pow(vlt / 100, 0.85);
}

function glassMat(name) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.05, roughness: 0.06, transmission: 1.0,
  });
  m.name = name;
  return m;
}

// ---------------------------------------------------------------- glass splitting
// Zone assignment must be computed over ALL glass meshes together: a mesh holding
// only the back window would otherwise treat its own steep glass as "the windshield".
// analyzeGlass() scans every glass mesh once and returns the shared frame of
// reference; splitGlass() then classifies one mesh's triangles against it.

function meshTris(mesh) {
  mesh.updateWorldMatrix(true, false);
  const mw = mesh.matrixWorld;
  const nMat = new THREE.Matrix3().getNormalMatrix(mw);
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const pos = geo.getAttribute("position");
  const norm = geo.getAttribute("normal");
  const uv = geo.getAttribute("uv");
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  const tris = [];
  for (let i = 0; i < pos.count; i += 3) {
    let ny = 0;
    const cen = new THREE.Vector3();
    for (let j = i; j < i + 3; j++) {
      n.set(norm.getX(j), norm.getY(j), norm.getZ(j)).applyMatrix3(nMat).normalize();
      ny += n.y;
      v.set(pos.getX(j), pos.getY(j), pos.getZ(j)).applyMatrix4(mw);
      cen.add(v);
    }
    tris.push({ i, ny: Math.abs(ny / 3), cen: cen.multiplyScalar(1 / 3) });
  }
  return { tris, pos, norm, uv };
}

function analyzeGlass(meshes) {
  const bb = new THREE.Box3();
  const all = [];
  const perMesh = new Map();
  meshes.forEach((m) => {
    const data = meshTris(m);
    perMesh.set(m, data);
    data.tris.forEach((t) => { bb.expandByPoint(t.cen); all.push(t); });
  });
  const size = bb.getSize(new THREE.Vector3());
  const center = bb.getCenter(new THREE.Vector3());
  const axis = size.x > size.z ? "x" : "z";
  const steep = all.filter((t) => t.ny >= 0.6);
  // the windshield is the LARGER steep cluster; find both clusters and pick front by area
  const fwd = steep.filter((t) => t.cen[axis] >= center[axis]);
  const bwd = steep.filter((t) => t.cen[axis] < center[axis]);
  const frontSign = fwd.length >= bwd.length ? 1 : -1;
  const wsCluster = frontSign > 0 ? fwd : bwd;
  let wsRearEdge = center[axis];
  wsCluster.forEach((t) => {
    if ((t.cen[axis] - wsRearEdge) * -frontSign > 0) wsRearEdge = t.cen[axis];
  });
  const boundary = wsRearEdge + -frontSign * size[axis] * 0.06;
  return { axis, center, frontSign, boundary, perMesh };
}

function splitGlass(mesh, frame) {
  const { axis, center, frontSign, boundary } = frame;
  const { tris, pos, norm, uv } = frame.perMesh.get(mesh);
  const buckets = { windshield: [], front: [], rear: [], back: [] };
  tris.forEach((t) => {
    const onFrontHalf = Math.sign(t.cen[axis] - center[axis]) === frontSign || t.cen[axis] === center[axis];
    const forwardOfBoundary = (t.cen[axis] - boundary) * frontSign > 0;
    if (t.ny >= 0.6) (onFrontHalf ? buckets.windshield : buckets.back).push(t.i);
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
  return Object.fromEntries(ZONES.map((z) => [z, build(buckets[z])]));
}

// ---------------------------------------------------------------- car preparation
function prepareCar(root, cfg) {
  const zoneMats = Object.fromEntries(ZONES.map((z) => [z, glassMat("Glass_" + z)]));
  const zoneMeshes = Object.fromEntries(ZONES.map((z) => [z, []]));
  const bodyMats = [];
  const exactPaintMats = [];
  const heuristicPaintMats = [];
  const glassMeshes = [];
  let hasBakedShadow = false;

  const zones = cfg.glassZones;
  const zoneOf = (o) => {
    if (!zones) return null;
    const names = [o.name, o.parent && o.parent.name].filter(Boolean);
    for (const [zone, list] of Object.entries(zones)) {
      if (names.some((nm) => list.some((z) => nm === z || nm.startsWith(z)))) return zone;
    }
    return null;
  };

  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const matNames = mats.map((m) => m && m.name || "").join(" ");
    if (/shadow/i.test(o.name) || /shadow/i.test(matNames)) { hasBakedShadow = true; return; }
    const zone = zoneOf(o);
    if (zone && zoneMats[zone]) {
      o.material = zoneMats[zone];
      zoneMeshes[zone].push(o);
      return;
    }
    if (!zones && (GLASS_RE.test(o.name) || GLASS_RE.test(matNames))
        && !(NOT_GLASS_RE.test(o.name) || NOT_GLASS_RE.test(matNames))) { glassMeshes.push(o); return; }
    mats.forEach((m) => {
      if (!m || !m.color || bodyMats.includes(m)) return;
      const nm = m.name || "";
      if (PAINT_EXACT_RE.test(nm)) exactPaintMats.push(m);
      else if (BODY_RE.test(nm) && !NOT_PAINT_RE.test(nm)) heuristicPaintMats.push(m);
    });
  });

  // tier 1 beats tier 2: when the model ships the Body_Paint contract, ONLY it
  // is paintable — heuristic name-matches (e.g. "Car_Paint_2" roof accents)
  // stay their factory color.
  for (const m of (exactPaintMats.length ? exactPaintMats : heuristicPaintMats)) {
    m.map = null;
    m.metalness = 0.15;
    m.roughness = 0.4;
    m.envMapIntensity = 1.15;
    m.needsUpdate = true;
    bodyMats.push(m);
  }

  // Paint fallback: no material name matched — take the largest-surface-area
  // colored materials (the body shell dominates every car's exterior area).
  if (!bodyMats.length) {
    const area = new Map();
    const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh || glassMeshes.includes(o)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const m = mats[0];
      if (!m || !m.color) return;
      const g = o.geometry;
      const pos = g.getAttribute("position");
      if (!pos) return;
      let a = 0;
      const idx = g.index;
      const count = idx ? idx.count : pos.count;
      const step = Math.max(3, Math.floor(count / 3000) * 3); // sample large meshes
      for (let i = 0; i + 2 < count; i += step) {
        const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
        pa.fromBufferAttribute(pos, i0); pb.fromBufferAttribute(pos, i1); pc.fromBufferAttribute(pos, i2);
        pb.sub(pa); pc.sub(pa);
        a += pb.cross(pc).length() / 2 * (step / 3);
      }
      area.set(m, (area.get(m) || 0) + a);
    });
    const ranked = [...area.entries()].sort((x, y) => y[1] - x[1]);
    if (ranked.length) {
      const top = ranked[0][1];
      ranked.filter(([, a]) => a > top * 0.5).slice(0, 2).forEach(([m]) => {
        m.map = null;
        m.metalness = 0.15;
        m.roughness = 0.4;
        m.envMapIntensity = 1.15;
        m.needsUpdate = true;
        bodyMats.push(m);
      });
    }
  }

  // No named zones: split generic glass meshes into the four zones by geometry,
  // classified against ONE shared frame computed over all glass together.
  if (glassMeshes.length) {
    const frame = analyzeGlass(glassMeshes);
    glassMeshes.forEach((glass) => {
      const parts = splitGlass(glass, frame);
      const parent = glass.parent;
      ZONES.forEach((z) => {
        const g = parts[z];
        if (!g) return;
        const mesh = new THREE.Mesh(g, zoneMats[z]);
        mesh.position.copy(glass.position); mesh.rotation.copy(glass.rotation); mesh.scale.copy(glass.scale);
        parent.add(mesh);
        zoneMeshes[z].push(mesh);
      });
      parent.remove(glass);
    });
  }

  normalizeCar(root);
  return { bodyMats, zoneMats, zoneMeshes, hasBakedShadow };
}

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

function disposeRoot(root) {
  if (!root) return;
  state.scene.remove(root);
  const disposedMats = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry && o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m || disposedMats.has(m)) return;
      disposedMats.add(m);
      // dispose every texture slot the material holds
      Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); });
      m.dispose();
    });
  });
}

function disposeCar() {
  if (!state.carRoot) return;
  disposeRoot(state.carRoot);
  state.carRoot = null;
  state.carReady = false;
}

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
  mesh.name = "FallbackShadow";
  return mesh;
}

// ---------------------------------------------------------------- car loading
function setLoading(text, spinning = true) {
  const el = state.loadingEl;
  if (!el) return;
  el.classList.toggle("done", text === null);
  if (text !== null) {
    el.querySelector(".pct").textContent = text;
    const sp = el.querySelector(".spin");
    if (sp) sp.style.display = spinning ? "" : "none";
  }
}

// One shared Draco decoder for the app's lifetime (a new one per load leaks worker pools).
let _draco = null;
function dracoLoader() {
  if (!_draco) _draco = new DRACOLoader().setDecoderPath("vendor/draco/");
  return _draco;
}

function loadCar(cfg) {
  // Generation token: only the most recent request may touch the scene/state.
  // The old car stays visible until its replacement has actually arrived.
  const gen = ++state.loadGen;
  setLoading("LOADING");

  const isStale = () => gen !== state.loadGen;

  const done = (root, prep) => {
    if (isStale()) { disposeRoot(root); return; }
    disposeCar(); // swap: remove the outgoing car only now
    const fb = state.scene.getObjectByName("FallbackShadow");
    if (fb) fb.visible = !prep.hasBakedShadow;
    state.scene.add(root);
    Object.assign(state, {
      carRoot: root, bodyMats: prep.bodyMats,
      zoneMats: prep.zoneMats, zoneMeshes: prep.zoneMeshes,
    });
    state.carReady = true;
    setLoading(null);
    window.VIEWER3D.credit = cfg.credit || "";
    window.VIEWER3D.creditUrl = cfg.creditUrl || "";
    document.dispatchEvent(new Event("viewer3d-car-loaded"));
  };

  const fail = (msg) => {
    if (isStale()) return; // a stale failure must not nuke a working view
    setLoading(msg, false);
    document.dispatchEvent(new Event("viewer3d-unavailable"));
  };

  if (cfg.proc) {
    import(`./procar.js?ts=${Date.now()}`).then(({ buildCar }) => {
      if (isStale()) return;
      const built = buildCar();
      // adapt procar's 3-mat contract to 4 zones (its fixed glass = windshield; no back split)
      const root = built.group;
      const zoneMats = {
        windshield: built.fixedGlassMat,
        front: built.frontGlassMat,
        rear: built.rearGlassMat,
        back: built.rearGlassMat,
      };
      normalizeCar(root);
      done(root, { bodyMats: built.bodyMats, zoneMats, zoneMeshes: { windshield: [], front: [], rear: [], back: [] }, hasBakedShadow: false });
    }).catch(() => fail("Couldn't build the 3D model"));
    return;
  }

  const loader = new GLTFLoader().setDRACOLoader(dracoLoader());
  const urls = cfg.urls || [cfg.url];
  const tryLoad = (i) => loader.load(
    urls[i],
    (gltf) => {
      if (isStale()) { disposeRoot(gltf.scene); return; }
      const prep = prepareCar(gltf.scene, cfg);
      done(gltf.scene, prep);
    },
    (xhr) => {
      if (!isStale() && xhr.total) setLoading(`LOADING ${Math.round((xhr.loaded / xhr.total) * 100)}%`);
    },
    () => {
      if (isStale()) return;
      if (i + 1 < urls.length) { tryLoad(i + 1); return; }
      fail("Couldn't load the 3D model");
    }
  );
  tryLoad(0);
}

// ---------------------------------------------------------------- mount / render
function mount(container) {
  if (state.renderer) {
    container.appendChild(state.renderer.domElement);
    if (state.loadingEl) container.appendChild(state.loadingEl);
    state.container = container;
    if (state.resizeObserver) { state.resizeObserver.disconnect(); state.resizeObserver.observe(container); }
    resize();
    return;
  }
  state.container = container;

  container.insertAdjacentHTML("beforeend",
    `<div class="viewer-loading" id="viewerLoading"><div class="spin"></div><div class="pct">LOADING</div></div>`);
  state.loadingEl = container.querySelector("#viewerLoading");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (e) {
    setLoading("3D not supported on this device", false);
    document.dispatchEvent(new Event("viewer3d-unavailable"));
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

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 1, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  scene.add(contactShadow());

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.6, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2.06;
  controls.minDistance = 3.4;
  controls.maxDistance = 10;
  controls.enablePan = false;
  renderer.domElement.style.touchAction = "pan-y";

  Object.assign(state, { renderer, scene, camera, controls });

  state.resizeObserver = new ResizeObserver(resize);
  state.resizeObserver.observe(container);
  window.addEventListener("resize", resize);
  resize();

  // render only while BOTH the tab is visible AND the stage is on screen
  const loop = () => { controls.update(); renderer.render(scene, camera); };
  const applyRunning = () => renderer.setAnimationLoop(state.visible && state.intersecting ? loop : null);
  applyRunning();
  new IntersectionObserver((entries) => {
    state.intersecting = entries[0].isIntersecting;
    applyRunning();
  }).observe(container);
  document.addEventListener("visibilitychange", () => {
    state.visible = !document.hidden;
    applyRunning();
  });

  // initial car
  const initial =
    CAR_PARAM === "proc" ? { proc: true, credit: "" } :
    CAR_PARAM ? { urls: [`assets/models/lab/${CAR_PARAM}.glb`], credit: "", glassZones: LAB_ZONES } :
    FLEET[0];
  loadCar(initial);
}

function resize() {
  if (!state.renderer || !state.container) return;
  const w = state.container.clientWidth || 800;
  const h = state.container.clientHeight || Math.round(w * 9 / 16);
  state.renderer.setSize(w, h);
  state.camera.aspect = w / h;
  state.camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- public API
window.VIEWER3D = {
  mount,
  fleet: FLEET,
  credit: "",
  zones: ZONES,
  get carReady() { return state.carReady; },
  loadCar(idOrCfg) {
    const cfg = typeof idOrCfg === "string" ? FLEET.find((f) => f.id === idOrCfg) : idOrCfg;
    if (cfg) loadCar(cfg);
  },
  setPaint(hex) { state.bodyMats.forEach((m) => m.color.set(hex)); },
  // vlts: {windshield, front, rear, back} — null/undefined = factory glass
  setTint(vlts) {
    if (!state.zoneMats) return;
    ZONES.forEach((z) => {
      const m = state.zoneMats[z];
      if (m) m.color.setScalar(tintScalar(vlts && vlts[z] != null ? vlts[z] : null));
    });
  },
  // returns the zone name under the pointer, or null
  pickZone(clientX, clientY) {
    if (!state.renderer || !state.zoneMeshes) return null;
    const r = state.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1
    );
    state.camera.updateMatrixWorld();           // render loop may be paused (background tab)
    state.scene.updateMatrixWorld(true);
    state.raycaster.setFromCamera(ndc, state.camera);
    // raycast the whole car so opaque bodywork occludes glass behind it —
    // clicking a door must not select the window on the far side
    if (!state.carRoot) return null;
    const hits = state.raycaster.intersectObject(state.carRoot, true);
    if (!hits.length) return null;
    const hitMesh = hits[0].object;
    for (const z of ZONES) {
      if (state.zoneMeshes[z].includes(hitMesh)) return z;
    }
    return null;
  },
  // brief emissive pulse on a zone so picking feels tactile
  flashZone(zone) {
    const m = state.zoneMats && state.zoneMats[zone];
    if (!m) return;
    const orig = m.emissive ? m.emissive.getHex() : 0;
    m.emissive && m.emissive.setHex(0x2a6fb8);
    m.emissiveIntensity = 0.9;
    setTimeout(() => { m.emissive && m.emissive.setHex(orig); m.emissiveIntensity = 0; }, 380);
  },
  setView(x, y, z) { if (state.camera) { state.camera.position.set(x, y, z); state.controls.update(); } },
  snapshot(w = 900, q = 0.82) {
    if (!state.renderer) return null;
    state.renderer.render(state.scene, state.camera);
    const src = state.renderer.domElement;
    const c = document.createElement("canvas");
    c.width = w; c.height = Math.round(w * src.height / src.width);
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", q);
  },
  debugPick(clientX, clientY) {
    const r = state.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1
    );
    state.camera.updateMatrixWorld();
    state.scene.updateMatrixWorld(true);
    state.raycaster.setFromCamera(ndc, state.camera);
    const sceneHits = state.raycaster.intersectObjects(state.scene.children, true)
      .slice(0, 4).map((h) => (h.object.material && h.object.material.name) || h.object.name);
    return {
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      ndc: [+ndc.x.toFixed(2), +ndc.y.toFixed(2)],
      zoneCounts: Object.fromEntries(ZONES.map((z) => [z, state.zoneMeshes ? state.zoneMeshes[z].length : -1])),
      sceneHits,
    };
  },
  debugGlass() {
    const g = (z) => state.zoneMats && state.zoneMats[z] ? state.zoneMats[z].color.getHexString() : null;
    return Object.fromEntries(ZONES.map((z) => [z, g(z)]));
  },
  debugMats() {
    const out = [];
    state.scene && state.scene.traverse((o) => {
      if (o.isMesh) out.push({ mesh: o.name, parent: o.parent && o.parent.name, mat: Array.isArray(o.material) ? o.material.map(m => m.name).join("|") : o.material.name });
    });
    return out;
  },
};
document.dispatchEvent(new Event("viewer3d-ready"));
