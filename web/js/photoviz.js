// Photo mode for the architectural spaces: a real interior photograph with a
// hand-traced glass mask. The film darkens the view through the glass with the
// same transmission curve the 3D viewer uses, and the room light dims with the
// film's VLT — hold-to-compare snaps back to the bare-glass original.
window.PHOTOVIZ = (function () {
  const state = {
    el: null, canvas: null, ctx: null,
    photo: null, mask: null, glassLayer: null,
    film: null, loaded: false, credit: "",
    raf: 0, cur: 1, target: 1,   // animated transmission for a soft transition
  };

  function tintScalar(vlt) {
    if (vlt == null) return 1.0;
    return Math.pow(vlt / 100, 0.85); // same visual curve as the 3D glass
  }

  function mount(el) {
    if (state.el === el && state.canvas) return;
    state.el = el;
    el.innerHTML = "";
    const c = document.createElement("canvas");
    c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
    el.appendChild(c);
    state.canvas = c;
    state.ctx = c.getContext("2d");
    if (state.ro) state.ro.disconnect();
    state.ro = new ResizeObserver(() => { size(); draw(); });
    state.ro.observe(el);
    size();
    // ResizeObserver rides the rendering pipeline, which throttled webviews
    // may stall — retry sizing on plain timers until the layout lands
    [50, 250, 1000].forEach((ms) => setTimeout(() => {
      if (state.el === el && (state.canvas.width < 4 || state.canvas.height < 4)) { size(); draw(); }
    }, ms));
  }

  function size() {
    if (!state.el || !state.canvas) return;
    const r = state.el.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.canvas.width = Math.max(2, Math.round(r.width * dpr));
    state.canvas.height = Math.max(2, Math.round(r.height * dpr));
  }

  function loadImg(src) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
  }

  async function load(cfg) {
    state.loaded = false;
    state.credit = cfg.credit || "";
    if (cfg.tiers) {
      // properly-rendered tint: each tier is the scene rendered with the glass
      // actually carrying a film at that VLT (real transmission + relight).
      // For a selected film we crossfade the two bracketing tiers; the mask
      // adds only the film's warm tone / reflective sheen on top.
      const { prefix, ver } = cfg.tiers;
      const pad = (v) => String(v).padStart(3, "0");
      const vlts = cfg.tiers.vlts.slice().sort((a, b) => b - a); // 100 -> 12
      const imgs = await Promise.all(
        vlts.map((v) => loadImg(`${prefix}_v${pad(v)}.jpg?v=${ver}`)));
      state.tiers = vlts.map((v, i) => ({ vlt: v, img: imgs[i] }));
      state.mask = await loadImg(`${prefix}_mask.png?v=${ver}`);
      state.base = imgs[0]; state.mode = "tiers";
    } else if (cfg.stills) {
      // rendered trio: bright (bare glass, full sun) + filmed (strong film)
      // + glass mask. The room RELIGHTS by blending bright->filmed per VLT
      // (light is additive, so this is a physically sound relight); the glass
      // view then takes the film's tone/reflectivity through the mask.
      const [b, f, m] = await Promise.all([
        loadImg(cfg.stills.bright), loadImg(cfg.stills.filmed), loadImg(cfg.stills.mask)]);
      state.bright = b; state.filmed = f; state.mask = m;
      state.base = b; state.mode = "stills";
    } else {
      const [photo, mask] = await Promise.all([loadImg(cfg.src), loadImg(cfg.mask)]);
      state.photo = photo; state.mask = mask;
      state.base = photo; state.mode = "photo";
    }
    // offscreen buffer for the tinted-glass layer, in image pixels
    state.glassLayer = document.createElement("canvas");
    state.glassLayer.width = state.base.naturalWidth;
    state.glassLayer.height = state.base.naturalHeight;
    state.loaded = true;
    draw();
  }

  // paint the glass region (via mask) with a fill, composited onto the main
  // canvas with op ("multiply" for tone, "screen" for reflective sheen).
  function paintGlass(fill, op, dx, dy, dw, dh) {
    const g = state.glassLayer, x = g.getContext("2d");
    x.globalCompositeOperation = "source-over";
    x.clearRect(0, 0, g.width, g.height);
    x.fillStyle = fill;
    x.fillRect(0, 0, g.width, g.height);
    x.globalCompositeOperation = "destination-in";
    x.drawImage(state.mask, 0, 0, g.width, g.height);
    x.globalCompositeOperation = "source-over";
    state.ctx.globalCompositeOperation = op;
    state.ctx.drawImage(g, dx, dy, dw, dh);
    state.ctx.globalCompositeOperation = "source-over";
  }

  // rebuild the glass layer for the current film at transmission v (0..1 of
  // the film's own transmission — 1 means bare glass)
  function buildGlass(v) {
    const g = state.glassLayer, x = g.getContext("2d");
    x.clearRect(0, 0, g.width, g.height);
    x.globalCompositeOperation = "source-over";
    x.drawImage(state.photo, 0, 0);
    const film = state.film;
    const s = 1 + (tintScalar(film ? film.vlt : null) - 1) * v;
    let rC = Math.round(255 * s), gC = rC, bC = rC;
    if (film && film.tone === "warm") { gC = Math.round(gC * (1 - 0.16 * v)); bC = Math.round(bC * (1 - 0.36 * v)); }
    x.globalCompositeOperation = "multiply";
    x.fillStyle = `rgb(${rC},${gC},${bC})`;
    x.fillRect(0, 0, g.width, g.height);
    // reflective films read as a soft sheen on the glass
    const refl = film ? (film.refl || 0) / 100 : 0;
    if (refl > 0.05 && v < 1) {
      x.globalCompositeOperation = "screen";
      x.fillStyle = `rgba(235,240,248,${(refl * 0.16 * (1 - v)).toFixed(3)})`;
      x.fillRect(0, 0, g.width, g.height);
    }
    // keep only the glass region
    x.globalCompositeOperation = "destination-in";
    x.drawImage(state.mask, 0, 0, g.width, g.height);
    x.globalCompositeOperation = "source-over";
  }

  function draw() {
    if (!state.loaded || !state.canvas) return;
    if (state.canvas.width < 4 || state.canvas.height < 4) size();
    const ctx = state.ctx, W = state.canvas.width, H = state.canvas.height;
    const iw = state.base.naturalWidth, ih = state.base.naturalHeight;
    // cover fit
    const sc = Math.max(W / iw, H / ih);
    const dw = iw * sc, dh = ih * sc, dx = (W - dw) / 2, dy = (H - dh) / 2;
    const v = state.cur; // 1 = bare, ->0 = film fully applied
    const filmAmt = 1 - v;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);

    if (state.mode === "tiers") {
      // animate the effective VLT from bare (100) toward the film's VLT
      const filmVlt = state.film ? state.film.vlt : 100;
      const effVlt = 100 - (100 - filmVlt) * filmAmt;
      const T = state.tiers;                 // sorted 100 -> 12
      let hi = T[0], lo = T[T.length - 1];
      if (effVlt >= T[0].vlt) { hi = lo = T[0]; }
      else if (effVlt <= T[T.length - 1].vlt) { hi = lo = T[T.length - 1]; }
      else {
        for (let i = 0; i < T.length - 1; i++) {
          if (effVlt <= T[i].vlt && effVlt >= T[i + 1].vlt) { hi = T[i]; lo = T[i + 1]; break; }
        }
      }
      const span = hi.vlt - lo.vlt;
      const t = span > 0 ? (hi.vlt - effVlt) / span : 0;  // 0 at hi img, 1 at lo img
      ctx.globalAlpha = 1;
      ctx.drawImage(hi.img, dx, dy, dw, dh);
      if (t > 0.001 && lo !== hi) {
        ctx.globalAlpha = t;
        ctx.drawImage(lo.img, dx, dy, dw, dh);
        ctx.globalAlpha = 1;
      }
      // film character on the glass view: warm tone + reflective sheen (light
      // touch — the darkening/view is already properly rendered in the tiers)
      if (state.film && filmAmt > 0.001) {
        if (state.film.tone === "warm") {
          const gc = Math.round(255 * (1 - 0.12 * filmAmt));
          const bc = Math.round(255 * (1 - 0.26 * filmAmt));
          paintGlass(`rgb(255,${gc},${bc})`, "multiply", dx, dy, dw, dh);
        }
        const refl = (state.film.refl || 0) / 100;
        if (refl > 0.05) {
          paintGlass(`rgba(228,234,244,${(refl * 0.20 * filmAmt).toFixed(3)})`, "screen", dx, dy, dw, dh);
        }
      }
      return;
    }

    if (state.mode === "stills") {
      ctx.drawImage(state.bright, dx, dy, dw, dh);
      // relight: blend the filmed (strong-film) state over bright by the
      // film's VLT. filmed was rendered at the ~14% "floor", so a film of VLT
      // V reaches full filmed at V=14 and none at V=100.
      const vlt = state.film ? Math.max(0, Math.min(100, state.film.vlt)) : 100;
      const targetAlpha = Math.min(1, (1 - vlt / 100) / 0.86);
      const a = targetAlpha * filmAmt;
      if (a > 0.001) {
        ctx.globalAlpha = a;
        ctx.drawImage(state.filmed, dx, dy, dw, dh);
        ctx.globalAlpha = 1;
      }
      // film character on the glass view: warm tone + reflective sheen
      if (state.film && filmAmt > 0.001) {
        if (state.film.tone === "warm") {
          const gc = Math.round(255 * (1 - 0.18 * filmAmt));
          const bc = Math.round(255 * (1 - 0.40 * filmAmt));
          paintGlass(`rgb(255,${gc},${bc})`, "multiply", dx, dy, dw, dh);
        }
        const refl = (state.film.refl || 0) / 100;
        if (refl > 0.05) {
          paintGlass(`rgba(225,232,242,${(refl * 0.24 * filmAmt).toFixed(3)})`, "screen", dx, dy, dw, dh);
        }
      }
      return;
    }

    ctx.drawImage(state.photo, dx, dy, dw, dh);
    // the film changes the light in the room, not just the view: dim the
    // whole frame toward the film's transmission (floored so it never dies)
    const filmV = state.film ? Math.max(0, Math.min(1, state.film.vlt / 100)) : 1;
    const roomTarget = 0.62 + 0.38 * filmV;          // room light at full film
    const roomV = 1 - (1 - roomTarget) * (1 - v);    // blend by animation state
    if (roomV < 0.999) {
      const k = Math.round(255 * roomV);
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = `rgb(${k},${k},${k})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    }
    buildGlass(1 - v);
    ctx.drawImage(state.glassLayer, dx, dy, dw, dh);
  }

  // rAF can be throttled to nothing (hidden tabs, embedded webviews) — race
  // each frame against a timer so the transition always completes
  function nextFrame(fn) {
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(state.raf);
      clearTimeout(state.timer);
      fn();
    };
    state.raf = requestAnimationFrame(once);
    state.timer = setTimeout(once, 50);
  }

  function animate() {
    cancelAnimationFrame(state.raf);
    clearTimeout(state.timer);
    const step = () => {
      const d = state.target - state.cur;
      if (Math.abs(d) < 0.01) { state.cur = state.target; draw(); return; }
      state.cur += d * 0.22;
      draw();
      nextFrame(step);
    };
    nextFrame(step);
  }

  return {
    mount,
    load,
    setFilm(film) {
      state.film = film || null;
      state.target = film ? 0 : 1; // 0 = film fully applied
      if (!film) state.cur = Math.max(state.cur, 0.0); // animate back up too
      animate();
    },
    get active() { return !!state.loaded; },
    get _debug() { return { cur: state.cur, target: state.target, film: state.film, loaded: state.loaded }; },
    destroy() {
      if (state.ro) state.ro.disconnect();
      cancelAnimationFrame(state.raf);
      state.el = null; state.canvas = null; state.loaded = false;
    },
  };
})();
