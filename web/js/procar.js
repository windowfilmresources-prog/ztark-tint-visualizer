// Procedural brandless sedan — the whole car is lofted from cross-sections in code.
// No downloaded model, no license, ~10 KB. The greenhouse is its own lofted volume, so
// windshield / front-side / rear-side / rear-window glass are separate by construction.
// buildCar() returns { group, bodyMats, frontGlassMat, rearGlassMat, fixedGlassMat }.

import * as THREE from "three";

// Sample a sparse [x, value] table at arbitrary x (clamped).
// Default: Catmull-Rom (smooth surfaces). linear=true: straight segments between
// control points — for profiles that must NOT belly, like windshield rake lines.
function table(pointsIn, linear = false) {
  const points = [...pointsIn].sort((a, b) => a[0] - b[0]); // tolerate any entry order
  const xs = points.map((p) => p[0]);
  const lo = xs[0], hi = xs[xs.length - 1];
  let sx, sv, N;
  if (linear) {
    sx = xs; sv = points.map((p) => p[1]); N = xs.length - 1;
  } else {
    const curve = new THREE.CatmullRomCurve3(
      points.map(([x, v]) => new THREE.Vector3(x, v, 0)), false, "catmullrom", 0.5
    );
    N = 400; sx = []; sv = [];
    for (let i = 0; i <= N; i++) {
      const p = curve.getPoint(i / N);
      sx.push(p.x); sv.push(p.y);
    }
  }
  return (x) => {
    if (x <= lo) return sv[0];
    if (x >= hi) return sv[N];
    let a = 0, b = N;
    while (b - a > 1) { const m = (a + b) >> 1; (sx[m] <= x ? a = m : b = m); }
    const t = (x - sx[a]) / (sx[b] - sx[a] || 1);
    return sv[a] + t * (sv[b] - sv[a]);
  };
}

const gauss = (x, c, w) => Math.exp(-((x - c) * (x - c)) / (2 * w * w));

// ---------------------------------------------------------------- body loft
// Car axes: +X = nose, +Y = up, Z = width. All meters-ish; ~4.7 long.

const P = {
  nose: 2.35, tail: -2.35,
  wheelF: 1.40, wheelR: -1.40, wheelY: 0.355, tireR: 0.355, tireW: 0.235,
  cowl: 0.78, deck: -1.42,          // greenhouse span on the body
  bPillar: -0.30,                   // front/rear glass boundary
};

const rockerY = (x) => 0.17
  + 0.47 * gauss(x, P.wheelF, 0.30) * (Math.abs(x - P.wheelF) < 0.62 ? 1 : 0)
  + 0.47 * gauss(x, P.wheelR, 0.30) * (Math.abs(x - P.wheelR) < 0.62 ? 1 : 0)
  + 0.13 * Math.max(0, (x - 2.0) / 0.35)       // front bumper undercut
  + 0.13 * Math.max(0, (-x - 1.95) / 0.40);    // rear bumper undercut

const beltY = table([[-2.35, 0.80], [-1.6, 0.79], [-0.5, 0.765], [0.6, 0.745], [1.5, 0.725], [2.35, 0.69]]);
const halfW = table([[-2.35, 0.70], [-1.85, 0.86], [-1.0, 0.90], [0.0, 0.91], [1.0, 0.89], [1.85, 0.84], [2.35, 0.62]]);
const topY = (x) => {
  if (x >= P.cowl)  return table([[P.cowl, beltY(P.cowl)], [1.2, 0.70], [1.9, 0.665], [2.35, 0.635]])(x); // hood
  if (x <= P.deck)  return table([[-2.35, 0.775], [-1.9, 0.805], [P.deck, beltY(P.deck) + 0.005]])(x);    // trunk
  return beltY(x);                                                                                         // under cabin
};

// half cross-section, bottom → side → shoulder → center-top (z >= 0)
function bodySection(x) {
  const r = rockerY(x), b = beltY(x), w = halfW(x), t = topY(x);
  const pts = [];
  pts.push([0.30 * w, r]);                 // under-body
  pts.push([0.86 * w, r]);                 // rocker corner
  pts.push([0.985 * w, r + 0.55 * (b - r)]); // side, slight bulge
  pts.push([1.00 * w, b - 0.05]);          // shoulder
  pts.push([0.955 * w, b + 0.005]);        // shoulder roll-over
  // top surface: works whether the center top is above (trunk/deck) or below (hood) the shoulder
  pts.push([0.80 * w, b + 0.6 * (t - b)]);
  pts.push([0.52 * w, t + 0.15 * Math.max(0, b - t) + 0.004]);
  pts.push([0, t + 0.012]);
  return pts;
}

// Loft rings of half-sections (mirrored) into a smooth indexed mesh.
function loft(sectionAt, x0, x1, steps, ringSamples) {
  const rings = [];
  for (let i = 0; i <= steps; i++) {
    const x = x0 + (i / steps) * (x1 - x0);
    const half = sectionAt(x);
    // resample the polyline evenly so rings share topology
    const curve = new THREE.CatmullRomCurve3(
      half.map(([z, y]) => new THREE.Vector3(0, y, z)), false, "catmullrom", 0.35
    );
    const ring = [];
    for (let s = 0; s <= ringSamples; s++) {
      const p = curve.getPoint(s / ringSamples);
      ring.push([x, p.y, p.z]);
    }
    // mirror (skip duplicate center points)
    const full = [];
    for (let s = 0; s <= ringSamples; s++) full.push(ring[s]);
    for (let s = ringSamples - 1; s >= 1; s--) { const [rx, ry, rz] = ring[s]; full.push([rx, ry, -rz]); }
    rings.push(full);
  }
  const rlen = rings[0].length;
  const pos = [];
  rings.forEach((ring) => ring.forEach(([x, y, z]) => pos.push(x, y, z)));
  const idx = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < rlen; s++) {
      const a = i * rlen + s, b2 = i * rlen + ((s + 1) % rlen);
      const c = (i + 1) * rlen + s, d = (i + 1) * rlen + ((s + 1) % rlen);
      idx.push(a, c, b2, b2, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

// close a loft end with a triangle fan (for nose / tail fascias)
function cap(geo, ringStart, rlen, centerXYZ, flip) {
  const pos = Array.from(geo.getAttribute("position").array);
  const idx = Array.from(geo.getIndex().array);
  const ci = pos.length / 3;
  pos.push(...centerXYZ);
  for (let s = 0; s < rlen; s++) {
    const a = ringStart + s, b = ringStart + ((s + 1) % rlen);
    if (flip) idx.push(a, b, ci); else idx.push(b, a, ci);
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
}

// ---------------------------------------------------------------- greenhouse
// STRAIGHT windshield rake, long flat roof, straight rear glass — piecewise linear
// with small rounding knuckles at the A and C pillars.
const roofY = table([
  [-1.44, 0.79], [-0.98, 1.30], [-0.85, 1.355], [-0.60, 1.393], [-0.30, 1.40],
  [0.10, 1.39], [0.34, 1.35], [0.44, 1.315], [0.84, 0.79],
], true);
const ghW = (x) => 0.945 * halfW(x) - 0.03;

// Greenhouse rings use a FIXED 4-point half-section so ring topology is stable and
// every quad's role (side band vs roof band) is known by its segment index — glass
// zones are assigned by construction, not by normal-guessing.
function greenhouseSection(x) {
  const b = beltY(x) + 0.004, ry = Math.max(roofY(x), b + 0.012), w = ghW(x);
  const rw = 0.62 * w;
  return [
    [w, b],                            // s0 belt
    [0.955 * w, b + 0.55 * (ry - b)],  // s1 mid side
    [rw, ry - 0.012],                  // s2 roof edge
    [0, ry + 0.014],                   // s3 roof center
  ];
}

// Build the greenhouse with per-quad material buckets.
function buildGreenhouse(mats) {
  const X0 = P.deck - 0.02, X1 = P.cowl + 0.02, STEPS = 64;
  const rings = [];
  for (let i = 0; i <= STEPS; i++) {
    const x = X0 + (i / STEPS) * (X1 - X0);
    const half = greenhouseSection(x);
    const full = [...half.map(([z, y]) => [x, y, z])];
    for (let s = half.length - 2; s >= 0; s--) { const [z, y] = half[s]; full.push([x, y, -z]); }
    rings.push(full); // beltR, midR, roofEdgeR, center, roofEdgeL, midL, beltL — OPEN strip (no bottom)
  }
  const rlen = rings[0].length; // 7
  const pos = [];
  rings.forEach((r) => r.forEach(([x, y, z]) => pos.push(x, y, z)));

  const A_PILLAR = [0.36, 0.50], B_PILLAR = [P.bPillar - 0.045, P.bPillar + 0.045], C_PILLAR = [-1.20, -1.04];
  const inBand = (x, [lo, hi]) => x >= lo && x <= hi;
  const buckets = { paint: [], trim: [], front: [], rear: [], fixed: [] };

  for (let i = 0; i < STEPS; i++) {
    const xm = X0 + ((i + 0.5) / STEPS) * (X1 - X0);
    for (let s = 0; s < rlen - 1; s++) {
      const sn = s + 1;
      const isRoof = (s === 2 || s === 3);        // segments 2-3 and 3-4 span the roof band
      let bucket;
      if (isRoof) {
        bucket = xm > 0.34 ? "fixed" : xm < -0.90 ? "rear" : "paint";
      } else {
        if (xm > A_PILLAR[1]) bucket = "fixed";                                   // wraparound windshield corner
        else if (xm < C_PILLAR[0]) bucket = "rear";                               // rear-glass lower corners
        else if (inBand(xm, A_PILLAR) || inBand(xm, B_PILLAR) || inBand(xm, C_PILLAR)) bucket = "trim";
        else bucket = xm >= P.bPillar ? "front" : "rear";
      }
      const a = i * rlen + s, b2 = i * rlen + sn;
      const c = (i + 1) * rlen + s, d = (i + 1) * rlen + sn;
      buckets[bucket].push(a, c, b2, b2, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const order = ["paint", "trim", "front", "rear", "fixed"];
  const matOf = { paint: mats.paint, trim: mats.trim, front: mats.frontGlass, rear: mats.rearGlass, fixed: mats.fixedGlass };
  const index = [];
  order.forEach((k) => {
    const start = index.length;
    index.push(...buckets[k]);
    geo.addGroup(start, buckets[k].length, order.indexOf(k));
  });
  geo.setIndex(index);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, order.map((k) => matOf[k]));
}

// ---------------------------------------------------------------- materials
function makeMats(paintHex) {
  const paint = new THREE.MeshPhysicalMaterial({
    color: paintHex, metalness: 0.15, roughness: 0.4, clearcoat: 1.0, clearcoatRoughness: 0.06,
  });
  paint.name = "Body_Paint";
  const trim = new THREE.MeshStandardMaterial({ color: 0x0d0f11, metalness: 0.4, roughness: 0.5 });
  trim.name = "Trim";
  const glass = () => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.0, roughness: 0.14, transmission: 1.0,
  });
  const frontGlass = glass(), rearGlass = glass(), fixedGlass = glass();
  frontGlass.name = "Glass_Front"; rearGlass.name = "Glass_Rear"; fixedGlass.name = "Glass_Fixed";
  return { paint, trim, frontGlass, rearGlass, fixedGlass };
}

// ---------------------------------------------------------------- details
function wheel(mats) {
  const grp = new THREE.Group();
  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(P.tireR - 0.08, 0.09, 16, 40),
    new THREE.MeshStandardMaterial({ color: 0x131518, roughness: 0.92 })
  );
  tire.scale.z = P.tireW / 0.18;
  grp.add(tire);
  // bright machined-face alloy, pushed to the outer face so it reads in side view
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.75, roughness: 0.3 });
  const FACE = 0.095; // outboard offset of the visible wheel face
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.05, 28), rimMat);
  dish.rotation.x = Math.PI / 2;
  dish.position.z = FACE - 0.05;
  grp.add(dish);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.2, 28,
    1, true), new THREE.MeshStandardMaterial({ color: 0x22262a, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.01;
  grp.add(barrel);
  for (let s = 0; s < 7; s++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.24, 0.035), rimMat);
    spoke.position.set(0, 0.115, FACE);
    const holder = new THREE.Group();
    holder.add(spoke); holder.rotation.z = (s / 7) * Math.PI * 2;
    grp.add(holder);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.06, 16), rimMat);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = FACE;
  grp.add(hub);
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xb02030, roughness: 0.4 }));
  caliper.position.set(0.145, 0.02, 0.02);
  grp.add(caliper);
  return grp;
}

function details(group, mats) {
  const trim = mats.trim;
  // greenhouse-base gloss trim line
  // headlights: thin wrapped slivers at the nose corners
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xdfeaf2, emissive: 0x9fb8c8, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.6,
  });
  [1, -1].forEach((s) => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.34), lightMat);
    hl.position.set(2.34, 0.565, s * 0.38);
    hl.rotation.y = s * -0.28;
    group.add(hl);
  });
  // full-width taillight bar
  const tlMat = new THREE.MeshStandardMaterial({
    color: 0x7a1018, emissive: 0xa01020, emissiveIntensity: 0.55, roughness: 0.3,
  });
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, 1.18), tlMat);
  tl.position.set(-2.335, 0.735, 0);
  group.add(tl);
  // grille + lower intake
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.78), trim);
  grille.position.set(2.335, 0.44, 0);
  group.add(grille);
  // mirrors
  [1, -1].forEach((s) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.075, 0.20), mats.paint);
    m.position.set(0.66, beltY(0.66) + 0.05, s * (halfW(0.66) + 0.075));
    group.add(m);
  });
  // rocker shadow strip
  [1, -1].forEach((s) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.07, 0.03), trim);
    r.position.set(0, 0.185, s * (halfW(0) * 0.985));
    group.add(r);
  });
  // dark wheel-well backers + underbody pan so the shell never reads hollow
  const wellMat = new THREE.MeshStandardMaterial({ color: 0x0a0c0d, roughness: 1, side: THREE.DoubleSide });
  [[P.wheelF, 1], [P.wheelF, -1], [P.wheelR, 1], [P.wheelR, -1]].forEach(([x, s]) => {
    const well = new THREE.Mesh(new THREE.CircleGeometry(0.44, 24), wellMat);
    well.position.set(x, P.wheelY + 0.03, s * (halfW(x) * 0.42));
    well.rotation.y = s * Math.PI / 2;
    group.add(well);
  });
  const pan = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.08, 1.34), wellMat);
  pan.position.set(0, 0.19, 0);
  group.add(pan);
}

// ---------------------------------------------------------------- assemble
export function buildCar({ paint = 0x16181a } = {}) {
  const mats = makeMats(paint);
  const group = new THREE.Group();

  // body
  const bodyGeo = loft(bodySection, P.tail, P.nose, 72, 22);
  const rlen = 2 * 22; // ring length after mirroring (ringSamples*2)
  cap(bodyGeo, 0, rlen, [P.tail - 0.03, (beltY(P.tail) + rockerY(P.tail)) / 2, 0], false);
  cap(bodyGeo, 72 * rlen, rlen, [P.nose + 0.03, (beltY(P.nose) + rockerY(P.nose)) / 2 - 0.06, 0], true);
  const smooth = bodyGeo.toNonIndexed();
  smooth.computeVertexNormals();
  const bodyIndexed = bodyGeo;
  bodyIndexed.computeVertexNormals();
  const body = new THREE.Mesh(bodyIndexed, mats.paint);
  group.add(body);

  // greenhouse
  group.add(buildGreenhouse(mats));

  // wheels
  [[P.wheelF, 1], [P.wheelF, -1], [P.wheelR, 1], [P.wheelR, -1]].forEach(([x, s]) => {
    const w = wheel(mats);
    w.position.set(x, P.wheelY, s * (halfW(x) * 0.99 - P.tireW / 2 + 0.055));
    if (s < 0) w.rotation.y = Math.PI;
    group.add(w);
  });

  details(group, mats);

  return {
    group,
    bodyMats: [mats.paint],
    frontGlassMat: mats.frontGlass,
    rearGlassMat: mats.rearGlass,
    fixedGlassMat: mats.fixedGlass,
    hasBakedShadow: false,
  };
}
