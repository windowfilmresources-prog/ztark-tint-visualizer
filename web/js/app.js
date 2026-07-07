// Tint visualizer engine. Brand personality (theme vars, fonts, logo, products, copy)
// comes entirely from brands.js — this file is brand-agnostic.
// URL: index.html?brand=huper|autobahn|edge (default huper)

(function () {
  const qs = new URLSearchParams(location.search);
  const brandId = (qs.get("brand") || "huper").toLowerCase();
  const BRAND = window.BRANDS[brandId] || window.BRANDS.huper;

  // ---------- theme ----------
  const root = document.documentElement;
  Object.entries(BRAND.theme).forEach(([k, v]) => root.style.setProperty(k, v));
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
    vehicle: "sedan",
    paint: BRAND.defaultPaint || "#16181a",
    night: false,
    series: 0,                       // index into BRAND.products
    zoneMode: "all",                 // all | front | rear
    shades: { front: null, rear: null }, // {vlt, seriesIdx} or null = factory glass
    usState: "",
    comparing: false,
  };

  const PAINTS = [
    ["White",  "#e8eaec"], ["Silver", "#b7bcc2"], ["Gray", "#686d73"],
    ["Black",  "#1a1c1f"], ["Red",    "#8e1c24"], ["Blue", "#24406e"],
  ];

  // Perceptual-ish VLT → overlay opacity. Factory glass (no film) keeps a light haze.
  function tintOpacity(vlt) {
    if (vlt == null) return 0.06;
    return Math.min(0.94, 1 - Math.pow(vlt / 100, 0.62));
  }

  const $ = (id) => document.getElementById(id);

  // Renderer priority: 3D showroom → traced photos → vector art.
  // 3D can be abandoned at runtime (no WebGL, importmap unsupported, model failed).
  let MODE_3D = true;
  let PHOTO_MODE, FLEET;
  function computeModes() {
    PHOTO_MODE = !MODE_3D && !!(window.PHOTO_CARS && window.PHOTO_CARS.length);
    FLEET = PHOTO_MODE ? window.PHOTO_CARS : window.VEHICLES;
  }
  computeModes();

  function abandon3D() {
    if (!MODE_3D) return;
    MODE_3D = false;
    computeModes();
    S.vehicle = FLEET[0].id;
    $("vehTabs").parentElement.style.display = "";
    renderStageTools();
    renderVehicle();
    renderZoneTabs();
    renderShades();
  }
  document.addEventListener("viewer3d-unavailable", abandon3D);
  // if the viewer module never executed (importmap/module unsupported), fall back
  setTimeout(() => { if (MODE_3D && !window.VIEWER3D) abandon3D(); }, 4000);

  // ---------- stage / vehicle ----------
  function renderVehicle() {
    if (MODE_3D) {
      $("stage").innerHTML = `<div class="badge-vlt" id="vltBadge"></div>
        <div id="viewer3d"></div>
        <div class="stage-hint">Drag to rotate · Scroll to zoom</div>
        <div class="photo-credit" id="modelCredit"></div>`;
      const boot = () => {
        window.VIEWER3D.mount(document.getElementById("viewer3d"));
        window.VIEWER3D.setPaint(S.paint);
        const cr = document.getElementById("modelCredit");
        if (cr) { cr.textContent = window.VIEWER3D.credit || ""; cr.style.display = window.VIEWER3D.credit ? "" : "none"; }
        applyTint();
      };
      if (window.VIEWER3D) boot();
      else document.addEventListener("viewer3d-ready", boot, { once: true });
      document.addEventListener("viewer3d-car-loaded", () => {
        window.VIEWER3D.setPaint(S.paint);
        applyTint();
      }, { once: true });
      applyTint();
      return;
    }
    const v = FLEET.find((x) => x.id === S.vehicle) || FLEET[0];
    S.vehicle = v.id;
    if (PHOTO_MODE) {
      const polys = v.zones.map((z) =>
        `<polygon class="tint" data-zone="${z.zone}" points="${z.points}" fill="#000105"
           style="mix-blend-mode:multiply" opacity="0"/>`).join("");
      // The overlay is alpha-masked by the cutout itself, so tint can never bleed
      // past the car's silhouette onto the studio backdrop.
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

  function applyTint() {
    if (MODE_3D) {
      if (window.VIEWER3D && window.VIEWER3D.carReady) {
        const f = S.shades.front, r = S.shades.rear;
        window.VIEWER3D.setTint(
          S.comparing ? null : f ? f.vlt : null,
          S.comparing ? null : r ? r.vlt : null
        );
      }
    } else {
      const svg = $("stage").querySelector("svg");
      if (!svg) return;
      svg.querySelectorAll(".tint").forEach((p) => {
        const sel = S.shades[p.dataset.zone];
        const vlt = S.comparing ? null : sel ? sel.vlt : null;
        // Photos already show real factory glass — no baseline haze needed.
        const o = PHOTO_MODE && vlt == null ? 0 : tintOpacity(vlt);
        p.setAttribute("opacity", o.toFixed(3));
      });
    }
    const f = S.shades.front, r = S.shades.rear;
    const name = (s) => s ? `${s.sku ?? s.vlt}%` : "factory";
    $("vltBadge").textContent = S.comparing
      ? "Factory glass (comparing)"
      : `Front ${name(f)} · Rear ${name(r)}`;
    renderLaw();
    renderZoneCurrent();
  }

  // ---------- controls ----------
  function renderStageTools() {
    if (PHOTO_MODE) { // photo cars have fixed paint & lighting
      $("paints").parentElement.style.display = "none";
      $("dayNight").style.display = "none";
    }
    if (MODE_3D) { // one model, fixed white-showroom lighting; paint picker works
      $("vehTabs").parentElement.style.display = "none";
      $("dayNight").style.display = "none";
    }
    $("vehTabs").innerHTML = FLEET.map((v) =>
      `<button class="veh-btn ${v.id === S.vehicle ? "active" : ""}" data-v="${v.id}">${v.label}</button>`).join("");
    $("vehTabs").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => { S.vehicle = b.dataset.v; renderStageTools(); renderVehicle(); }));

    $("paints").innerHTML = PAINTS.map(([n, c]) =>
      `<div class="swatch ${c === S.paint ? "active" : ""}" title="${n}" data-c="${c}" style="background:${c}"></div>`).join("");
    $("paints").querySelectorAll(".swatch").forEach((s) =>
      s.addEventListener("click", () => {
        S.paint = s.dataset.c;
        renderStageTools();
        if (MODE_3D) { if (window.VIEWER3D) window.VIEWER3D.setPaint(S.paint); }
        else if (!PHOTO_MODE) $("stage").querySelector("svg").style.setProperty("--paint", S.paint);
      }));

    $("dayNight").className = `toggle-btn ${S.night ? "active" : ""}`;
    $("dayNight").textContent = S.night ? "☾ Night" : "☀ Day";
  }

  $("dayNight").addEventListener("click", () => {
    S.night = !S.night;
    $("stage").classList.toggle("night", S.night);
    renderStageTools();
  });

  const hold = $("holdCompare");
  const setCompare = (on) => { S.comparing = on; applyTint(); };
  ["mousedown", "touchstart"].forEach((e) => hold.addEventListener(e, (ev) => { ev.preventDefault(); setCompare(true); }));
  ["mouseup", "mouseleave", "touchend", "touchcancel", "blur"].forEach((e) => hold.addEventListener(e, () => setCompare(false)));

  // ---------- products ----------
  function series() { return BRAND.products[S.series]; }

  function renderSeries() {
    $("seriesTabs").innerHTML = BRAND.products.map((p, i) =>
      `<button class="series-tab ${i === S.series ? "active" : ""}" data-i="${i}">${p.name}</button>`).join("");
    $("seriesTabs").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => { S.series = +b.dataset.i; renderSeries(); renderShades(); renderSpecs(); }));
    $("seriesDesc").textContent = series().tagline || "";
    $("seriesTech").textContent = series().tech || "";
    $("seriesTech").style.display = series().tech ? "inline-block" : "none";
  }

  function activeShadeVlt() {
    const zone = S.zoneMode === "rear" ? "rear" : "front";
    const sel = S.shades[zone];
    return sel && sel.seriesIdx === S.series ? sel.vlt : null;
  }

  function renderShades() {
    const cur = activeShadeVlt();
    $("shadeChips").innerHTML = series().shades.map((s) => {
      const l = Math.round(14 + s.vlt * 0.72);
      return `<button class="shade-chip ${s.vlt === cur ? "active" : ""}" data-vlt="${s.vlt}" data-sku="${s.sku ?? s.vlt}">
        <div class="dot" style="--dot:hsl(208,10%,${l}%)"></div>
        <div class="pct">${s.sku ?? s.vlt}%</div><div class="sub">Shade</div>
      </button>`;
    }).join("");
    $("shadeChips").querySelectorAll(".shade-chip").forEach((b) =>
      b.addEventListener("click", () => {
        const sel = { vlt: +b.dataset.vlt, sku: +b.dataset.sku, seriesIdx: S.series };
        if (S.zoneMode === "all") { S.shades.front = { ...sel }; S.shades.rear = { ...sel }; }
        else S.shades[S.zoneMode] = sel;
        renderShades(); renderSpecs(); applyTint();
      }));
  }

  function renderZoneTabs() {
    const zones = [["all", "All windows"], ["front", "Front sides"], ["rear", "Rear only"]];
    $("zoneTabs").innerHTML = zones.map(([z, l]) =>
      `<button class="zone-tab ${S.zoneMode === z ? "active" : ""}" data-z="${z}">${l}</button>`).join("");
    $("zoneTabs").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => { S.zoneMode = b.dataset.z; renderZoneTabs(); renderShades(); }));
  }

  function shadeLabel(sel) {
    if (!sel) return "Factory glass (no film)";
    const p = BRAND.products[sel.seriesIdx];
    const note = sel.sku != null && sel.sku !== sel.vlt ? ` <span style="opacity:.7">(measures ${sel.vlt}% VLT)</span>` : "";
    return `<b>${p.name} ${sel.sku ?? sel.vlt}%</b>${note}`;
  }
  function renderZoneCurrent() {
    $("zoneCurrent").innerHTML =
      `Front sides: ${shadeLabel(S.shades.front)}<br>Rear: ${shadeLabel(S.shades.rear)}`;
  }

  function renderSpecs() {
    const vlt = activeShadeVlt() ?? (S.shades.front && S.shades.front.seriesIdx === S.series ? S.shades.front.vlt : null);
    const sh = series().shades.find((s) => s.vlt === vlt) || series().shades[0];
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

  function renderLaw() {
    const box = $("lawRows");
    if (!S.usState) { box.innerHTML = `<div class="law-note">Choose a state to check your selected shades against local tint law.</div>`; $("lawNote").textContent = ""; return; }
    const st = window.TINT_LAWS.states[S.usState];
    const fVlt = S.shades.front ? S.shades.front.vlt : 100;
    const rVlt = S.shades.rear ? S.shades.rear.vlt : 100;
    const rows = [
      ["Front sides", st.front, fVlt],
      ["Back sides", st.back, rVlt],
      ["Rear window", st.rear, rVlt],
    ].map(([pos, rule, vlt]) => {
      const res = window.TINT_LAWS.check(rule, vlt);
      const badge = `<span class="law-badge ${res.ok ? "ok" : "bad"}">${res.ok ? "Legal" : res.badge}</span>`;
      return `<div class="law-row"><span class="pos">${pos}</span><span class="rule">${res.label}</span>${badge}</div>`;
    });
    rows.push(`<div class="law-row"><span class="pos">Windshield</span><span class="rule">${st.windshield}</span><span class="law-badge info">Info</span></div>`);
    box.innerHTML = rows.join("");
    $("lawNote").textContent = (st.note ? st.note + " " : "") + "Informational only — verify current law locally.";
  }

  // ---------- footer ----------
  $("disclaimer").textContent =
    "Visual renderings are for illustrative purposes only; actual appearance of windows treated with film will vary with vehicle, glass, and lighting. " +
    window.TINT_LAWS.meta.disclaimer + ` Tint-law data last reviewed ${window.TINT_LAWS.meta.lastReviewed}.`;

  // ---------- boot ----------
  const def = BRAND.defaultShade; // {seriesIdx, vlt} optional
  if (def) { S.series = def.seriesIdx; S.shades.front = { ...def }; S.shades.rear = { ...def }; }
  renderStageTools();
  renderVehicle();
  renderSeries();
  renderZoneTabs();
  renderShades();
  renderSpecs();
  renderLawSelect();
  renderLaw();
})();
