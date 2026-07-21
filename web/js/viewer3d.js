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
    urls: ["assets/models/truck/truck.glb?v=4"], // bump ?v= when the model file changes
    credit: "Vehicle 3D model © David_Holiday · CC BY 4.0 · modified",
    creditUrl: "https://sketchfab.com/3d-models/2018-ford-f-150-lariat-super-crew-014ebfab735341248431da3d6447bbb5",
  },
  {
    id: "suv",
    label: "SUV",
    urls: ["assets/models/suv/suv.glb?v=6"],
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
  // architectural mode
  buildingPrep: null, buildingView: "exterior", buildingFilm: null,
  persCam: null, orthoCam: null, orthoHeight: 6,
};

const GLASS_RE = /glass|window|windshield|vidrio|glas[s]?_/i;
const NOT_GLASS_RE = /border|cover|frame|trim|blinker|light|lamp|lens|gasket|wiper/i;
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

// ---------------------------------------------------------------- building preparation
// Architectural dioramas: locked isometric ortho camera + a furnished-interior
// view. All Glass_* meshes share one physical material driven by setBuildingFilm.
function prepareBuilding(root) {
  const glassMeshes = [];
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.0, roughness: 0.06, transmission: 1.0,
  });
  glass.name = "Building_Glass_Live";
  root.traverse((o) => {
    if (!o.isMesh) return;
    const matNames = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => m && m.name || "").join(" ");
    if (GLASS_RE.test(o.name) || GLASS_RE.test(matNames)) {
      o.material = glass;
      o.castShadow = false;
      glassMeshes.push(o);
    } else {
      o.castShadow = true;
      o.receiveShadow = true;  // building self-shadowing: sunlight raking a
    }                          // room/facade is what makes it read as real
  });
  // fit the diorama into the studio (shadow rig covers ~±4.5m)
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const scale = 5.2 / Math.max(size.x, size.z);
  root.scale.setScalar(scale);
  const box2 = new THREE.Box3().setFromObject(root);
  const center = box2.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box2.min.y;
  return {
    building: true,
    buildingGlass: glass,
    glassMeshes,
    camNode: root.getObjectByName("InteriorCam") || null,
    targetNode: root.getObjectByName("InteriorTarget") || null,
    bodyMats: [], zoneMats: null,
    zoneMeshes: Object.fromEntries(ZONES.map((z) => [z, []])),
    hasBakedShadow: false,
  };
}

// Vertical daylight-sky gradient shown behind the glass in interior view —
// gives the outside world depth and makes the film's darkening readable.
function buildingSky() {
  if (state.buildingSkyTex) return state.buildingSkyTex;
  const c = document.createElement("canvas");
  c.width = 2; c.height = 512;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#8fbede");
  g.addColorStop(0.45, "#cde3f0");
  g.addColorStop(0.62, "#e9f1f2");
  g.addColorStop(1, "#eef2ec");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 512);
  state.buildingSkyTex = new THREE.CanvasTexture(c);
  state.buildingSkyTex.colorSpace = THREE.SRGBColorSpace;
  return state.buildingSkyTex;
}

// dial the studio env map's contribution on all building materials — full
// strength outside (diorama sparkle), dimmed inside so the sun reads
function setBuildingEnvIntensity(v) {
  if (!state.carRoot) return;
  state.carRoot.traverse((o) => {
    if (o.isMesh && o.material && o.material.envMapIntensity != null &&
        o.material !== (state.buildingPrep && state.buildingPrep.buildingGlass)) {
      o.material.envMapIntensity = v;
      o.material.needsUpdate = false;
    }
  });
}

function applyBuildingView(view) {
  if (!state.buildingPrep || !state.carRoot) return;
  state.buildingView = view;
  state.carRoot.updateMatrixWorld(true);
  // The car-studio rig lights from above/sides, so building interiors are
  // shadowed cavities — downward faces (ceilings) read as black voids without
  // a hemisphere bounce.
  if (!state.buildingHemi) {
    // groundColor is what ceilings (downward faces) receive — keep it near-
    // white with only a hint of warmth or plaster ceilings render taupe
    state.buildingHemi = new THREE.HemisphereLight(0xffffff, 0xeae5dc, 0.5);
    state.scene.add(state.buildingHemi);
  }
  state.buildingHemi.visible = true;
  // soft interior fill: warms the room without the specular blowout a strong
  // near-camera point light causes
  if (!state.interiorFill) {
    state.interiorFill = new THREE.PointLight(0xfff2e0, 6, 12, 1.9);
    state.interiorFill.visible = false;
    state.scene.add(state.interiorFill);
  }
  if (view === "interior" && state.buildingPrep.camNode) {
    // enough ambient that shadows stay soft, low enough that they exist
    state.buildingHemi.intensity = 0.38;
    state.scene.background = buildingSky();
    const cam = state.persCam;
    cam.fov = 58;
    cam.near = 0.05;
    state.buildingPrep.camNode.getWorldPosition(cam.position);
    const tgt = new THREE.Vector3();
    if (state.buildingPrep.targetNode) state.buildingPrep.targetNode.getWorldPosition(tgt);
    cam.lookAt(tgt);
    cam.updateProjectionMatrix();
    state.camera = cam;
    // sun: key light outside beyond the glass, high and off-axis, raking INTO
    // the room so furniture throws real shadows across the floor
    if (state.keyLight) {
      const out = tgt.clone().sub(cam.position);
      out.y = 0;
      out.normalize();
      const side = new THREE.Vector3(-out.z, 0, out.x); // lateral offset -> diagonal rake
      // LOW sun (≈20° elevation): any higher and the roof shadow-caster blocks
      // it — direct light must slip under the eave through the glass wall
      state.keyLight.position.copy(tgt)
        .addScaledVector(out, 5.5)
        .addScaledVector(side, 2.5)
        .add(new THREE.Vector3(0, 2.3, 0));
      state.keyLight.target.position.copy(cam.position).setY(0);
      state.keyLight.target.updateMatrixWorld();
      // the room is near-white from env+ambient already: the sun needs real
      // headroom to read as light, and the flat studio env must yield to it
      state.keyLight.intensity = 3.0;
      state.keyLight.shadow.radius = 4;   // crisper sun shadows indoors
      if (state.renderer) state.renderer.shadowMap.needsUpdate = true;
    }
    setBuildingEnvIntensity(0.45);
    state.interiorFill.intensity = 2;
    state.interiorFill.position.copy(cam.position).add(new THREE.Vector3(0, 0.5, 0));
    state.interiorFill.visible = true;
    interiorDaylight(); // the selected film scales the rig from these baselines
  } else {
    state.buildingHemi.intensity = 0.45;
    state.scene.background = new THREE.Color(0xf2f3f5);
    if (state.keyLight) {
      state.keyLight.intensity = 1.35;
      state.keyLight.shadow.radius = 9;
    }
    setBuildingEnvIntensity(1.0);
    state.interiorFill.visible = false;
    const box = new THREE.Box3().setFromObject(state.carRoot);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const cam = state.orthoCam;
    const d = state.buildingIsoDir || [1, 0.62, -1];
    const dir = new THREE.Vector3(d[0], d[1], d[2]).normalize();
    // key light fronts the shown facades (cars restore it in restoreCarCamera)
    if (state.keyLight) {
      state.keyLight.position.set(Math.sign(d[0]) * 5, 7, Math.sign(d[2]) * 4);
      state.keyLight.target.position.set(0, 0, 0);
      state.keyLight.target.updateMatrixWorld();
    }
    if (state.renderer) state.renderer.shadowMap.needsUpdate = true; // key moved
    cam.position.copy(center).addScaledVector(dir, 16);
    cam.lookAt(center.x, center.y * 0.92, center.z);
    state.orthoHeight = Math.max(size.y * 1.3, Math.max(size.x, size.z) * 0.95);
    state.orthoWidth = Math.max(size.x, size.z) * 1.04;
    cam.near = 0.1; cam.far = 60;
    state.camera = cam;
  }
  resize();
}

function restoreCarCamera() {
  if (state.interiorFill) state.interiorFill.visible = false;
  if (state.buildingHemi) state.buildingHemi.visible = false;
  if (state.scene) state.scene.background = new THREE.Color(0xf2f3f5);
  if (state.scene) state.scene.fog = new THREE.Fog(0xf2f3f5, 10, 26);
  if (state.keyLight) {
    state.keyLight.intensity = 1.35;
    state.keyLight.shadow.radius = 9;
    state.keyLight.position.set(4.5, 6.5, 3.5);
    state.keyLight.target.position.set(0, 0, 0);
    state.keyLight.target.updateMatrixWorld();
  }
  if (state.renderer) state.renderer.shadowMap.needsUpdate = true; // key moved
  const cam = state.persCam;
  cam.fov = 38;
  cam.near = 0.1;
  cam.position.set(-5.0, 1.35, 2.2);
  cam.updateProjectionMatrix();
  state.camera = cam;
  if (state.controls) {
    state.controls.object = cam;
    state.controls.enabled = true;
    state.controls.target.set(0, 0.6, 0);
    state.controls.update();
  }
  resize();
}

// ---------------------------------------------------------------- car preparation
function prepareCar(root, cfg) {
  if (cfg && cfg.building) return prepareBuilding(root);
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

  // bodywork casts the studio key-light shadow; glass panes don't (a full
  // glasshouse shadow reads as a solid block on the floor)
  const glassSet = new Set([...glassMeshes, ...Object.values(zoneMeshes).flat()]);
  root.traverse((o) => {
    if (o.isMesh) o.castShadow = !glassSet.has(o);
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

// ---------------------------------------------------------------- brand plates
// Branded license plates: canvas-drawn from window.PLATE_STYLE (set by app.js
// from the active brand config), mounted by raycasting the bumper/tailgate at
// per-car heights. Plates live in state.plateGroup (world space), rebuilt on
// every car load.
function plateTexture(style) {
  const c = document.createElement("canvas");
  c.width = 640; c.height = 320;
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  let img = null;
  if (style.logo) { img = new Image(); img.src = style.logo; }
  const draw = () => {
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, 640, 320);
    const r = 34;
    ctx.beginPath();
    ctx.roundRect(4, 4, 632, 312, r);
    ctx.fillStyle = style.bg;
    ctx.fill();
    ctx.lineWidth = 14;
    ctx.strokeStyle = style.border;
    ctx.beginPath();
    ctx.roundRect(18, 18, 604, 284, r - 12);
    ctx.stroke();
    // mounting bolts
    ctx.fillStyle = "rgba(0,0,0,.28)";
    for (const bx of [96, 544]) { ctx.beginPath(); ctx.arc(bx, 46, 9, 0, 7); ctx.fill(); }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (img && img.complete && img.naturalWidth) {
      // real brand mark, contained; tagline below
      const bw = 480, bh = style.sub ? 140 : 190, by = style.sub ? 62 : 66;
      const s = Math.min(bw / img.naturalWidth, bh / img.naturalHeight);
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      ctx.drawImage(img, 320 - dw / 2, by + (bh - dh) / 2, dw, dh);
    } else {
      // fallback: brand text, shrunk to fit
      ctx.fillStyle = style.fg;
      let px = 118;
      do {
        ctx.font = `700 ${px}px ${style.font}`;
        if (ctx.measureText(style.text).width <= 540) break;
        px -= 6;
      } while (px > 40);
      ctx.fillText(style.text, 320, style.sub ? 150 : 164);
    }
    if (style.sub) {
      ctx.fillStyle = style.fg;
      ctx.font = `600 30px ${style.font}`;
      ctx.globalAlpha = 0.72;
      ctx.fillText(style.sub, 320, 252);
      ctx.globalAlpha = 1;
    }
    tex.needsUpdate = true;
  };
  draw();
  if (img) { img.onload = draw; }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw); // redraw once webfonts land
  return tex;
}

function clearPlates() {
  const g = state.plateGroup;
  if (!g) return;
  [...g.children].forEach((m) => {
    g.remove(m);
    m.geometry && m.geometry.dispose();
    if (m.material) { m.material.map && m.material.map.dispose(); m.material.dispose(); }
  });
}

function addPlates(cfg, prep) {
  clearPlates();
  const style = window.PLATE_STYLE;
  window.__plateDebug = { style: !!style, cfgPlates: !!cfg.plates, group: !!state.plateGroup, root: !!state.carRoot, hits: [] };
  if (!style || !cfg.plates || !state.plateGroup || !state.carRoot) return;
  state.carRoot.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(state.carRoot);
  const size = box.getSize(new THREE.Vector3());
  const L = size.x >= size.z ? "x" : "z";
  const centroid = (meshes) => {
    if (!meshes || !meshes.length) return null;
    const b = new THREE.Box3();
    meshes.forEach((m) => b.expandByObject(m));
    return b.getCenter(new THREE.Vector3());
  };
  const ws = centroid(prep.zoneMeshes.windshield);
  const bk = centroid(prep.zoneMeshes.back);
  const frontSign = ws && bk ? (Math.sign(ws[L] - bk[L]) || 1) : 1;

  const bodyTargets = [];
  state.carRoot.traverse((o) => { if (o.isMesh) bodyTargets.push(o); });

  for (const side of ["front", "rear"]) {
    const spec = cfg.plates[side];
    if (!spec) continue;
    const dir = side === "front" ? frontSign : -frontSign;
    const origin = new THREE.Vector3(0, spec.y, 0);
    origin[L] = dir * 3.4;
    const rayDir = new THREE.Vector3(0, 0, 0);
    rayDir[L] = -dir;
    state.raycaster.set(origin, rayDir);
    const hit = state.raycaster.intersectObjects(bodyTargets, false)[0];
    window.__plateDebug.hits.push({ side, L, dir, origin: origin.toArray().map((v) => +v.toFixed(2)), hit: hit ? hit.point.toArray().map((v) => +v.toFixed(2)) : null });
    if (!hit) continue;
    let n = hit.face
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      : rayDir.clone().negate();
    if (n.dot(rayDir) > 0) n.negate();
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.w, spec.w / 2),
      new THREE.MeshStandardMaterial({
        map: plateTexture(style), roughness: 0.5, metalness: 0.1,
        transparent: true, alphaTest: 0.5,
      })
    );
    mesh.position.copy(hit.point).addScaledVector(n, 0.013);
    mesh.up.set(0, 1, 0);
    mesh.lookAt(mesh.position.clone().add(n)); // +Z to the surface normal, world-up kept (no mirror/roll)
    mesh.name = "Plate_" + side;
    state.plateGroup.add(mesh);
  }
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
  grad.addColorStop(0, "rgba(0,0,0,.28)");
  grad.addColorStop(0.6, "rgba(0,0,0,.11)");
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
    state.renderer.shadowMap.needsUpdate = true; // new shadow caster in the scene
    Object.assign(state, {
      carRoot: root, bodyMats: prep.bodyMats,
      zoneMats: prep.zoneMats, zoneMeshes: prep.zoneMeshes,
    });
    state.carReady = true;
    if (prep.building) {
      state.buildingPrep = prep;
      state.buildingIsoDir = cfg.isoDir || [1, 0.62, -1];
      state.scene.fog = null; // car-tuned fog (10..26) would haze the diorama at ortho distance 16
      clearPlates(); // the outgoing car's license plates must not float in the diorama
      if (state.controls) state.controls.enabled = false; // locked isometric view
      applyBuildingView(state.buildingView || "exterior");
      applyBuildingFilm(state.buildingFilm);
    } else {
      const wasBuilding = !!state.buildingPrep;
      state.buildingPrep = null;
      if (wasBuilding) restoreCarCamera();
      addPlates(cfg, prep);
    }
    setLoading(null);
    window.VIEWER3D.credit = cfg.credit || "";
    window.VIEWER3D.creditUrl = cfg.creditUrl || "";
    document.dispatchEvent(new Event("viewer3d-car-loaded"));
  };

  const fail = (msg) => {
    if (isStale()) return; // a stale failure must not nuke a working view
    setLoading(msg, false);
    document.dispatchEvent(new CustomEvent("viewer3d-unavailable",
      { detail: { building: !!(cfg && cfg.building) } }));
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
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch (e) {
    setLoading("3D not supported on this device", false);
    document.dispatchEvent(new Event("viewer3d-unavailable"));
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap; // soft, blurry studio shadow
  // Nothing shadow-relevant moves frame-to-frame (camera orbits, lights ramp
  // intensity only), yet VSM re-renders + double-blurs its 2048px map every
  // frame. Bake on demand instead: flagged on car/building load and key moves.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f3f5);
  scene.fog = new THREE.Fog(0xf2f3f5, 10, 26);

  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
  camera.position.set(-5.0, 1.35, 2.2);
  state.persCam = camera;
  state.orthoCam = new THREE.OrthographicCamera(-4, 4, 2.25, -2.25, 0.1, 60);

  const env = new THREE.PMREMGenerator(renderer);
  scene.environment = env.fromScene(new RoomEnvironment(), 0.04).texture;

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 1, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  state.floorMat = floor.material;

  // Studio rig: the env map alone lit everything flat and shadowless. A warm
  // key (with a real soft shadow), a cool fill, and a rear rim give the paint
  // highlight gradients and ground the car.
  const key = new THREE.DirectionalLight(0xfff4e8, 1.35);
  key.position.set(4.5, 6.5, 3.5);
  state.keyLight = key;
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -4.5;
  key.shadow.camera.right = key.shadow.camera.top = 4.5;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 18;
  key.shadow.radius = 9;
  key.shadow.blurSamples = 12;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.025;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.4);
  fill.position.set(-5.5, 3.5, -2.0);
  scene.add(fill);
  state.fillLight = fill;
  const rim = new THREE.DirectionalLight(0xffffff, 0.55);
  rim.position.set(-2.0, 5.0, -6.0);
  scene.add(rim);
  state.rimLight = rim;

  // shadow catcher: keeps the studio color while receiving the key's shadow
  const catcher = new THREE.Mesh(
    new THREE.CircleGeometry(10, 48),
    new THREE.ShadowMaterial({ opacity: 0.26 })
  );
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = 0.005;
  catcher.receiveShadow = true;
  scene.add(catcher);
  scene.add(contactShadow()); // faint blob kept underneath for contact darkening

  state.plateGroup = new THREE.Group();
  state.plateGroup.name = "BrandPlates";
  scene.add(state.plateGroup);

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
  // live refs, not the mount-time closure: building mode swaps state.camera
  // (ortho iso / interior), and a disabled OrbitControls must not keep driving
  // the camera back to its orbit position every frame
  const loop = (t) => {
    if (PERF_ON) (window.__FRAMES || (window.__FRAMES = [])).push(t);
    if (state.revealWarming) return; // hold the last dark frame while shaders compile
    if (state.revealTick) state.revealTick(t); // camera+lights update, then render, same frame
    if (state.controls && state.controls.enabled) state.controls.update();
    state.renderer.render(state.scene, state.camera);
  };
  const applyRunning = () => renderer.setAnimationLoop(state.visible && state.intersecting ? loop : null);
  applyRunning();
  // observe the CANVAS, not the container: the stage div is rebuilt on every
  // space switch and a detached target latches isIntersecting=false forever
  new IntersectionObserver((entries) => {
    state.intersecting = entries[0].isIntersecting;
    applyRunning();
  }).observe(renderer.domElement);
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

// ---------------------------------------------------------------- cinematic reveal
// Dark-studio entrance in three beats: a held low-light headlight close-up
// (armReveal poses it before the car's first frame), then the studio lights
// sweep up WHILE the camera arcs back, landing on the standard three-quarter
// just after full brightness. The tick runs inside the render loop (update
// then render, same frame) and the clock starts only after shaders/textures
// are warmed, so the sweep never eats a compile stall. Skippable on any
// input; a timeout guarantees the end state if rAF is throttled.
const REVEAL = {
  dur: 3400,
  hold: 0.16,               // dark beat: camera micro push-in only
  lightLag: 0.06, lightSpan: 0.66, // light ramp start/width within the sweep
  fromFov: 44, toFov: 38, // wide-to-tele compression release across the sweep
  fromPos: [-1.15, 0.58, 3.05], fromTgt: [-0.45, 0.52, 2.0],
  ctrl: [-3.7, 0.85, 3.3],
  toPos: [-5.0, 1.35, 2.2], toTgt: [0, 0.6, 0],
  fromExposure: 0.16, toExposure: 1.0,
};
let revealArmed = false, revealPlaying = false;
const REVEAL_DEBUG = (new URLSearchParams(location.search)).get("revealDebug");
const PERF_ON = (new URLSearchParams(location.search)).has("perf");

const REVEAL_DARK = new THREE.Color(0x0b0b0d);
const REVEAL_LIGHT = new THREE.Color(0xf2f3f5);

// Everything env-lit stays bright even at exposure 0.16, so the dark beat has
// to dim the env map (per-material uniform) and the fill/rim rig too, not just
// key + exposure. Bases are captured here and restored exactly at finish.
// The car's lamps do the opposite: emissive lamp materials get driven UP for
// the dark beat (headlights on) with two beam spotlights pooling on the floor,
// all dying off as the studio brightens.
const HEADLAMP_ON = 5.5;   // emissive intensity while the studio is dark
const HEADBEAM_ON = 8.5;   // spotlight intensity for the floor pools
function ensureRevealRig() {
  if (state.revealRig) return state.revealRig;
  const mats = new Set();
  if (state.scene) state.scene.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) if ("envMapIntensity" in m) mats.add(m);
  });
  // glowing lamp materials + a combined front-lamp bbox (lamp meshes span the
  // car's full width on some models, so per-side centers collapse to x=0 —
  // derive the two beam origins from the union box's extents instead)
  const lampSet = new Set();
  const frontBox = new THREE.Box3();
  if (state.carRoot) state.carRoot.traverse((o) => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) {
      if (!m.emissive || m.emissiveIntensity <= 0) continue;
      if (m.emissive.r + m.emissive.g + m.emissive.b < 0.05) continue;
      lampSet.add(m);
      const b = new THREE.Box3().setFromObject(o);
      if (b.getCenter(new THREE.Vector3()).z > 0.5) frontBox.union(b);
    }
  });
  const spots = [];
  if (!frontBox.isEmpty()) {
    const c = frontBox.getCenter(new THREE.Vector3());
    const halfW = (frontBox.max.x - frontBox.min.x) / 2;
    for (const sx of [-1, 1]) {
      const x = c.x + sx * Math.max(0.45, halfW * 0.62);
      // aimed down like low beams: the pool lands just ahead of the bumper,
      // inside the dark-beat framing (a far throw would pool behind the camera)
      const s = new THREE.SpotLight(0xe8f0ff, 0, 12, 0.55, 0.8, 1.0);
      s.position.set(x, c.y + 0.04, frontBox.max.z + 0.06);
      s.target.position.set(x * 1.1, 0, frontBox.max.z + 0.55);
      s.visible = false;
      state.scene.add(s, s.target);
      spots.push(s);
    }
  }
  state.revealRig = {
    env: [...mats].map((m) => [m, m.envMapIntensity]),
    lamps: [...lampSet].map((m) => [m, m.emissiveIntensity]),
    spots,
  };
  return state.revealRig;
}
function releaseRevealRig(restore) {
  const rig = state.revealRig;
  if (rig) {
    if (restore) {
      for (const [m, v] of rig.env) m.envMapIntensity = v;
      for (const [m, v] of rig.lamps) m.emissiveIntensity = v;
    }
    for (const s of rig.spots) { state.scene.remove(s.target); state.scene.remove(s); s.dispose(); }
  }
  state.revealRig = null;
}

function revealLights(le) {
  const s3 = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  state.renderer.toneMappingExposure = REVEAL.fromExposure + (REVEAL.toExposure - REVEAL.fromExposure) * le;
  if (state.keyLight) state.keyLight.intensity = 0.12 + (1.35 - 0.12) * le;
  // 0.4 / 0.55 mirror the studio rig's fill/rim intensities set at mount
  if (state.fillLight) state.fillLight.intensity = 0.4 * (0.05 + 0.95 * le);
  if (state.rimLight) state.rimLight.intensity = 0.55 * (0.08 + 0.92 * le);
  if (state.revealRig) {
    for (const [m, base] of state.revealRig.env) m.envMapIntensity = base * (0.05 + 0.95 * le);
    // headlights burn through the dark beat, then switch off as the room brightens
    const on = 1 - s3(Math.min(1, Math.max(0, (le - 0.22) / 0.5)));
    for (const [m, base] of state.revealRig.lamps)
      m.emissiveIntensity = base + Math.max(0, HEADLAMP_ON - base) * on;
    for (const s of state.revealRig.spots) {
      s.intensity = HEADBEAM_ON * on;
      s.visible = on > 0.02;
    }
  }
  if (state.scene && state.scene.background && state.scene.background.isColor)
    state.scene.background.lerpColors(REVEAL_DARK, REVEAL_LIGHT, le);
  if (state.scene && state.scene.fog) state.scene.fog.color.copy(state.scene.background);
  // floor keeps its real albedo: with env/fill/rim dimmed it goes dark on its
  // own, and a black-painted floor would swallow the headlight pools entirely
}

function armReveal() {
  if (!state.persCam || !state.renderer) return;
  revealArmed = true;
  const c = state.persCam;
  c.fov = REVEAL.fromFov;
  c.position.set(REVEAL.fromPos[0], REVEAL.fromPos[1], REVEAL.fromPos[2]);
  c.lookAt(REVEAL.fromTgt[0], REVEAL.fromTgt[1], REVEAL.fromTgt[2]);
  c.updateProjectionMatrix();
  if (state.controls) state.controls.enabled = false;
  ensureRevealRig(); // pre-car: floor etc.; rebuilt with the car's materials in playReveal
  revealLights(0);
  if (state.loadingEl) {
    state.loadingEl.style.background = "#0a0a0b"; // keep the black continuity from the opener
    state.loadingEl.classList.add("cine"); // dark spinner variant + instant (no-fade) dismissal
  }
}

function revealApply(u) {
  const s3 = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  const c = state.persCam;
  const sweep = u <= REVEAL.hold ? 0 : (u - REVEAL.hold) / (1 - REVEAL.hold);
  const e = s3(sweep);
  const it = 1 - e;
  // slow push-in toward the lamp during the hold, fading out as the arc takes over
  const push = 0.06 * s3(Math.min(1, u / REVEAL.hold)) * it;
  // quadratic bezier through a side arc
  for (let i = 0; i < 3; i++) {
    const a = REVEAL.fromPos[i], b = REVEAL.toPos[i], q = REVEAL.ctrl[i];
    c.position.setComponent(i, it * it * a + 2 * it * e * q + e * e * b
      + (REVEAL.fromTgt[i] - REVEAL.fromPos[i]) * push);
  }
  const tx = REVEAL.fromTgt[0] + (REVEAL.toTgt[0] - REVEAL.fromTgt[0]) * e;
  const ty = REVEAL.fromTgt[1] + (REVEAL.toTgt[1] - REVEAL.fromTgt[1]) * e;
  const tz = REVEAL.fromTgt[2] + (REVEAL.toTgt[2] - REVEAL.fromTgt[2]) * e;
  c.lookAt(tx, ty, tz);
  c.fov = REVEAL.fromFov + (REVEAL.toFov - REVEAL.fromFov) * e;
  c.updateProjectionMatrix();
  // the lights-up event rides the heart of the sweep and completes just
  // before the camera lands, so the settle happens in full studio light
  const le = 0.03 + 0.97 * s3(Math.min(1, Math.max(0, (sweep - REVEAL.lightLag) / REVEAL.lightSpan)));
  revealLights(le);
}

function playReveal() {
  if (!revealArmed || revealPlaying || !state.carReady) return Promise.resolve();
  revealPlaying = true;
  revealArmed = false;
  // rebuild the rig now that the car's materials exist (arm-time dims restored first)
  releaseRevealRig(true);
  ensureRevealRig();
  if (REVEAL_DEBUG) { revealApply(Math.min(1, (+REVEAL_DEBUG) / REVEAL.dur)); return new Promise(() => {}); }
  return new Promise((resolve) => {
    let ended = false, t0 = null, fallbackId = null;
    const skipTap = () => {
      // the tap that skips the reveal must not also pick a glass zone
      state.suppressPickUntil = performance.now() + 500;
      finish();
    };
    const finish = () => {
      if (ended) return;
      ended = true;
      window.removeEventListener("pointerdown", skipTap);
      window.removeEventListener("keydown", finish);
      clearTimeout(fallbackId);
      state.revealTick = null;
      state.revealWarming = false;
      revealApply(1);
      releaseRevealRig(true);
      restoreCarCamera();
      if (state.loadingEl) {
        state.loadingEl.style.background = "";
        state.loadingEl.classList.remove("cine");
      }
      revealPlaying = false;
      if (PERF_ON) window.__REVEAL_T1 = performance.now();
      resolve();
    };
    window.addEventListener("pointerdown", skipTap);
    window.addEventListener("keydown", finish);
    const start = () => {
      state.revealWarming = false;
      if (ended) return;
      state.revealTick = (now) => {
        if (t0 === null) { t0 = now; if (PERF_ON) window.__REVEAL_T0 = t0; }
        const u = (now - t0) / REVEAL.dur;
        if (u >= 1) { finish(); return; }
        revealApply(u);
      };
      fallbackId = setTimeout(finish, REVEAL.dur + 600); // hidden-tab rAF throttle guarantee
    };
    // Warm the whole pipeline before the clock starts: parallel-compile every
    // shader, upload every texture, then draw one dark frame (allocates the
    // transmission target and shadow map). The render loop holds the previous
    // dark frame meanwhile, so nothing bright or half-compiled is presented.
    state.revealWarming = true;
    const warm = async () => {
      if (ended) return; // skipped while waiting — finish() already restored the studio
      try {
        if (state.renderer.compileAsync)
          await Promise.race([
            state.renderer.compileAsync(state.scene, state.camera),
            new Promise((r) => setTimeout(r, 1600)), // don't let a slow driver stall the show
          ]);
        else state.renderer.compile(state.scene, state.camera);
      } catch (_) { /* warm-up is best-effort */ }
      if (ended) return;
      try {
        state.scene.traverse((o) => {
          const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
          for (const m of ms) for (const k in m) {
            const v = m[k];
            if (v && v.isTexture) state.renderer.initTexture(v);
          }
        });
        revealApply(0);
        state.renderer.render(state.scene, state.camera);
      } catch (_) { /* warm-up is best-effort */ }
    };
    // A hidden tab would burn the whole reveal unseen (rAF is parked, so the
    // fallback timer would just skip to the end) — wait for first visibility.
    const whenVisible = () => new Promise((r) => {
      if (!document.hidden) return r();
      const on = () => { if (!document.hidden) { document.removeEventListener("visibilitychange", on); r(); } };
      document.addEventListener("visibilitychange", on);
    });
    whenVisible().then(warm).then(start, start);
  });
}

function resize() {
  if (!state.renderer || !state.container) return;
  const w = state.container.clientWidth || 800;
  const h = state.container.clientHeight || Math.round(w * 9 / 16);
  state.renderer.setSize(w, h);
  const aspect = w / h;
  if (state.camera.isOrthographicCamera) {
    const fitH = Math.max(state.orthoHeight, (state.orthoWidth || 0) / aspect);
    const hh = fitH / 2;
    state.camera.top = hh; state.camera.bottom = -hh;
    state.camera.left = -hh * aspect; state.camera.right = hh * aspect;
  } else {
    state.camera.aspect = aspect;
  }
  state.camera.updateProjectionMatrix();
}

// film: {vlt, refl, tone} or null for bare glass
// The film doesn't just darken the view — it changes the LIGHT IN THE ROOM.
// Scale the interior daylight rig (sun, sky bounce, fill) by the film's
// transmission so picking a shade visibly calms the space; hold-to-compare
// (film=null) snaps back to full sun. Floors keep the scene from dying at 5%.
function interiorDaylight() {
  if (state.buildingView !== "interior" || !state.buildingPrep) return;
  const film = state.buildingFilm;
  // interior daylight tracks the film's ACTUAL transmission (VLT), not the
  // softened visual curve — a 20% film passes 20% of the light, and the room
  // should show it. Small floors keep a 5% film from blacking out the scene.
  const v = film ? Math.max(0, Math.min(1, film.vlt / 100)) : 1.0;
  if (state.keyLight) {
    state.keyLight.intensity = 3.0 * (0.05 + 0.95 * v);
    // warm films warm the sunlight they pass
    state.keyLight.color.setHex(film && film.tone === "warm" ? 0xffe6c4 : 0xfff4e8);
  }
  if (state.buildingHemi) state.buildingHemi.intensity = 0.38 * (0.3 + 0.7 * v);
  if (state.interiorFill) state.interiorFill.intensity = 2 * (0.45 + 0.55 * v);
  // the env map is a big constant light source — it must dim too or it keeps
  // the room bright no matter what film is on the glass
  setBuildingEnvIntensity(0.45 * (0.3 + 0.7 * v));
}

function applyBuildingFilm(film) {
  const prep = state.buildingPrep;
  if (!prep || !prep.buildingGlass) return;
  const m = prep.buildingGlass;
  interiorDaylight();
  if (!film) {
    m.color.setScalar(1);
    m.envMapIntensity = 1;
    m.metalness = 0;
    return;
  }
  const s = tintScalar(film.vlt);
  m.color.setScalar(s);
  if (film.tone === "warm") { m.color.g *= 0.84; m.color.b *= 0.64; }
  const r = (film.refl || 0) / 100;
  m.envMapIntensity = 1 + r * 3.2;
  m.metalness = r * 0.4;
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
  // cinematic reveal (armed by the app before the first car shows)
  armReveal,
  playReveal,
  revealScrub: (ms) => { ensureRevealRig(); revealApply(Math.min(1, ms / REVEAL.dur)); }, // frame-stepping for visual QA (use with ?revealDebug)
  revealRigInfo() { // QA: what the reveal rig collected
    const r = state.revealRig;
    return r && {
      lamps: r.lamps.map(([m, b]) => [m.name, b, m.emissiveIntensity]),
      spots: r.spots.map((s) => ({ pos: s.position.toArray().map((v) => +v.toFixed(2)), int: +s.intensity.toFixed(2), vis: s.visible })),
    };
  },
  renderBench(n = 30) { // wall-clock for n back-to-back renders; QA-only
    const s = performance.now();
    for (let i = 0; i < n; i++) state.renderer.render(state.scene, state.camera);
    return +(performance.now() - s).toFixed(1);
  },
  // architectural mode
  loadBuilding(cfg) { loadCar({ ...cfg, building: true }); },
  get isBuilding() { return !!state.buildingPrep; },
  setBuildingFilm(film) { state.buildingFilm = film || null; applyBuildingFilm(state.buildingFilm); },
  setBuildingView(view) { state.buildingView = view === "interior" ? "interior" : "exterior"; applyBuildingView(state.buildingView); },
  get buildingView() { return state.buildingView; },
  // returns the zone name under the pointer, or null
  pickZone(clientX, clientY) {
    if (!state.renderer || !state.zoneMeshes || state.buildingPrep) return null;
    if (state.suppressPickUntil && performance.now() < state.suppressPickUntil) return null; // reveal skip-tap
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
  // soft emissive pulse on a zone so picking feels tactile: instant on (no lag,
  // and background-tab-proof), eased fade-out, gentle color + intensity so the
  // geometry-split zone edges don't read as a hard painted slab
  flashZone(zone) {
    const m = state.zoneMats && state.zoneMats[zone];
    if (!m || !m.emissive) return;
    state.flashGen = (state.flashGen || 0) + 1;
    const gen = state.flashGen;
    ZONES.forEach((z) => {                       // clear any superseded pulse
      const zm = state.zoneMats[z];
      if (zm) zm.emissiveIntensity = 0;
    });
    m.emissive.setHex(0x5e93cf);
    const PEAK = 0.6, HOLD = 140, DOWN = 420;
    m.emissiveIntensity = PEAK;                  // synchronous — immediate feedback
    const t0 = performance.now();
    const smooth = (u) => u * u * (3 - 2 * u);
    const tick = (now) => {
      if (gen !== state.flashGen) return;
      const t = now - t0;
      if (t < HOLD) { requestAnimationFrame(tick); return; }
      if (t < HOLD + DOWN) {
        m.emissiveIntensity = PEAK * (1 - smooth((t - HOLD) / DOWN));
        requestAnimationFrame(tick);
        return;
      }
      m.emissiveIntensity = 0;
    };
    requestAnimationFrame(tick);
    setTimeout(() => {                           // rAF can be throttled in hidden tabs
      if (gen === state.flashGen) m.emissiveIntensity = 0;
    }, HOLD + DOWN + 150);
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
  debugPlates() {
    return {
      group: !!state.plateGroup,
      plates: state.plateGroup ? state.plateGroup.children.map((m) => ({
        name: m.name, pos: m.position.toArray().map((v) => +v.toFixed(2)),
      })) : [],
      lastRun: window.__plateDebug || null,
    };
  },
};
document.dispatchEvent(new Event("viewer3d-ready"));
