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

const DEFAULT_FLEET = [
  {
    id: "sports",
    label: "Sports",
    urls: ["assets/models/corvette/car.glb", "assets/models/corvette/scene.gltf"],
    credit: "Chevrolet Corvette (C7) model © Martin Trafas · CC BY 4.0",
  },
];

const FLEET = window.CAR3D_FLEET || DEFAULT_FLEET;

const state = {
  renderer: null, scene: null, camera: null, controls: null,
  bodyMats: [], zoneMats: null, zoneMeshes: null,
  carRoot: null, carReady: false, container: null, loadingEl: null,
  resizeObserver: null, raycaster: new THREE.Raycaster(),
};

const GLASS_RE = /glass|window|windshield|vidrio|glas[s]?_/i;
const NOT_GLASS_RE = /border|cover|frame|trim|blinker|light|gasket|wiper/i;
const BODY_RE = /body|paint|carpaint|carroceria|shell|exterior/i;

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
// Split a single glass mesh into the four zones by world-space geometry.
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
  const wsMean = steep.length ? steep.reduce((s, t) => s + t.cen[axis], 0) / steep.length : center[axis];
  const frontSign = Math.sign(wsMean - center[axis]) || 1;
  let wsRearEdge = center[axis];
  steep.forEach((t) => {
    const towardRear = -frontSign;
    if (Math.sign(t.cen[axis] - center[axis]) === frontSign || t.cen[axis] === center[axis]) {
      if ((t.cen[axis] - wsRearEdge) * towardRear > 0) wsRearEdge = t.cen[axis];
    }
  });
  const boundary = wsRearEdge + -frontSign * size[axis] * 0.06;

  const buckets = { windshield: [], front: [], rear: [], back: [] };
  tris.forEach((t) => {
    const onFrontHalf = Math.sign(t.cen[axis] - center[axis]) === frontSign;
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
    if (BODY_RE.test(o.name) || BODY_RE.test(matNames)) {
      mats.forEach((m) => {
        if (m && m.color && !bodyMats.includes(m)) {
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

  // No named zones: split generic glass meshes into the four zones by geometry.
  glassMeshes.forEach((glass) => {
    const parts = splitGlass(glass);
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

function disposeCar() {
  if (!state.carRoot) return;
  state.scene.remove(state.carRoot);
  state.carRoot.traverse((o) => {
    if (o.isMesh) {
      o.geometry && o.geometry.dispose();
    }
  });
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

function loadCar(cfg) {
  disposeCar();
  setLoading("LOADING");

  const done = (root, prep) => {
    if (prep.hasBakedShadow) {
      const fb = state.scene.getObjectByName("FallbackShadow");
      if (fb) fb.visible = false;
    } else {
      const fb = state.scene.getObjectByName("FallbackShadow");
      if (fb) fb.visible = true;
    }
    state.scene.add(root);
    Object.assign(state, {
      carRoot: root, bodyMats: prep.bodyMats,
      zoneMats: prep.zoneMats, zoneMeshes: prep.zoneMeshes,
    });
    state.carReady = true;
    setLoading(null);
    window.VIEWER3D.credit = cfg.credit || "";
    document.dispatchEvent(new Event("viewer3d-car-loaded"));
  };

  if (cfg.proc) {
    import(`./procar.js?ts=${Date.now()}`).then(({ buildCar }) => {
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
    }).catch(() => {
      setLoading("Couldn't build the 3D model", false);
      document.dispatchEvent(new Event("viewer3d-unavailable"));
    });
    return;
  }

  const draco = new DRACOLoader().setDecoderPath("vendor/draco/");
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const urls = cfg.urls || [cfg.url];
  const tryLoad = (i) => loader.load(
    urls[i],
    (gltf) => {
      const prep = prepareCar(gltf.scene, cfg);
      done(gltf.scene, prep);
    },
    (xhr) => {
      if (xhr.total) setLoading(`LOADING ${Math.round((xhr.loaded / xhr.total) * 100)}%`);
    },
    () => {
      if (i + 1 < urls.length) { tryLoad(i + 1); return; }
      setLoading("Couldn't load the 3D model", false);
      document.dispatchEvent(new Event("viewer3d-unavailable"));
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

  const loop = () => { controls.update(); renderer.render(scene, camera); };
  const setRunning = (on) => renderer.setAnimationLoop(on ? loop : null);
  setRunning(true);
  new IntersectionObserver((entries) =>
    setRunning(entries[0].isIntersecting && !document.hidden)
  ).observe(container);
  document.addEventListener("visibilitychange", () => setRunning(!document.hidden));

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
    let best = null;
    ZONES.forEach((z) => {
      const hits = state.raycaster.intersectObjects(state.zoneMeshes[z], false);
      if (hits.length && (!best || hits[0].distance < best.dist)) best = { zone: z, dist: hits[0].distance };
    });
    return best ? best.zone : null;
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
