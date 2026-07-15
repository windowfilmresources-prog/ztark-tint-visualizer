// Tint visualizer engine. Brand personality (theme vars, fonts, logo, products, copy)
// comes entirely from brands.js — this file is brand-agnostic.
// URL: index.html?brand=huper|autobahn|edge (default huper)
//
// Four independent tint zones: windshield / front sides / rear sides / back window.
// Zones are picked either from the zone bar or by clicking the glass on the 3D car.
// "All windows" applies to front+rear+back (the windshield is a deliberate opt-in —
// most windshield film is near-clear product like Klar 85 / Clear Comfort).

(function () {
  const qs = new URLSearchParams(location.search);
  const brandId = (qs.get("brand") || "huper").toLowerCase();
  const BRAND = window.BRANDS[brandId] || window.BRANDS.huper;

  const ZONES = ["windshield", "front", "rear", "back"];
  const ZONE_LABELS = {
    windshield: "Windshield",
    front: "Front sides",
    rear: "Rear sides",
    back: "Back window",
  };

  // ---------- theme ----------
  const root = document.documentElement;
  Object.entries(BRAND.theme).forEach(([k, v]) => root.style.setProperty(k, v));
  window.PLATE_STYLE = BRAND.plate || null; // branded license plates in the 3D viewer
  (BRAND.fontLinks || []).forEach((href) => {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = href;
    document.head.appendChild(l);
  });
  document.title = `${BRAND.name} — Window Tint Visualizer`;
  if (BRAND.favicon) {
    const f = document.createElement("link");
    f.rel = "icon"; f.href = BRAND.favicon;
    document.head.appendChild(f);
  }

  const logoEl = document.getElementById("brandLogo");
  if (BRAND.logoImg) {
    logoEl.innerHTML = `<img class="logo" src="${BRAND.logoImg}" alt="${BRAND.name}">`;
  } else {
    logoEl.innerHTML = `<span class="logo-text">${BRAND.logoText || BRAND.name}</span>`;
  }
  document.getElementById("pageTitle").textContent = BRAND.pageTitle || "Tint Visualizer";
  const hero = BRAND.hero || {};
  document.getElementById("heroEyebrow").textContent = hero.eyebrow || "";
  document.getElementById("heroTitle").textContent = hero.title || "";
  document.getElementById("heroSub").textContent = hero.sub || "";
  document.getElementById("ctaTagline").textContent = BRAND.ctaTagline || "";
  document.getElementById("dealerBtn").href = BRAND.dealerUrl || "#";
  document.getElementById("dealerBtn").textContent = BRAND.dealerCta || "Find an Installer";

  // ---------- state ----------
  const S = {
    vehicle: null,                   // fleet id (3D) or legacy vehicle id (fallback modes)
    paint: BRAND.defaultPaint || "#16181a",
    series: 0,                       // index into BRAND.products
    zoneMode: "all",                 // all | windshield | front | rear | back
    shades: { windshield: null, front: null, rear: null, back: null },
    usState: "",
    comparing: false,
    space: "vehicles",               // vehicles | residential | commercial
    b: {                             // per-space architectural film selection
      residential: { series: 0, shade: null, divider: 0.55 },
      commercial: { series: 0, shade: null, divider: 0.55 },
    },
  };

  // Architectural mode exists only for brands with a flat-glass catalog (Hüper, Edge)
  const BCAT = (window.BUILDINGS && window.BUILDINGS.catalogs[brandId]) || null;
  const BSCENES = (window.BUILDINGS && window.BUILDINGS.scenes) || {};

  const PAINTS = [
    ["White",  "#e8eaec"], ["Silver", "#b7bcc2"], ["Gray", "#686d73"],
    ["Black",  "#1a1c1f"], ["Red",    "#8e1c24"], ["Blue", "#24406e"],
  ];

  function tintOpacity(vlt) {
    if (vlt == null) return 0.06;
    return Math.min(0.94, 1 - Math.pow(vlt / 100, 0.62));
  }

  const $ = (id) => document.getElementById(id);

  // Renderer priority: 3D showroom → traced photos → vector art.
  let MODE_3D = true;
  let PHOTO_MODE, FLEET2D;
  function computeModes() {
    PHOTO_MODE = !MODE_3D && !!(window.PHOTO_CARS && window.PHOTO_CARS.length);
    FLEET2D = PHOTO_MODE ? window.PHOTO_CARS : window.VEHICLES;
  }
  computeModes();

  function abandon3D() {
    if (!MODE_3D) return;
    MODE_3D = false;
    computeModes();
    S.vehicle = FLEET2D[0].id;
    renderStageTools();
    renderVehicle();
    renderZoneBar();
    renderShades();
  }
  document.addEventListener("viewer3d-unavailable", abandon3D);
  setTimeout(() => { if (MODE_3D && !window.VIEWER3D) abandon3D(); }, 8000);

  // ---------- stage / vehicle ----------
  function fleet3D() {
    return (window.VIEWER3D && window.VIEWER3D.fleet) || [];
  }

  // ---------- architectural (building) stage ----------
  function bSel() { return S.b[S.space]; }
  function bSeries() { return BCAT.products[bSel().series]; }

  function buildingFilmLayers(scene) {
    const sel = bSel().shade;
    const polys = scene.windows.map((w) => {
      const pts = w.r
        ? [[w.r[0], w.r[1]], [w.r[0] + w.r[2], w.r[1]], [w.r[0] + w.r[2], w.r[1] + w.r[3]], [w.r[0], w.r[1] + w.r[3]]]
        : w.q;
      return pts.map(([x, y]) => `${(x * 1000).toFixed(1)},${(y * 667).toFixed(1)}`).join(" ");
    });
    if (!sel) return { polys, dark: 0, refl: 0, warm: 0 };
    return {
      polys,
      dark: Math.min(0.92, 1 - Math.pow(sel.vlt / 100, 0.62)),
      refl: (sel.refl || 0) / 100 * 0.55,
      warm: sel.tone === "warm" ? 0.16 : 0,
    };
  }

  function renderBuilding() {
    const scene = BSCENES[S.space];
    const f = buildingFilmLayers(scene);
    const d = bSel().divider;
    $("stage").innerHTML = `<div class="badge-vlt" id="vltBadge"></div>
      <div class="bstage" id="bstage">
        <img src="${scene.img}" alt="${scene.label} building">
        <svg viewBox="0 0 1000 667" preserveAspectRatio="none">
          <defs>
            <clipPath id="bClip"><rect id="bClipRect" x="0" y="0" width="${d * 1000}" height="667"/></clipPath>
            <linearGradient id="bSheen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#dfeaf4"/><stop offset="0.5" stop-color="#ffffff"/><stop offset="1" stop-color="#c9d6e2"/>
            </linearGradient>
          </defs>
          <g clip-path="url(#bClip)">
            ${f.polys.map((p) => `<polygon class="bf-dark" points="${p}" fill="#01050a" style="mix-blend-mode:multiply" opacity="${f.dark}"/>`).join("")}
            ${f.polys.map((p) => `<polygon class="bf-refl" points="${p}" fill="url(#bSheen)" style="mix-blend-mode:screen" opacity="${f.refl}"/>`).join("")}
            ${f.polys.map((p) => `<polygon class="bf-warm" points="${p}" fill="#8a4a12" style="mix-blend-mode:multiply" opacity="${f.warm}"/>`).join("")}
          </g>
        </svg>
        <div class="bdivider" id="bDivider" style="left:${d * 100}%">
          <div class="bhandle" role="slider" aria-label="Comparison divider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(d * 100)}" tabindex="0">⟨ ⟩</div>
        </div>
        <span class="bside-label" style="left:14px;top:50px">WITH FILM</span>
        <span class="bside-label" style="right:12px">BARE GLASS</span>
        <div class="photo-credit">${scene.credit}</div>
      </div>
      <div class="stage-hint">Drag the divider to compare</div>`;
    wireDivider();
    renderBadge();
  }

  function updateBuildingFilm() {
    const scene = BSCENES[S.space];
    const f = buildingFilmLayers(scene);
    const st = $("bstage");
    if (!st) return;
    st.querySelectorAll(".bf-dark").forEach((p) => p.setAttribute("opacity", f.dark));
    st.querySelectorAll(".bf-refl").forEach((p) => p.setAttribute("opacity", f.refl));
    st.querySelectorAll(".bf-warm").forEach((p) => p.setAttribute("opacity", f.warm));
    renderBadge();
  }

  function wireDivider() {
    const stage = $("bstage");
    const div = $("bDivider");
    if (!stage || !div) return;
    const setPos = (clientX) => {
      const r = stage.getBoundingClientRect();
      const d = Math.min(0.96, Math.max(0.04, (clientX - r.left) / r.width));
      bSel().divider = d;
      div.style.left = d * 100 + "%";
      const rect = stage.querySelector("#bClipRect");
      if (rect) rect.setAttribute("width", d * 1000);
      div.querySelector(".bhandle").setAttribute("aria-valuenow", Math.round(d * 100));
    };
    let dragging = false;
    div.addEventListener("pointerdown", (e) => { dragging = true; div.setPointerCapture(e.pointerId); e.preventDefault(); });
    div.addEventListener("pointermove", (e) => { if (dragging) setPos(e.clientX); });
    ["pointerup", "pointercancel"].forEach((ev) => div.addEventListener(ev, () => { dragging = false; }));
    stage.addEventListener("pointerdown", (e) => { if (e.target.tagName === "IMG" || e.target.tagName === "svg") setPos(e.clientX); });
    div.querySelector(".bhandle").addEventListener("keydown", (e) => {
      const step = e.key === "ArrowLeft" ? -0.04 : e.key === "ArrowRight" ? 0.04 : 0;
      if (!step) return;
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      setPos(r.left + (bSel().divider + step) * r.width);
    });
  }

  function renderVehicle() {
    if (S.space !== "vehicles") { renderBuilding(); return; }
    if (MODE_3D) {
      $("stage").innerHTML = `<div class="badge-vlt" id="vltBadge"></div>
        <div id="viewer3d"></div>
        <div class="stage-hint" id="stageHint">Drag to rotate · Click a window to select it</div>
        <div class="photo-credit" id="modelCredit"></div>`;
      const boot = () => {
        if (!MODE_3D) return; // abandon3D may have fired while the module loaded
        const el = document.getElementById("viewer3d");
        if (!el) return;
        window.VIEWER3D.mount(el);
        window.VIEWER3D.setPaint(S.paint);
        wireStagePicking();
        applyTint();
        // returning from a building space: the car is already loaded, so no
        // car-loaded event will fire — re-run its listener for credit/tabs
        if (window.VIEWER3D.credit) document.dispatchEvent(new Event("viewer3d-car-loaded"));
      };
      if (window.VIEWER3D) boot();
      else document.addEventListener("viewer3d-ready", boot, { once: true });
      return;
    }
    const v = FLEET2D.find((x) => x.id === S.vehicle) || FLEET2D[0];
    S.vehicle = v.id;
    if (PHOTO_MODE) {
      const polys = v.zones.map((z) =>
        `<polygon class="tint" data-zone="${z.zone}" points="${z.points}" fill="#000105"
           style="mix-blend-mode:multiply" opacity="0"/>`).join("");
      const mask = `mask-image:url('${v.img}');-webkit-mask-image:url('${v.img}');` +
                   `mask-size:100% 100%;-webkit-mask-size:100% 100%;`;
      $("stage").innerHTML = `<div class="badge-vlt" id="vltBadge"></div>
        <div class="photo-stage">
          <div class="photo-frame">
            <img src="${v.img}" alt="${v.label} side profile">
            <svg viewBox="0 0 ${v.w} ${v.h}" preserveAspectRatio="none" style="${mask}">${polys}</svg>
          </div>
        </div>
        ${v.credit ? `<div class="photo-credit">${v.credit}</div>` : ""}`;
    } else {
      $("stage").innerHTML = `<div class="badge-vlt" id="vltBadge"></div>` + v.svg;
      $("stage").querySelector("svg").style.setProperty("--paint", S.paint);
    }
    applyTint();
  }

  // every car load (including fleet swaps) re-applies paint, tint, and credit;
  // also (re)renders the vehicle tabs — the fleet isn't known until the module loads
  document.addEventListener("viewer3d-car-loaded", () => {
    if (!MODE_3D || !window.VIEWER3D) return;
    const fleet = fleet3D();
    if (fleet.length && !fleet.some((f) => f.id === S.vehicle)) S.vehicle = fleet[0].id;
    renderStageTools();
    window.VIEWER3D.setPaint(S.paint);
    const cr = document.getElementById("modelCredit");
    if (cr) {
      const txt = window.VIEWER3D.credit || "";
      const url = window.VIEWER3D.creditUrl || "";
      cr.textContent = "";
      if (txt && url) {
        // linked credit per the source platform's attribution guidance
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener license";
        a.textContent = txt;
        cr.appendChild(a);
      } else {
        cr.textContent = txt;
      }
      cr.style.display = txt ? "" : "none";
    }
    applyTint();
  });

  // click (not drag) on the canvas selects the glass zone under the pointer
  function wireStagePicking() {
    const el = document.getElementById("viewer3d");
    if (!el) return;
    let downAt = null;
    el.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
    el.addEventListener("pointercancel", () => { downAt = null; });
    el.addEventListener("pointerup", (e) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      downAt = null;
      if (moved > 10 || !window.VIEWER3D || !window.VIEWER3D.carReady) return;
      const zone = window.VIEWER3D.pickZone(e.clientX, e.clientY);
      if (!zone) return;
      S.zoneMode = zone;
      window.VIEWER3D.flashZone(zone);
      renderZoneBar();
      renderShades();
      renderSpecs();
    });
  }

  function applyTint() {
    if (MODE_3D) {
      if (window.VIEWER3D && window.VIEWER3D.carReady) {
        const v = {};
        ZONES.forEach((z) => {
          const sel = S.shades[z];
          v[z] = S.comparing ? null : sel ? sel.vlt : null;
        });
        window.VIEWER3D.setTint(v);
      }
    } else {
      const svg = $("stage") && $("stage").querySelector("svg");
      if (svg) {
        svg.querySelectorAll(".tint").forEach((p) => {
          // 2D fallbacks only model front/rear side glass
          const zone = p.dataset.zone === "rear" ? "rear" : "front";
          const sel = S.shades[zone];
          const vlt = S.comparing ? null : sel ? sel.vlt : null;
          const o = PHOTO_MODE && vlt == null ? 0 : tintOpacity(vlt);
          p.setAttribute("opacity", o.toFixed(3));
        });
      }
    }
    renderBadge();
    renderLaw();
    renderZoneBar();
  }

  function renderBadge() {
    const el = $("vltBadge");
    if (!el) return;
    if (S.space !== "vehicles") {
      const sel = bSel().shade;
      el.textContent = sel
        ? `${bSeries().name} · ${sel.name || (sel.sku ?? sel.vlt) + "%"}`
        : "Bare glass — pick a film";
      return;
    }
    if (S.comparing) { el.textContent = "Factory glass (comparing)"; return; }
    const abbr = { windshield: "WS", front: "F", rear: "R", back: "B" };
    const parts = ZONES.filter((z) => S.shades[z])
      .map((z) => `${abbr[z]} ${S.shades[z].sku ?? S.shades[z].vlt}%`);
    el.textContent = parts.length ? parts.join(" · ") : "Factory glass — pick a shade";
  }

  // ---------- space switcher ----------
  function enterSpace(space) {
    if (S.space === space) return;
    S.space = space;
    const auto = space === "vehicles";
    // cards that only make sense for vehicles
    const zoneCard = $("zoneBar") && $("zoneBar").closest(".card");
    const lawCard = $("lawSelect") && $("lawSelect").closest(".card");
    if (zoneCard) zoneCard.style.display = auto ? "" : "none";
    if (lawCard) lawCard.style.display = auto ? "" : "none";
    const sub = $("heroSub");
    if (sub) sub.textContent = auto ? (BRAND.hero.sub || "") : (BCAT.heroSub || BRAND.hero.sub || "");
    const pt = $("pageTitle");
    if (pt && BRAND.pageTitle) pt.textContent = auto ? BRAND.pageTitle : "Architectural Film Viewer";
    renderStageTools();
    renderVehicle();
    renderSeries();
    renderShades();
    renderSpecs();
  }

  function renderSpaceTabs() {
    let el = $("spaceTabs");
    if (!BCAT) { if (el) el.parentElement.style.display = "none"; return; }
    if (!el) {
      const group = document.createElement("div");
      group.className = "group";
      group.innerHTML = `<span class="group-label">Space</span><span id="spaceTabs" class="group"></span>`;
      const tools = document.querySelector(".stage-tools");
      tools.insertBefore(group, tools.firstChild);
      el = $("spaceTabs");
    }
    const spaces = [["vehicles", "Vehicles"], ["residential", "Residential"], ["commercial", "Commercial"]];
    el.innerHTML = spaces.map(([id, label]) =>
      `<button class="veh-btn ${S.space === id ? "active" : ""}" data-s="${id}">${label}</button>`).join("");
    el.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => enterSpace(b.dataset.s)));
  }

  // ---------- stage tools ----------
  function renderStageTools() {
    renderSpaceTabs();
    const building = S.space !== "vehicles";
    $("vehTabs").parentElement.style.display = building ? "none" : "";
    $("paints").parentElement.style.display = building ? "none" : "";
    $("holdCompare").style.display = building ? "none" : "";
    if (building) return;
    const fleet = MODE_3D ? fleet3D() : FLEET2D;
    const tabs = $("vehTabs");
    const carOverride = !!qs.get("car"); // ?car= lab/proc previews aren't part of the fleet
    if (MODE_3D && (fleet.length < 2 || carOverride)) {
      tabs.parentElement.style.display = "none";
    } else {
      tabs.parentElement.style.display = "";
      tabs.innerHTML = fleet.map((v) =>
        `<button class="veh-btn ${v.id === S.vehicle ? "active" : ""}" data-v="${v.id}">${v.label}</button>`).join("");
      tabs.querySelectorAll("button").forEach((b) =>
        b.addEventListener("click", () => {
          if (b.dataset.v === S.vehicle) return; // already showing this vehicle
          S.vehicle = b.dataset.v;
          if (MODE_3D) { window.VIEWER3D.loadCar(S.vehicle); renderStageTools(); }
          else { renderStageTools(); renderVehicle(); }
        }));
    }

    $("paints").parentElement.style.display = PHOTO_MODE ? "none" : "";
    $("paints").innerHTML = PAINTS.map(([n, c]) =>
      `<button type="button" class="swatch ${c === S.paint ? "active" : ""}" title="${n}" aria-label="Paint: ${n}" data-c="${c}" style="background:${c}"></button>`).join("");
    $("paints").querySelectorAll(".swatch").forEach((s) =>
      s.addEventListener("click", () => {
        S.paint = s.dataset.c;
        renderStageTools();
        if (MODE_3D) { if (window.VIEWER3D) window.VIEWER3D.setPaint(S.paint); }
        else if (!PHOTO_MODE) $("stage").querySelector("svg").style.setProperty("--paint", S.paint);
      }));
  }

  const hold = $("holdCompare");
  const setCompare = (on) => { S.comparing = on; applyTint(); };
  ["mousedown", "touchstart"].forEach((e) => hold.addEventListener(e, (ev) => { ev.preventDefault(); setCompare(true); }));
  ["mouseup", "mouseleave", "touchend", "touchcancel", "blur"].forEach((e) => hold.addEventListener(e, () => setCompare(false)));
  hold.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); setCompare(true); } });
  hold.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") setCompare(false); });

  // ---------- products ----------
  function series() { return BRAND.products[S.series]; }
  function curSeries() { return S.space === "vehicles" ? series() : bSeries(); }

  function renderSeries() {
    const building = S.space !== "vehicles";
    const products = building ? BCAT.products : BRAND.products;
    const active = building ? bSel().series : S.series;
    $("seriesTabs").innerHTML = products.map((p, i) =>
      `<button class="series-tab ${i === active ? "active" : ""}" data-i="${i}">${p.name}</button>`).join("");
    $("seriesTabs").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        if (building) bSel().series = +b.dataset.i;
        else S.series = +b.dataset.i;
        renderSeries(); renderShades(); renderSpecs();
      }));
    $("seriesDesc").textContent = curSeries().tagline || "";
    $("seriesTech").textContent = curSeries().tech || "";
    $("seriesTech").style.display = curSeries().tech ? "inline-block" : "none";
  }

  function activeZones() {
    return S.zoneMode === "all" ? ["front", "rear", "back"] : [S.zoneMode];
  }

  function activeShadeVlt() {
    const zone = S.zoneMode === "all" ? "front" : S.zoneMode;
    const sel = S.shades[zone];
    return sel && sel.seriesIdx === S.series ? sel.vlt : null;
  }

  function renderShades() {
    if (S.space !== "vehicles") return renderBuildingShades();
    const cur = activeShadeVlt();
    const anySet = activeZones().some((z) => S.shades[z]);
    $("shadeChips").innerHTML =
      `<button class="shade-chip factory ${!anySet ? "active" : ""}" data-factory="1">
        <div class="dot" style="--dot:hsl(205,15%,88%)"></div>
        <div class="pct">—</div><div class="sub">Factory</div>
      </button>` +
      series().shades.map((s) => {
        const l = Math.round(14 + s.vlt * 0.72);
        return `<button class="shade-chip ${s.vlt === cur ? "active" : ""}" data-vlt="${s.vlt}" data-sku="${s.sku ?? s.vlt}">
          <div class="dot" style="--dot:hsl(208,10%,${l}%)"></div>
          <div class="pct">${s.sku ?? s.vlt}%</div><div class="sub">Shade</div>
        </button>`;
      }).join("");
    $("shadeChips").querySelectorAll(".shade-chip").forEach((b) =>
      b.addEventListener("click", () => {
        if (b.dataset.factory) {
          activeZones().forEach((z) => { S.shades[z] = null; });
        } else {
          const sel = { vlt: +b.dataset.vlt, sku: +b.dataset.sku, seriesIdx: S.series };
          activeZones().forEach((z) => { S.shades[z] = { ...sel }; });
        }
        renderShades(); renderSpecs(); applyTint();
      }));
  }

  function renderBuildingShades() {
    const b = bSel();
    const cur = b.shade;
    $("shadeChips").innerHTML =
      `<button class="shade-chip factory ${!cur ? "active" : ""}" data-factory="1">
        <div class="dot" style="--dot:hsl(205,15%,88%)"></div>
        <div class="pct">—</div><div class="sub">Bare</div>
      </button>` +
      bSeries().shades.map((s, i) => {
        const l = Math.round(14 + s.vlt * 0.72);
        return `<button class="shade-chip ${cur && cur.vlt === s.vlt && cur.sku === s.sku ? "active" : ""}" data-i="${i}">
          <div class="dot" style="--dot:hsl(${s.tone === "warm" ? "28,30%" : "208,10%"},${l}%)"></div>
          <div class="pct">${s.sku}%</div><div class="sub">${s.name ? "Film" : "Shade"}</div>
        </button>`;
      }).join("");
    $("shadeChips").querySelectorAll(".shade-chip").forEach((btn) =>
      btn.addEventListener("click", () => {
        b.shade = btn.dataset.factory ? null : { ...bSeries().shades[+btn.dataset.i] };
        renderBuildingShades(); renderSpecs(); updateBuildingFilm();
      }));
  }

  function shadeMini(sel) {
    if (!sel) return "—";
    return `${sel.sku ?? sel.vlt}%`;
  }

  function renderZoneBar() {
    const el = $("zoneBar");
    if (!el) return;
    // 2D fallback art only models side glass — offer only the zones that do something
    const zoneIds = MODE_3D ? ZONES : ["front", "rear"];
    if (!MODE_3D && !zoneIds.includes(S.zoneMode) && S.zoneMode !== "all") S.zoneMode = "all";
    const zones = [["all", "All windows"], ...zoneIds.map((z) => [z, ZONE_LABELS[z]])];
    el.innerHTML = zones.map(([z, label]) => {
      const mini = z === "all"
        ? ""
        : `<span class="zone-mini">${shadeMini(S.shades[z])}</span>`;
      return `<button class="zone-tab ${S.zoneMode === z ? "active" : ""}" data-z="${z}">
        <span>${label}</span>${mini}</button>`;
    }).join("");
    el.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        S.zoneMode = b.dataset.z;
        if (MODE_3D && window.VIEWER3D && b.dataset.z !== "all") window.VIEWER3D.flashZone(b.dataset.z);
        renderZoneBar(); renderShades(); renderSpecs();
      }));
    const note = $("zoneNote");
    if (note) {
      note.textContent = S.zoneMode === "all"
        ? "Applies to front sides, rear sides and back window. Select the windshield separately — most windshield films are near-clear."
        : S.zoneMode === "windshield"
          ? "Windshield film is typically a near-clear heat-rejection layer (70%+ VLT). Darker shades are restricted in most states."
          : `Applying to the ${ZONE_LABELS[S.zoneMode].toLowerCase()} only. Tip: click any window on the car to select it.`;
    }
  }

  function renderSpecs() {
    let sh, warranty;
    if (S.space !== "vehicles") {
      sh = bSel().shade || bSeries().shades[0];
      warranty = bSeries().warranty;
      const cells = [
        [sh.vlt + "%", "VLT"],
        [sh.tser != null ? sh.tser + "%" : "—", "Heat Rejection"],
        [sh.glare != null ? sh.glare + "%" : "—", "Glare Reduction"],
        [sh.uv != null ? sh.uv + "%" : "—", "UV Reject"],
      ];
      $("specs").innerHTML = cells.map(([v, l]) =>
        `<div class="spec"><div class="val">${v}</div><div class="lbl">${l}</div></div>`).join("");
      $("specsNote").textContent = warranty || "";
      return;
    }
    const vlt = activeShadeVlt();
    sh = series().shades.find((s) => s.vlt === vlt) || series().shades[0];
    const cells = [
      [sh.vlt + "%", "VLT"],
      [sh.tser != null ? sh.tser + "%" : "—", "TSER"],
      [sh.ir != null ? sh.ir + "%" : "—", "IR Reject"],
      [sh.uv != null ? sh.uv + "%" : "—", "UV Reject"],
    ];
    $("specs").innerHTML = cells.map(([v, l]) =>
      `<div class="spec"><div class="val">${v}</div><div class="lbl">${l}</div></div>`).join("");
    $("specsNote").textContent = series().warranty || "";
  }

  // ---------- tint law ----------
  function renderLawSelect() {
    const opts = Object.entries(window.TINT_LAWS.states)
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([code, s]) => `<option value="${code}">${s.name}</option>`).join("");
    $("lawSelect").innerHTML = `<option value="">Select your state…</option>` + opts;
    $("lawSelect").addEventListener("change", () => { S.usState = $("lawSelect").value; renderLaw(); });
  }

  function windshieldRow(st) {
    const sel = S.shades.windshield;
    if (!sel) {
      return `<div class="law-row"><span class="pos">Windshield</span><span class="rule">${st.windshield}</span><span class="law-badge info">Info</span></div>`;
    }
    const stateForbids = /no tint/i.test(st.windshield); // e.g. MN, NJ: no windshield tint at all
    const nearClear = sel.vlt >= 70;
    let badge, rule;
    if (stateForbids) {
      badge = `<span class="law-badge bad">Not permitted</span>`;
      rule = `${st.windshield} — this state does not permit windshield film`;
    } else if (nearClear) {
      badge = `<span class="law-badge ok">Near-clear</span>`;
      rule = `${st.windshield} — clear film generally allowed, verify locally`;
    } else {
      badge = `<span class="law-badge bad">Restricted</span>`;
      rule = `${st.windshield} — shaded film not permitted in most states`;
    }
    return `<div class="law-row"><span class="pos">Windshield</span><span class="rule">${rule}</span>${badge}</div>`;
  }

  function renderLaw() {
    const box = $("lawRows");
    if (!box) return;
    if (!S.usState) { box.innerHTML = `<div class="law-note">Choose a state to check your selected shades against local tint law.</div>`; $("lawNote").textContent = ""; return; }
    const st = window.TINT_LAWS.states[S.usState];
    const vltOf = (z) => S.shades[z] ? S.shades[z].vlt : 100;
    const rows = [
      ["Front sides", st.front, vltOf("front")],
      ["Back sides", st.back, vltOf("rear")],
      ["Rear window", st.rear, vltOf("back")],
    ].map(([pos, rule, vlt]) => {
      const res = window.TINT_LAWS.check(rule, vlt);
      const badge = `<span class="law-badge ${res.ok ? "ok" : "bad"}">${res.ok ? "Legal" : res.badge}</span>`;
      return `<div class="law-row"><span class="pos">${pos}</span><span class="rule">${res.label}</span>${badge}</div>`;
    });
    rows.push(windshieldRow(st));
    box.innerHTML = rows.join("");
    $("lawNote").textContent = (st.note ? st.note + " " : "") + "Informational only — verify current law locally.";
  }

  // ---------- footer ----------
  $("disclaimer").textContent =
    "Visual renderings are for illustrative purposes only; actual appearance of windows treated with film will vary with vehicle, glass, and lighting. " +
    window.TINT_LAWS.meta.disclaimer + ` Tint-law data last reviewed ${window.TINT_LAWS.meta.lastReviewed}.`;

  // ---------- boot ----------
  const def = BRAND.defaultShade; // {seriesIdx, vlt, sku} optional
  if (def) {
    S.series = def.seriesIdx;
    ["front", "rear", "back"].forEach((z) => { S.shades[z] = { ...def }; });
  }
  const bootFleet = fleet3D();
  S.vehicle = MODE_3D && bootFleet.length ? bootFleet[0].id : "sedan";
  renderStageTools();
  renderVehicle();
  renderSeries();
  renderZoneBar();
  renderShades();
  renderSpecs();
  renderLawSelect();
  renderLaw();
})();
