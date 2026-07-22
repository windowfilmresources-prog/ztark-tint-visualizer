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
    const [photo, mask] = await Promise.all([loadImg(cfg.src), loadImg(cfg.mask)]);
    state.photo = photo;
    state.mask = mask;
    // offscreen buffer for the tinted-glass layer, in photo pixels
    state.glassLayer = document.createElement("canvas");
    state.glassLayer.width = photo.naturalWidth;
    state.glassLayer.height = photo.naturalHeight;
    state.loaded = true;
    draw();
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
    const iw = state.photo.naturalWidth, ih = state.photo.naturalHeight;
    // cover fit
    const sc = Math.max(W / iw, H / ih);
    const dw = iw * sc, dh = ih * sc, dx = (W - dw) / 2, dy = (H - dh) / 2;
    const v = state.cur; // 1 = bare, ->0 = film fully applied
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, W, H);
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
