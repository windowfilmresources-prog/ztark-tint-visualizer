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

  // engagement beacons → the locators /track collector (same origin in prod).
  // Fire-and-forget: staging/static hosts have no collector and that's fine.
  const TRACK_OK = !/onrender\.com|localhost|127\.0\.0\.1/.test(location.hostname);
  function track(type, detail, market) {
    if (!TRACK_OK || !navigator.sendBeacon) return;
    try {
      navigator.sendBeacon("/track", JSON.stringify({
        type, brand: brandId,
        detail: (detail || "").slice(0, 120) || undefined,
        market: market || undefined,
      }));
    } catch { /* never let analytics break the app */ }
  }

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
  // lead enrichment: carry the shopper's vehicle (from the savings card) on the
  // dealer link so downstream pages/forms can pick it up
  function updateDealerLink() {
    const base = BRAND.dealerUrl || "#";
    const v = S.sv && S.sv.vehicle;
    document.getElementById("dealerBtn").href =
      v ? base + (base.includes("?") ? "&" : "?") + "vehicle=" + encodeURIComponent(v) : base;
  }

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
      residential: { series: 0, shade: null, view: "exterior" },
      commercial: { series: 0, shade: null, view: "exterior" },
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

  // innerHTML rebuilds destroy keyboard focus; call before the rebuild, invoke
  // the returned fn after wiring to land focus on the now-active button
  function keepFocus(el) {
    const had = el && el.contains(document.activeElement);
    return () => {
      if (!had) return;
      const t = el.querySelector(".active") || el.querySelector("button");
      if (t) t.focus();
    };
  }

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
    $("stage").classList.remove("cine"); // reveal never played; chrome must show
    computeModes();
    if (S.space !== "vehicles") enterSpace("vehicles"); // buildings need 3D
    S.vehicle = FLEET2D[0].id;
    renderStageTools();
    renderVehicle();
    renderZoneBar();
    renderShades();
  }
  document.addEventListener("viewer3d-unavailable", (e) => {
    if (e.detail && e.detail.building) return; // diorama failed; the car showroom is fine
    abandon3D();
  });
  setTimeout(() => { if (MODE_3D && !window.VIEWER3D) abandon3D(); }, 8000);

  // ---------- stage / vehicle ----------
  function fleet3D() {
    return (window.VIEWER3D && window.VIEWER3D.fleet) || [];
  }

  // ---------- architectural (building) stage ----------
  function bSel() { return S.b[S.space]; }
  function bSeries() { return BCAT.products[bSel().series]; }

  function bShade() {
    const sel = bSel().shade;
    return sel && sel.seriesIdx === bSel().series ? sel : null;
  }

  function bFilm() {
    const sel = bShade();
    return sel ? { vlt: sel.vlt, refl: sel.refl || 0, tone: sel.tone || null } : null;
  }

  function renderBuilding() {
    const scene = BSCENES[S.space];
    $("stage").innerHTML = `<div class="badge-vlt" id="vltBadge"></div>
      <div id="viewer3d"></div>
      <div class="stage-hint" id="stageHint">${(bSel().view || "exterior") === "interior"
        ? "Interior view — pick a film to see the difference"
        : "Isometric view — switch to Interior to look out through the glass"}</div>
      <div class="photo-credit" id="modelCredit"></div>`;
    const boot = () => {
      if (S.space === "vehicles") return; // user already left the space
      const el = document.getElementById("viewer3d");
      if (!el || !window.VIEWER3D) return;
      window.VIEWER3D.mount(el);
      window.VIEWER3D.setBuildingView(bSel().view || "exterior");
      window.VIEWER3D.loadBuilding({ urls: [scene.glb], credit: scene.credit, isoDir: scene.isoDir });
      window.VIEWER3D.setBuildingFilm(bFilm());
    };
    const start = () => {
      if (window.VIEWER3D) boot();
      else document.addEventListener("viewer3d-ready", boot, { once: true });
    };
    // brand opener playing (?space= deep-link lands here at boot): hold the
    // GPU-heavy viewer boot until it dismisses, same as the vehicle path
    if (window.__INTRO_DONE) window.__INTRO_DONE.then(start);
    else start();
    renderBadge();
  }

  function updateBuildingFilm() {
    if (window.VIEWER3D) window.VIEWER3D.setBuildingFilm(S.comparing ? null : bFilm());
    renderBadge();
    renderBSavings();
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
        if (S.space !== "vehicles") return; // ?space= deep-link or user switched
                                            // to a building while we were queued
        const el = document.getElementById("viewer3d");
        if (!el) return;
        window.VIEWER3D.mount(el);
        if (wantReveal && !bootedOnce && window.VIEWER3D.armReveal) {
          window.VIEWER3D.armReveal();
          $("stage").classList.add("cine"); // stage chrome sits out the cinematic
        }
        if (window.VIEWER3D.isBuilding) {
          // a building space replaced the car in the scene — reload the car
          window.VIEWER3D.loadCar(S.vehicle);
        } else if (window.VIEWER3D.credit) {
          // car still loaded: no car-loaded event will fire — re-run its
          // listener so credit/tabs re-render
          document.dispatchEvent(new Event("viewer3d-car-loaded"));
        }
        window.VIEWER3D.setPaint(S.paint);
        wireStagePicking();
        applyTint();
      };
      const bootWhenReady = () => {
        if (window.VIEWER3D) boot();
        else document.addEventListener("viewer3d-ready", boot, { once: true });
      };
      const wantReveal = !!(BRAND.intro) && !qs.get("noreveal") &&
        !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      if (window.__INTRO_DONE) {
        // brand opener playing: hold the GPU-heavy viewer boot (context, PMREM,
        // shader compiles) until it dismisses; meanwhile warm the model bytes —
        // a plain fetch costs network only and makes the real load near-instant
        const warm = () => {
          const f = window.VIEWER3D && window.VIEWER3D.fleet && window.VIEWER3D.fleet[0];
          if (f && f.urls) fetch(f.urls[0]).catch(() => {});
        };
        if (window.VIEWER3D) warm();
        else document.addEventListener("viewer3d-ready", warm, { once: true });
        window.__INTRO_DONE.then(bootWhenReady);
      } else {
        bootWhenReady();
      }
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

  let bootedOnce = false;

  // every car load (including fleet swaps) re-applies paint, tint, and credit;
  // also (re)renders the vehicle tabs — the fleet isn't known until the module loads
  document.addEventListener("viewer3d-car-loaded", () => {
    if (!MODE_3D || !window.VIEWER3D) return;
    if (!bootedOnce) {
      bootedOnce = true;
      if (window.VIEWER3D.playReveal)
        window.VIEWER3D.playReveal().then(() => $("stage").classList.remove("cine"));
      else $("stage").classList.remove("cine");
    }
    const fleet = fleet3D();
    if (fleet.length && !fleet.some((f) => f.id === S.vehicle)) S.vehicle = fleet[0].id;
    renderStageTools();
    renderSavings(); // body style follows the staged vehicle until manually chosen
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
    if (S.space !== "vehicles") { updateBuildingFilm(); return; }
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
      if (S.comparing) { el.textContent = "Bare glass (comparing)"; return; }
      const sel = bShade();
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
    track("viz_space", space);
    const auto = space === "vehicles";
    // cards that only make sense for vehicles
    // the shade chips live in the same card as the zone bar — hide only the
    // vehicle-specific rows, never the card (or buildings lose the film picker)
    const zoneCard = $("zoneBar") && $("zoneBar").closest(".card");
    if ($("zoneBar")) $("zoneBar").style.display = auto ? "" : "none";
    if ($("zoneNote")) $("zoneNote").style.display = auto ? "" : "none";
    if (zoneCard) {
      const h2 = zoneCard.querySelector("h2");
      if (h2) h2.textContent = auto ? "Windows & Shade" : "Film Shade";
    }
    const lawCard = $("lawSelect") && $("lawSelect").closest(".card");
    if (lawCard) lawCard.style.display = auto ? "" : "none";
    if ($("savingsCard")) $("savingsCard").style.display = auto && BRAND.savings ? "" : "none";
    if ($("bsCard")) $("bsCard").style.display = !auto && BCAT ? "" : "none";
    syncBsInputs();
    const sub = $("heroSub");
    if (sub) sub.textContent = auto ? (BRAND.hero.sub || "") : (BCAT.heroSub || BRAND.hero.sub || "");
    const pt = $("pageTitle");
    if (pt && BRAND.pageTitle) pt.textContent = auto ? BRAND.pageTitle : "Architectural Film Viewer";
    $("disclaimer").textContent = auto ? VEHICLE_DISCLAIMER : BUILDING_DISCLAIMER;
    renderStageTools();
    renderVehicle();
    renderSeries();
    renderShades();
    renderSpecs();
  }

  function renderSpaceTabs() {
    let el = $("spaceTabs");
    if (!BCAT || !MODE_3D) { if (el) el.parentElement.style.display = "none"; return; }
    if (!el) {
      const group = document.createElement("div");
      group.className = "group";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "Space");
      group.innerHTML = `<span class="group-label" aria-hidden="true">Space</span><span id="spaceTabs" class="group"></span>`;
      const tools = document.querySelector(".stage-tools");
      tools.insertBefore(group, tools.firstChild);
      el = $("spaceTabs");
    }
    const spaces = [["vehicles", "Vehicles"], ["residential", "Residential"], ["commercial", "Commercial"]];
    const refocus = keepFocus(el);
    el.innerHTML = spaces.map(([id, label]) =>
      `<button class="veh-btn ${S.space === id ? "active" : ""}" aria-pressed="${S.space === id}" data-s="${id}">${label}</button>`).join("");
    el.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => enterSpace(b.dataset.s)));
    refocus();
  }

  function renderViewTabs(show) {
    let el = $("viewTabs");
    if (!show) { if (el) el.parentElement.style.display = "none"; return; }
    if (!el) {
      const group = document.createElement("div");
      group.className = "group";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "View");
      group.innerHTML = `<span class="group-label" aria-hidden="true">View</span><span id="viewTabs" class="group"></span>`;
      const spaceGroup = $("spaceTabs").parentElement;
      spaceGroup.parentElement.insertBefore(group, spaceGroup.nextSibling);
      el = $("viewTabs");
    }
    el.parentElement.style.display = "";
    const cur = bSel().view || "exterior";
    const refocus = keepFocus(el);
    el.innerHTML = [["exterior", "Exterior"], ["interior", "Interior"]].map(([id, label]) =>
      `<button class="veh-btn ${cur === id ? "active" : ""}" aria-pressed="${cur === id}" data-view="${id}">${label}</button>`).join("");
    el.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        bSel().view = b.dataset.view;
        if (window.VIEWER3D) window.VIEWER3D.setBuildingView(b.dataset.view);
        const hint = $("stageHint");
        if (hint) hint.textContent = b.dataset.view === "interior"
          ? "Interior view — pick a film to see the difference"
          : "Isometric view — switch to Interior to look out through the glass";
        renderViewTabs(true);
      }));
    refocus();
  }

  // ---------- stage tools ----------
  function renderStageTools() {
    renderSpaceTabs();
    const building = S.space !== "vehicles";
    $("vehTabs").parentElement.style.display = building ? "none" : "";
    $("paints").parentElement.style.display = building ? "none" : "";
    $("holdCompare").style.display = ""; // hold-to-compare works in every space
    renderViewTabs(building);
    if (building) return;
    const fleet = MODE_3D ? fleet3D() : FLEET2D;
    const tabs = $("vehTabs");
    const carOverride = !!qs.get("car"); // ?car= lab/proc previews aren't part of the fleet
    if (MODE_3D && (fleet.length < 2 || carOverride)) {
      tabs.parentElement.style.display = "none";
    } else {
      tabs.parentElement.style.display = "";
      const refocusVeh = keepFocus(tabs);
      tabs.innerHTML = fleet.map((v) =>
        `<button class="veh-btn ${v.id === S.vehicle ? "active" : ""}" aria-pressed="${v.id === S.vehicle}" data-v="${v.id}">${v.label}</button>`).join("");
      tabs.querySelectorAll("button").forEach((b) =>
        b.addEventListener("click", () => {
          if (b.dataset.v === S.vehicle) return; // already showing this vehicle
          S.vehicle = b.dataset.v;
          if (MODE_3D) { window.VIEWER3D.loadCar(S.vehicle); renderStageTools(); }
          else { renderStageTools(); renderVehicle(); }
        }));
      refocusVeh();
    }

    $("paints").parentElement.style.display = PHOTO_MODE ? "none" : "";
    $("paints").innerHTML = PAINTS.map(([n, c]) =>
      `<button type="button" class="swatch ${c === S.paint ? "active" : ""}" aria-pressed="${c === S.paint}" title="${n}" aria-label="Paint: ${n}" data-c="${c}" style="background:${c}"></button>`).join("");
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
    const refocus = keepFocus($("seriesTabs"));
    $("seriesTabs").innerHTML = products.map((p, i) =>
      `<button class="series-tab ${i === active ? "active" : ""}" aria-pressed="${i === active}" data-i="${i}">${p.name}</button>`).join("");
    $("seriesTabs").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        if (building) bSel().series = +b.dataset.i;
        else S.series = +b.dataset.i;
        renderSeries(); renderShades(); renderSpecs();
        if (building) updateBuildingFilm(); // stale-series shade no longer applies
      }));
    refocus();
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
    const refocus = keepFocus($("shadeChips"));
    $("shadeChips").innerHTML =
      `<button class="shade-chip factory ${!anySet ? "active" : ""}" aria-pressed="${!anySet}" data-factory="1">
        <div class="dot" style="--dot:hsl(205,15%,88%)"></div>
        <div class="pct">—</div><div class="sub">Factory</div>
      </button>` +
      series().shades.map((s) => {
        const l = Math.round(14 + s.vlt * 0.72);
        return `<button class="shade-chip ${s.vlt === cur ? "active" : ""}" aria-pressed="${s.vlt === cur}" data-vlt="${s.vlt}" data-sku="${s.sku ?? s.vlt}">
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
          track("viz_shade", `vehicles: ${series().name} ${sel.sku}`, S.usState);
        }
        renderShades(); renderSpecs(); applyTint();
      }));
    refocus();
  }

  function renderBuildingShades() {
    const b = bSel();
    const cur = bShade();
    const refocus = keepFocus($("shadeChips"));
    $("shadeChips").innerHTML =
      `<button class="shade-chip factory ${!cur ? "active" : ""}" aria-pressed="${!cur}" data-factory="1">
        <div class="dot" style="--dot:hsl(205,15%,88%)"></div>
        <div class="pct">—</div><div class="sub">Bare</div>
      </button>` +
      bSeries().shades.map((s, i) => {
        const l = Math.round(14 + s.vlt * 0.72);
        return `<button class="shade-chip ${cur && cur.vlt === s.vlt && cur.sku === s.sku ? "active" : ""}" aria-pressed="${!!(cur && cur.vlt === s.vlt && cur.sku === s.sku)}" data-i="${i}">
          <div class="dot" style="--dot:hsl(${s.tone === "warm" ? "28,30%" : "208,10%"},${l}%)"></div>
          <div class="pct">${s.sku}%</div><div class="sub">${s.name ? "Film" : "Shade"}</div>
        </button>`;
      }).join("");
    $("shadeChips").querySelectorAll(".shade-chip").forEach((btn) =>
      btn.addEventListener("click", () => {
        b.shade = btn.dataset.factory ? null : { ...bSeries().shades[+btn.dataset.i], seriesIdx: b.series };
        if (b.shade) track("viz_shade", `${S.space}: ${bSeries().name} ${b.shade.sku}`, S.bs && S.bs.usState);
        renderBuildingShades(); renderSpecs(); updateBuildingFilm();
      }));
    refocus();
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
    const refocus = keepFocus(el);
    el.innerHTML = zones.map(([z, label]) => {
      const mini = z === "all"
        ? ""
        : `<span class="zone-mini">${shadeMini(S.shades[z])}</span>`;
      return `<button class="zone-tab ${S.zoneMode === z ? "active" : ""}" aria-pressed="${S.zoneMode === z}" data-z="${z}">
        <span>${label}</span>${mini}</button>`;
    }).join("");
    el.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        S.zoneMode = b.dataset.z;
        if (MODE_3D && window.VIEWER3D && b.dataset.z !== "all") window.VIEWER3D.flashZone(b.dataset.z);
        renderZoneBar(); renderShades(); renderSpecs();
      }));
    refocus();
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
      sh = bShade() || bSeries().shades[0];
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
    renderSavings();
  }

  // ---------- fuel & energy savings ----------
  function activeShadeSpec() {
    const vlt = activeShadeVlt();
    return series().shades.find((s) => s.vlt === vlt) || series().shades[0];
  }

  // the 3D fleet's staged vehicle seeds the calculator's body style
  function stagedBodyStyle() {
    const id = (S.vehicle || "").toLowerCase();
    if (id.includes("truck")) return "truck";
    if (id.includes("suv")) return "suv";
    return "sedan";
  }

  function setupSavings() {
    if (!BRAND.savings || !window.SAVINGS || !$("savingsCard")) return;
    $("savingsCard").hidden = false;
    S.sv = { on: false, mode: "gas", body: stagedBodyStyle(), miles: 13500, price: null }; // price null = mode default
    const bodySeg = $("svBody2");
    bodySeg.innerHTML = Object.entries(window.SAVINGS.BODY).map(([id, b]) =>
      `<button data-b="${id}" class="${id === S.sv.body ? "on" : ""}">${b.label}</button>`).join("");
    bodySeg.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        S.sv.body = b.dataset.b;
        S.sv.bodyTouched = true; // user's explicit choice wins over the staged vehicle
        bodySeg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        renderSavings();
      }));
    $("svVehicle").addEventListener("input", () => {
      S.sv.vehicle = $("svVehicle").value.trim();
      updateDealerLink();
    });
    $("svToggle").addEventListener("click", () => {
      S.sv.on = !S.sv.on;
      if (S.sv.on) track("viz_savings", "vehicles", S.usState);
      $("svToggle").setAttribute("aria-checked", String(S.sv.on));
      $("svBody").hidden = !S.sv.on;
      renderSavings();
    });
    $("svMode").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        S.sv.mode = b.dataset.m;
        S.sv.price = null; // fall back to the new mode's default price
        $("svMode").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        const ev = S.sv.mode === "ev";
        $("svPriceField").firstChild.textContent = ev ? "Electricity $ / kWh" : "Fuel $ / gal";
        $("svPrice").value = ev ? window.SAVINGS.DEFAULT_KWH_PRICE : window.SAVINGS.DEFAULT_GAS_PRICE;
        $("svPrice").step = ev ? "0.01" : "0.05";
        renderSavings();
      }));
    $("svMiles").addEventListener("input", () => { S.sv.miles = +$("svMiles").value || 13500; renderSavings(); });
    $("svPrice").addEventListener("input", () => { S.sv.price = +$("svPrice").value || null; renderSavings(); });
  }

  function renderSavings() {
    if (!BRAND.savings || !window.SAVINGS || !S.sv || !S.sv.on) return;
    if (S.space !== "vehicles") return;
    const sh = activeShadeSpec();
    // follow the staged vehicle until the user picks a body style themselves
    if (!S.sv.bodyTouched) {
      const auto = stagedBodyStyle();
      if (auto !== S.sv.body) {
        S.sv.body = auto;
        $("svBody2").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.b === auto));
      }
    }
    const r = window.SAVINGS.compute({
      tser: sh.tser, mode: S.sv.mode, body: S.sv.body, miles: S.sv.miles,
      price: S.sv.price, usState: S.usState || null,
    });
    $("svResults").innerHTML = r.tiles.map(([v, l]) =>
      `<div class="spec"><div class="val">${v}</div><div class="lbl">${l}</div></div>`).join("");
    $("svNote").innerHTML = r.note;
  }

  // ---------- cooling cost savings (buildings) ----------
  function setupBSavings() {
    if (!window.BSAVINGS || !BCAT || !$("bsCard")) return;
    $("bsCard").hidden = false;
    $("bsCard").style.display = "none"; // vehicles space at boot; enterSpace reveals
    S.bs = { on: false, zip: "", usState: null, sqft: {}, cost: {} };
    const sel = $("bsState");
    sel.innerHTML = `<option value="">Select your state…</option>` +
      Object.entries(window.BSAVINGS.STATES)
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(([code, s]) => `<option value="${code}">${s.name}</option>`).join("");
    $("bsToggle").addEventListener("click", () => {
      S.bs.on = !S.bs.on;
      if (S.bs.on) track("viz_savings", S.space, S.bs.usState);
      $("bsToggle").setAttribute("aria-checked", String(S.bs.on));
      $("bsBody").hidden = !S.bs.on;
      renderBSavings();
    });
    $("bsZip").addEventListener("input", () => {
      S.bs.zip = $("bsZip").value;
      const st = window.BSAVINGS.zipToState(S.bs.zip);
      if (st) { S.bs.usState = st; sel.value = st; }
      renderBSavings();
    });
    sel.addEventListener("change", () => {
      S.bs.usState = sel.value || null;
      if (S.bs.usState) track("viz_savings", S.space + " state", S.bs.usState);
      renderBSavings();
    });
    $("bsSqft").addEventListener("input", () => { S.bs.sqft[S.space] = +$("bsSqft").value || null; renderBSavings(); });
    $("bsCost").addEventListener("input", () => { S.bs.cost[S.space] = +$("bsCost").value || null; renderBSavings(); });
    syncBsInputs();
  }

  // reflect the current space's defaults into the inputs (user edits win)
  function syncBsInputs() {
    if (!S.bs || !$("bsSqft") || S.space === "vehicles") return;
    const d = window.BSAVINGS.defaults(S.space);
    $("bsSqft").value = S.bs.sqft[S.space] ?? d.sqft;
    $("bsCost").value = S.bs.cost[S.space] ?? d.cost;
    renderBSavings();
  }

  function renderBSavings() {
    if (!S.bs || !S.bs.on || S.space === "vehicles" || !window.BSAVINGS) return;
    const sh = bShade();
    if (!sh) {
      $("bsResults").innerHTML =
        `<div class="sv-note">Pick a film shade above to see what it saves.</div>`;
      $("bsNote").innerHTML = "";
      return;
    }
    const d = window.BSAVINGS.defaults(S.space);
    const r = window.BSAVINGS.compute({
      sqft: S.bs.sqft[S.space] ?? d.sqft,
      tser: sh.tser,
      usState: S.bs.usState,
      commercial: S.space === "commercial",
      costPerSqft: S.bs.cost[S.space] ?? d.cost,
    });
    $("bsResults").innerHTML = r.tiles.map(([v, l]) =>
      `<div class="spec"><div class="val">${v}</div><div class="lbl">${l}</div></div>`).join("");
    $("bsNote").innerHTML = r.note;
  }

  // ---------- tint law ----------
  function renderLawSelect() {
    const opts = Object.entries(window.TINT_LAWS.states)
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([code, s]) => `<option value="${code}">${s.name}</option>`).join("");
    $("lawSelect").innerHTML = `<option value="">Select your state…</option>` + opts;
    $("lawSelect").addEventListener("change", () => { S.usState = $("lawSelect").value; renderLaw(); renderSavings(); });
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
  const VEHICLE_DISCLAIMER =
    "Visual renderings are for illustrative purposes only; actual appearance of windows treated with film will vary with vehicle, glass, and lighting. " +
    window.TINT_LAWS.meta.disclaimer + ` Tint-law data last reviewed ${window.TINT_LAWS.meta.lastReviewed}.`;
  const BUILDING_DISCLAIMER =
    "Visual renderings are concept illustrations for demonstration only — not your building. Actual film appearance and performance vary with glass type, orientation, and installation; confirm specifications with your dealer.";
  $("disclaimer").textContent = VEHICLE_DISCLAIMER;

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
  setupSavings();
  setupBSavings();
  track("viz_view", brandId);
  document.getElementById("dealerBtn").addEventListener("click", () =>
    track("viz_dealer_click", S.space, (S.bs && S.bs.usState) || S.usState));
  renderSpecs();
  renderLawSelect();
  renderLaw();
})();
