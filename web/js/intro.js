// Animated brand opener — "the pull". Every tint customer has watched an
// installer squeegee film across glass: raw glare on one side of the edge,
// calm clear glass on the other. The opener IS that stroke. It opens on
// unfiltered light, a film edge pulls across the screen, and the brand mark
// is revealed crisp behind it; the exit pulls the pane away to hand off to
// the app. Each brand plays the same stroke in its own language:
//   down    (Hüper)    heat shimmer + warm glare, film pulled down the pane
//   forward (Autobahn) a night-highway rush (WebGL): light streaks tear out of
//                      the vanishing point, the official lockup rushes in under
//                      zoom blur and lands hard; exits on the diagonal line.
//                      No WebGL: a hot diagonal line reveals the lockup instead
//   cut     (Edge)     cold glare; the navy strike-line is the blade — it cuts
//                      across, the mark opens out of it, and it contracts into
//                      the logo's own strike
// Config-driven from BRANDS[brand].intro; plays every load (masks the stage
// load); skip on any input; ?introDebug=<ms> freezes for review (values past
// the exit point freeze the exit too); ?nointro=1 off.
(function () {
  var qs = new URLSearchParams(location.search);
  var brandId = (qs.get("brand") || "huper").toLowerCase();
  var BRAND = (window.BRANDS && window.BRANDS[brandId]) || null;
  var cfg = BRAND && BRAND.intro;
  if (!cfg || qs.get("nointro")) return;

  var resolveDone;
  window.__INTRO_DONE = new Promise(function (r) { resolveDone = r; });

  var debugT = qs.get("introDebug");
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var pull = cfg.pull || (cfg.kind === "strike" ? "cut" : "down");
  var bg = cfg.bg || "#0a0a0b";
  var fg = cfg.fg || "#fff";
  var dim = cfg.dim || "rgba(255,255,255,.35)";
  var accent = cfg.accent || "#a91e22";
  var font = cfg.font || "sans-serif";
  var dark = pull === "forward";

  // ---------------------------------------------------------------- timeline
  // (seconds) one place to tune the whole choreography per pull style
  var T = {
    down:    { pull: 0.30, pullDur: 0.95, rule: 1.02, sub: 1.12, glint: 1.72, exit: 2.55, exitDur: 0.62 },
    forward: { pull: 0.28, pullDur: 0.60, rule: 0.90, sub: 1.00, glint: 1.30, exit: 2.50, exitDur: 0.55 },
    cut:     { blade: 0.14, bladeDur: 0.46, pull: 0.50, pullDur: 0.68, land: 0.98, landDur: 0.52,
               sub: 1.30, glint: 1.80, exit: 2.55, exitDur: 0.55 },
  }[pull];

  // ---------------------------------------------------------------- glass
  // Hüper: the mark is already there; brand-tinted "liquid glass"
  // crosses it at an angle — the mark seen through it refracts (magnified,
  // softened, tinted) — then the mark shimmers. Hüper is a quick diagonal band
  // (a flash of green). (Autobahn tried a red slab: wrong for the brand.)
  // No backdrop-filter (that's what makes glass UI laggy): the slab carries its
  // own pre-filtered copy of the mark that counter-slides to stay aligned, so
  // the refraction is a static raster the GPU only has to move.
  var GLASS = {
    // tint = the body (clear-ish centre); edge = thick-glass colour pooling at
    // the rim; rim = lit top edge + hairline + inner bottom shade; spec = the
    // curved top-left highlight; mag = lens magnification of the mark beneath
    // Hüper: a band, not a slab — wide full-bleed liquid glass at the old heat
    // wash's diagonal, mirrored (15° off level, high on the left), swept down
    // across the mark fast: one flash of Hüper green with lit squeegee edges.
    huper: {
      band: true, ang: 15, at: 0.42, dur: 0.46, ease: "cubic-bezier(.32,.66,.68,.34)", radius: 0, hMul: 3.1, mag: 1.12,
      tint: "linear-gradient(180deg,rgba(118,182,50,.86),rgba(141,201,72,.66) 46%,rgba(104,168,40,.88))",
      edge: "inset 0 0 24px rgba(60,118,14,.62)",
      rim: "inset 0 2px 0 rgba(255,255,255,.9),inset 0 -2.5px 0 rgba(255,255,255,.98),inset 0 -9px 14px -6px rgba(255,255,255,.75)",
      drop: "0 0 34px 4px rgba(129,189,65,.5),0 26px 60px -22px rgba(52,96,16,.6)",
      refract: "blur(1.2px) saturate(1.7) brightness(1.08)",
      spec: 0.0, sheenBg: "linear-gradient(180deg,rgba(255,255,255,.34) 0%,rgba(255,255,255,0) 22%,rgba(255,255,255,0) 70%,rgba(255,255,255,.42) 100%)",
    },
  };
  var glass = cfg.glass === false ? null : (GLASS[brandId] || null);
  if (glass) {
    var gEnd = glass.at + glass.dur;
    T = {
      glint: gEnd - 0.14,            // shimmer chases the glass off the mark
      rule: gEnd + 0.04, sub: gEnd + 0.18,
      exit: gEnd + 1.3, exitDur: pull === "forward" ? 0.55 : 0.62,
    };
  }

  // ---------------------------------------------------------------- speed
  // Autobahn: no limits. Black, then the night highway tears past — road and
  // street lights stretch into streaks rushing out of the vanishing point,
  // longer and faster as we accelerate (white, with red taillights and amber
  // sodium), the edges close in like tunnel vision, the frame shivers. The
  // mark rushes at us out of the vanishing point under heavy zoom blur and a
  // touch of colour split, then lands hard with a little overshoot as we
  // brake; the streaks die, a soft flash marks the arrival. WebGL: the
  // streak field is procedural (angular bins, perspective-accelerated heads);
  // the mark renders to a target and is zoom-blurred in the composite. The
  // settled frame is the DOM lockup pixel-for-pixel, so the canvas hands off
  // invisibly and releases its GPU context before the 3D viewer boots.
  var S_T = {
    accel: [0.1, 0.86], brake: [0.86, 1.2],
    zoom: 0.76, zoomDur: 0.44, flash: 1.0,
    handoff: 1.42,
  };
  function bezier(x1, y1, x2, y2) {
    // cubic-bezier(x1,y1,x2,y2) as CSS evaluates it: solve x(t)=p, return y(t)
    function c(a1, a2, t) { return ((1 - 3 * a2 + 3 * a1) * t + (3 * a2 - 6 * a1)) * t * t + 3 * a1 * t; }
    return function (p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      var lo = 0, hi = 1, t = p;
      for (var i = 0; i < 24; i++) { var x = c(x1, x2, t); if (x < p) lo = t; else hi = t; t = (lo + hi) / 2; }
      return c(y1, y2, t);
    };
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  // speed 0..1 over time: creep, floor it, brake hard on arrival
  function velocity(t) {
    if (t < S_T.accel[0]) return 0.06;
    if (t < S_T.accel[1]) { var p = (t - S_T.accel[0]) / (S_T.accel[1] - S_T.accel[0]); return 0.06 + 0.94 * p * p; }
    if (t < S_T.brake[1]) { var q = (t - S_T.brake[0]) / (S_T.brake[1] - S_T.brake[0]); return (1 - q) * (1 - q) * (1 - q); }
    return 0;
  }
  // distance travelled (integral of velocity), tabulated once
  var TRAVEL = (function () {
    var out = [0], d = 0;
    for (var i = 1; i <= 2000; i++) { d += velocity(i / 1000) / 1000; out.push(d); }
    return out;
  })();
  function travel(t) { var i = Math.max(0, Math.min(2000, Math.round(t * 1000))); return TRAVEL[i]; }

  function makeSpeed(cv, bgHex) {
    var gl = null;
    try {
      gl = cv.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    } catch (e) {}
    if (!gl) return null;

    var VS_FULL = "attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}";
    var VS_QUAD = "attribute vec2 q;uniform vec4 uRect;uniform vec2 uRes;varying vec2 vuv;" +
      "void main(){vec2 px=uRect.xy+q*uRect.zw;vuv=q;vec2 n=px/uRes*2.-1.;gl_Position=vec4(n.x,-n.y,0.,1.);}";
    var FS_QUAD = "precision highp float;uniform sampler2D uTex;uniform float uA;varying vec2 vuv;" +
      "void main(){gl_FragColor=texture2D(uTex,vuv)*uA;}";
    var FS_COMP = "precision highp float;varying vec2 uv;uniform sampler2D uA;" +
      "uniform vec2 uRes;uniform vec2 uVP;uniform float uD;uniform float uV;uniform float uK;" +
      "uniform float uBlur;uniform float uCA;uniform float uFlash;uniform float uVig;" +
      "float h(float n){return fract(sin(n*12.9898)*43758.5453);}" +
      // the highway: light streaks in angular bins, heads accelerating outward
      "vec3 streaks(vec2 px){vec2 d=px-uVP;float r=length(d);float a=atan(d.y,d.x);float R=length(uRes)*.5;vec3 col=vec3(0.);" +
      "for(int L=0;L<3;L++){float fl=float(L);float N=fl<.5?84.:fl<1.5?150.:240.;" +
      "float fa=(a/6.28318+.5)*N+fl*.37;float bi=floor(fa);float fw=fract(fa)-.5;" +
      "float s1=h(bi+fl*101.),s2=h(bi*1.7+3.1+fl*57.),s3=h(bi*2.3+9.7+fl*13.),s4=h(bi*3.1+1.3+fl*7.);" +
      "float ac=((bi+.5)/N-.5)*6.28318;if(s4>mix(.3,.95,smoothstep(-.7,.35,sin(ac))))continue;" +   // fewer up into the sky
      "float head=fract(s1+uD*(.55+.9*s2)*(1.+fl*.3));float hr=pow(head,2.3)*R*1.3;" +
      "float len=hr*(.05+.7*uV)+2.;float t=(hr-r)/len;" +
      "float along=step(0.,t)*(1.-smoothstep(0.,1.,t))*smoothstep(.02,.18,head);" +
      "float wpx=(.45+1.2*s3)*(.35+hr/R*1.6);float across=1.-smoothstep(0.,wpx,abs(fw)*6.28318/N*r);" +
      "vec3 c=s2<.68?vec3(.86,.9,1.):s2<.87?vec3(1.,.14,.08):vec3(1.,.6,.2);" +
      "col+=c*along*across*(.35+.75*s3);}" +
      "return col*uK;}" +
      "void main(){vec2 px=vec2(uv.x,1.-uv.y)*uRes;vec2 vp=vec2(uVP.x,uRes.y-uVP.y)/uRes;vec3 c;" +
      // the mark, zoom-blurred toward the vanishing point with a hint of colour split
      "if(uBlur>.002){vec3 acc=vec3(0.);for(int i=0;i<18;i++){float k=float(i)/17.;float s=1.-uBlur*k;" +
      "acc.r+=texture2D(uA,vp+(uv-vp)*s*(1.+uCA)).r;acc.g+=texture2D(uA,vp+(uv-vp)*s).g;" +
      "acc.b+=texture2D(uA,vp+(uv-vp)*s*(1.-uCA)).b;}c=acc/18.;}else c=texture2D(uA,uv).rgb;" +
      "vec3 bgc=texture2D(uA,vec2(.002,.002)).rgb;float cover=clamp(length(c-bgc)*2.5,0.,1.);" +   // the lights pass BEHIND the mark
      "c+=streaks(px)*(1.-cover*.9);" +
      "float rr=length((px-uVP)/length(uRes));" +
      "c+=vec3(1.,.9,.86)*uFlash*exp(-rr*rr*9.);" +
      "c*=1.-uVig*smoothstep(.18,.62,rr);" +
      "gl_FragColor=vec4(c,1.);}";

    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    function prog(vs, fs, attrs) {
      var p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      attrs.forEach(function (a, i) { gl.bindAttribLocation(p, i, a); });
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      var cache = {};
      return { p: p, u: function (n) { return n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(p, n)); } };
    }
    var P;
    try {
      P = { quad: prog(VS_QUAD, FS_QUAD, ["q"]), comp: prog(VS_FULL, FS_COMP, ["p"]) };
    } catch (e) {
      if (window.console) console.warn("intro: speed fx off, falling back —", e && e.message);
      return null;
    }

    var tri = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tri);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var unit = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, unit);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);

    function tex(w, h, src) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (src) {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      return t;
    }
    function fbo(w, h) {
      var t = tex(w, h, null), f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return { t: t, f: f, w: w, h: h };
    }

    var bg = [parseInt(bgHex.slice(1, 3), 16) / 255, parseInt(bgHex.slice(3, 5), 16) / 255, parseInt(bgHex.slice(5, 7), 16) / 255];
    var zoomEase = bezier(0.16, 1.1, 0.3, 1); // rush in, overshoot a hair, land

    var A = null, parts = [], dpr = 1, Wc = 0, Hc = 0, vp = [0, 0];
    var raf = 0, t0 = 0, lastT = 0, dead = false;

    function layout(set, mw) {
      Wc = set.clientWidth; Hc = set.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      cv.width = Math.round(Wc * dpr); cv.height = Math.round(Hc * dpr);
      if (A) { gl.deleteTexture(A.t); gl.deleteFramebuffer(A.f); }
      A = fbo(cv.width, cv.height);
      var lk = mw.offsetParent, mx = lk.offsetLeft + mw.offsetLeft, my = lk.offsetTop + mw.offsetTop;
      var k = mw.offsetWidth / PARTS.w;
      vp = [mx + mw.offsetWidth / 2, my + mw.offsetHeight / 2];   // the mark's centre is the horizon
      parts.forEach(function (q) { gl.deleteTexture(q.tex); });
      var imgs = mw.querySelectorAll("img");
      // each layer pre-scaled by the browser to its on-screen size (crisp, no NPOT mip issue)
      var raster = function (img, w, h) {
        var c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
        var x = c.getContext("2d");
        x.imageSmoothingQuality = "high";
        x.drawImage(img, 0, 0, c.width, c.height);
        return tex(0, 0, c);
      };
      var ii = 0;
      parts = PARTS.parts.map(function (q) {
        if (q.smear) ii++; // markup order per stripe: smear, then sharp — the zoom blur is the motion here
        var o = { rect: [mx + q.x * k, my + q.y * k, q.w * k, q.h * k] };
        o.tex = raster(imgs[ii++], o.rect[2], o.rect[3]);
        return o;
      });
    }

    function render(t) {
      lastT = t;
      var v = velocity(t);
      var zp = clamp01((t - S_T.zoom) / S_T.zoomDur);
      var sc = 0.1 + 0.9 * zoomEase(zp);
      var la = clamp01(zp / 0.3);
      var blur = zp <= 0 ? 0 : 0.5 * Math.pow(1 - clamp01(zp / 0.85), 2);
      var streakK = clamp01((t - 0.06) / 0.2) * (1 - clamp01((t - S_T.brake[0] - 0.04) / 0.32));
      var fl = t < S_T.flash ? 0 : 0.2 * Math.exp(-(t - S_T.flash) / 0.12);
      // a high-speed shiver of the horizon
      var sh = v * 1.4;
      var vx = vp[0] + sh * (Math.sin(t * 91) + 0.5 * Math.sin(t * 157)), vy = vp[1] + sh * (Math.sin(t * 113 + 1) + 0.5 * Math.sin(t * 71));

      // 1 the mark (scaled about the vanishing point) into the target
      gl.bindFramebuffer(gl.FRAMEBUFFER, A.f);
      gl.viewport(0, 0, A.w, A.h);
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (la > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        var Q = P.quad;
        gl.useProgram(Q.p);
        gl.bindBuffer(gl.ARRAY_BUFFER, unit);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(Q.u("uRes"), Wc, Hc);
        gl.uniform1f(Q.u("uA"), la);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(Q.u("uTex"), 0);
        parts.forEach(function (o) {
          var r = o.rect;
          gl.uniform4f(Q.u("uRect"), vp[0] + (r[0] - vp[0]) * sc, vp[1] + (r[1] - vp[1]) * sc, r[2] * sc, r[3] * sc);
          gl.bindTexture(gl.TEXTURE_2D, o.tex);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        });
        gl.disable(gl.BLEND);
      }

      // 2 composite: zoom-blurred mark + the highway + flash + tunnel vision
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cv.width, cv.height);
      var C = P.comp;
      gl.useProgram(C.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, tri);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, A.t);
      gl.uniform1i(C.u("uA"), 0);
      gl.uniform2f(C.u("uRes"), Wc, Hc);
      gl.uniform2f(C.u("uVP"), vx, vy);
      gl.uniform1f(C.u("uD"), travel(t) * 2.2);
      gl.uniform1f(C.u("uV"), v);
      gl.uniform1f(C.u("uK"), streakK);
      gl.uniform1f(C.u("uBlur"), blur);
      gl.uniform1f(C.u("uCA"), blur * 0.03);
      gl.uniform1f(C.u("uFlash"), fl);
      gl.uniform1f(C.u("uVig"), 0.55 * v);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    var PARTS = null;
    var api = {
      onDone: null,
      prepare: function (set, mw, parts_) {
        if (dead) return false;
        PARTS = parts_;
        try {
          layout(set, mw);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, cv.width, cv.height);
          gl.clearColor(bg[0], bg[1], bg[2], 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          window.addEventListener("resize", function () {
            if (dead) return;
            try { layout(set, mw); render(lastT); } catch (e) { api.finish(); }
          });
          return true;
        } catch (e) { api.finish(); return false; }
      },
      start: function () {
        if (dead) return;
        t0 = performance.now();
        var tick = function (now) {
          if (dead) return;
          var t = (now - t0) / 1000;
          try { render(t); } catch (e) { api.finish(); return; }
          if (t >= S_T.handoff) api.finish();
          else raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      renderAt: function (t) {
        if (dead) return;
        try { render(t); } catch (e) { api.finish(); return; }
        if (t >= S_T.handoff) api.finish();
      },
      finish: function () {
        if (dead) return;
        dead = true;
        cancelAnimationFrame(raf);
        if (api.onDone) api.onDone();
        // give the GPU back before the 3D viewer boots
        var lose = gl.getExtension("WEBGL_lose_context");
        setTimeout(function () { if (lose) lose.loseContext(); cv.width = cv.height = 1; }, 60);
      },
    };
    cv.addEventListener("webglcontextlost", function () { api.finish(); });
    return api;
  }

  // ---------------------------------------------------------------- markup

  // Autobahn: the official lockup (autobahnwindowfilms.com, 1500w) split into
  // registered layers — wordmark + the three stripes, each with a pre-rendered
  // horizontal motion smear (trailing left) for the drive-in. Pixel boxes.
  var PARTS = cfg.parts === "autobahn" ? {
    w: 1500, h: 501, parts: [
      { src: "assets/intro-ab-word.png", x: 0, y: 251, w: 1500, h: 250 },
      { src: "assets/intro-ab-s0.png", smear: "assets/intro-ab-s0-smear.png", x: 414, y: 0, w: 674, h: 250, padL: 156, padR: 6 },
      { src: "assets/intro-ab-s1.png", smear: "assets/intro-ab-s1-smear.png", x: 764, y: 15, w: 482, h: 235, padL: 156, padR: 6 },
      { src: "assets/intro-ab-s2.png", smear: "assets/intro-ab-s2-smear.png", x: 953, y: 29, w: 485, h: 222, padL: 156, padR: 6 },
    ],
  } : null;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }

  // the mark itself — identical structure in both layers so the raw (glare)
  // and set (filmed) marks sit pixel-for-pixel on top of each other
  var LOGO_DIMS = { "assets/intro-huper-word.png": [765, 125] };
  var dimAttr = LOGO_DIMS[cfg.logo] ? ' width="' + LOGO_DIMS[cfg.logo][0] + '" height="' + LOGO_DIMS[cfg.logo][1] + '"' : "";
  function markHTML(layer) {
    var glint = layer === "set"
      ? '<div class="bi-glint" style="-webkit-mask-image:url(\'' + cfg.logo + '\');mask-image:url(\'' + cfg.logo + '\')"><span></span></div>'
      : "";
    if (PARTS) {
      // layered lockup: every piece placed in the lockup's own pixel space, so
      // the assembled mark is the official artwork exactly
      var pc = function (v, of) { return (v / of * 100).toFixed(4) + "%"; };
      var h = '<div class="bi-markwrap bi-parts" style="aspect-ratio:' + PARTS.w + "/" + PARTS.h + '">';
      PARTS.parts.forEach(function (q, i) {
        var box = "left:" + pc(q.x, PARTS.w) + ";top:" + pc(q.y, PARTS.h) + ";width:" + pc(q.w, PARTS.w) + ";height:" + pc(q.h, PARTS.h);
        if (!q.smear) {
          h += '<img class="bi-pt bi-word" src="' + q.src + '" style="' + box + '" alt="" draggable="false">';
          return;
        }
        h += '<div class="bi-pt bi-strp bi-strp' + (i - 1) + '" style="' + box + '">' +
          '<img class="bi-smear" src="' + q.smear + '" style="left:' + pc(-q.padL, q.w) + ";width:" + pc(q.w + q.padL + q.padR, q.w) + '" alt="" draggable="false">' +
          '<img class="bi-sharp" src="' + q.src + '" alt="" draggable="false"></div>';
      });
      return h + '<div class="bi-bloom"></div>' + glint + "</div>";
    }
    if (pull === "cut") {
      return '<div class="bi-markwrap"><div class="bi-mark" style="background-image:url(\'' + cfg.logo + '\')"></div>' + glint + "</div>";
    }
    return '<div class="bi-markwrap bi-markwrap-word">' +
      '<img class="bi-mark-img" src="' + cfg.logo + '"' + dimAttr + ' alt="" draggable="false">' + glint + "</div>";
  }

  function charsHTML(text, cls) {
    if (!text) return "";
    var out = "";
    var chars = Array.from(text);
    for (var i = 0; i < chars.length; i++) {
      var c = chars[i] === " " ? "&nbsp;" : esc(chars[i]);
      out += '<span style="--i:' + i + '">' + c + "</span>";
    }
    return '<div class="' + cls + '">' + out + "</div>";
  }

  function lockHTML(layer) {
    return '<div class="bi-lock">' +
      charsHTML(cfg.kicker, "bi-kick") +
      markHTML(layer) +
      (cfg.rule === false ? "" : '<div class="bi-rule"></div>') +
      charsHTML(cfg.sub, "bi-sub") +
      "</div>";
  }

  // GPU-only pull (Hüper + Autobahn). A rotated frame fixes the edge angle; in
  // it an overflow:hidden window slides while its contents counter-slide, so
  // the contents hold still on screen and only the window's edge travels.
  // Nothing but transforms animate, so the stroke runs on the compositor and
  // stays smooth while the page boots underneath — the old clip-path pull ran
  // on the main thread and got starved by Autobahn's 3D engine load.
  //   kind "r" = the film going on (reveals the set layer)
  //   kind "x" = the exit (takes the whole pane away)
  function win(kind, content) {
    return '<div class="bi-wr"><div class="bi-ww bi-' + kind + 'w"><div class="bi-wi bi-' + kind + 'i">' +
      '<div class="bi-wj">' + content + "</div></div></div></div>";
  }
  // the squeegee itself: a lit bar riding the window's edge in the same frame
  function bladeHTML(kind) {
    return '<div class="bi-wr bi-bfr"><div class="bi-bm bi-b' + kind + '"><i class="bi-bar"></i></div></div>';
  }

  var heatFx = cfg.heat
    ? '<svg class="bi-defs" width="0" height="0" aria-hidden="true"><filter id="biHeatFx" x="-5%" y="-20%" width="110%" height="140%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.010 0.050" numOctaves="2" seed="7" result="n"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="n" scale="11" xChannelSelector="R" yChannelSelector="G"/></filter></svg>'
    : "";

  var streaks = "";
  if (pull === "forward") {
    for (var s = 0; s < 6; s++) streaks += '<i class="bi-streak bi-streak' + s + '"></i>';
  }

  // the speed fx needs WebGL; without it Autobahn falls back to the line reveal
  var fxcv = null, fx = null;
  if (cfg.speed && PARTS && !reduced) {
    fxcv = document.createElement("canvas");
    fxcv.className = "bi-glcv";
    fxcv.setAttribute("aria-hidden", "true");
    fx = makeSpeed(fxcv, bg);
  }
  if (fx) T = { pull: S_T.zoom, pullDur: S_T.zoomDur, sub: 1.3, glint: 1.56, rule: 1.3, exit: 2.65, exitDur: 0.55 };

  var el = document.createElement("div");
  el.id = "brandIntro";
  el.className = "bi-" + pull + (reduced ? " bi-reduced" : " bi-hold") + (fx ? " bi-gl" : "");
  el.setAttribute("role", "presentation");
  el.setAttribute("aria-hidden", "true");
  var rawHTML = '<div class="bi-raw"><div class="bi-glare"></div>' + streaks + (PARTS ? "" : lockHTML("raw")) + "</div>";
  var setHTML = '<div class="bi-set">' + lockHTML("set") + "</div>";
  var skipHTML = '<div class="bi-skip">Click to skip</div>';
  var glassHTML = glass
    ? '<div class="bi-gfr"><div class="bi-gmv"><div class="bi-gcard">' +
      '<div class="bi-gin"><div class="bi-gj">' + lockHTML("copy") + "</div></div>" +
      '<div class="bi-gtint"></div><div class="bi-gsheen"></div></div></div></div>'
    : "";
  el.innerHTML = glass
    ? '<div class="bi-pane">' + win("x", setHTML + glassHTML + skipHTML) + "</div>" + bladeHTML("out")
    : fx
    ? '<div class="bi-pane">' + win("x", setHTML + skipHTML) + "</div>" + bladeHTML("out")
    : pull === "cut"
    ? heatFx + '<div class="bi-pane">' + rawHTML + setHTML + skipHTML + "</div>" + '<div class="bi-cutblade"></div>'
    : heatFx + '<div class="bi-pane">' + win("x", rawHTML + win("r", setHTML) + skipHTML) + "</div>" +
      bladeHTML("in") + bladeHTML("out");
  if (fx) {
    var setEl = el.querySelector(".bi-set");
    setEl.insertBefore(fxcv, setEl.firstChild);
    fx.onDone = function () { el.classList.remove("bi-gl"); fxcv.style.visibility = "hidden"; };
  }

  // ---------------------------------------------------------------- styles
  var ease = "cubic-bezier(.62,.02,.28,1)"; // grip, drive, settle — a real squeegee stroke
  var out = "cubic-bezier(.2,.7,.2,1)";
  var css = document.createElement("style");
  var R = [];

  R.push(
    "#brandIntro{position:fixed;inset:0;z-index:9999;background:" + bg + ";cursor:pointer;overflow:hidden;" +
    "-webkit-user-select:none;user-select:none;contain:strict}",
    "#brandIntro .bi-defs{position:absolute;width:0;height:0}",
    "#brandIntro .bi-pane{position:absolute;inset:0}",
    // once the exit starts the root goes clear so the app shows through
    "#brandIntro.bi-exit{background:transparent;cursor:default}",
    // held until the overlay has actually painted (see start below)
    "#brandIntro.bi-hold,#brandIntro.bi-hold *{animation-play-state:paused!important}",
    // and nothing of the mark shows until it can show whole (see ready below)
    "#brandIntro.bi-hold .bi-lock,#brandIntro.bi-hold .bi-gfr,#brandIntro.bi-hold .bi-cutblade{visibility:hidden}",
    "#brandIntro .bi-raw,#brandIntro .bi-set{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}",
    "#brandIntro .bi-set{background:" + bg + "}",
    "#brandIntro .bi-lock{position:relative;width:min(" + (pull === "cut" ? "62vw,500px" : PARTS ? "80vw,620px" : "74vw,560px") + ");text-align:center}",
    // mark
    "#brandIntro .bi-markwrap{position:relative;width:100%;margin:0 auto}",
    "#brandIntro .bi-markwrap-word{line-height:0}",
    "#brandIntro .bi-mark-img{width:100%;height:auto;display:block}",
    "#brandIntro .bi-mark{position:absolute;inset:0;background-size:contain;background-position:center;background-repeat:no-repeat}",
    pull === "cut" ? "#brandIntro .bi-markwrap{aspect-ratio:600/296;width:88%}" : "",
    // layered lockup (Autobahn)
    "#brandIntro .bi-parts{width:100%}",
    "#brandIntro .bi-pt{position:absolute;display:block}",
    "#brandIntro .bi-strp img{position:absolute;top:0;height:100%;display:block;max-width:none}",
    "#brandIntro .bi-sharp{left:0;width:100%}",
    "#brandIntro .bi-strp,#brandIntro .bi-word{will-change:transform}",
    "#brandIntro .bi-bloom{position:absolute;left:22%;right:0;top:-30%;height:105%;z-index:-1;opacity:0;pointer-events:none;" +
    "background:radial-gradient(50% 50% at 55% 60%,rgba(255,30,20,.30),rgba(255,30,20,.10) 45%,transparent 72%)}",
    // fx canvas sits under the DOM lockup; the DOM parts wait for the handoff
    "#brandIntro .bi-glcv{position:absolute;left:0;top:0;width:100%;height:100%;display:block;z-index:0}",
    "#brandIntro .bi-set .bi-lock{z-index:1}",
    "#brandIntro.bi-gl .bi-parts .bi-pt{visibility:hidden}",
    // kicker (above the mark) — the brand site's own "NO LIMITS" lockup
    "#brandIntro .bi-kick{margin-bottom:clamp(14px,2.2vw,24px);color:" + fg + ";font-family:" + font + ";white-space:nowrap;" +
    "width:max-content;max-width:94vw;position:relative;left:50%;transform:translateX(-50%);" +
    "font-size:clamp(10px,1.4vw,13px);font-weight:600;letter-spacing:clamp(.3em,1.4vw,.62em);text-indent:clamp(.3em,1.4vw,.62em)}",
    "#brandIntro .bi-kick span{display:inline-block}",
    // rule + tagline
    "#brandIntro .bi-rule{height:3px;background:" + accent + ";margin:18px auto 0;width:100%;border-radius:2px;transform-origin:left center}",
    "#brandIntro .bi-sub{margin-top:16px;color:" + fg + ";font-family:" + font + ";white-space:nowrap;" +
    "width:max-content;max-width:94vw;position:relative;left:50%;transform:translateX(-50%);" +
    "font-size:clamp(10px,1.5vw,14px);font-weight:600;letter-spacing:clamp(.22em,1.25vw,.5em);text-indent:clamp(.22em,1.25vw,.5em)}",
    "#brandIntro .bi-sub span{display:inline-block}",
    // glint
    "#brandIntro .bi-glint{position:absolute;inset:0;-webkit-mask-size:100% 100%;mask-size:100% 100%;overflow:hidden;pointer-events:none}",
    "#brandIntro .bi-glint span{position:absolute;top:-10%;bottom:-10%;width:30%;" +
    "background:" + (PARTS
      ? "linear-gradient(96deg,transparent 28%,rgba(255,40,24,.85) 44%,#fff 50%,rgba(255,40,24,.85) 56%,transparent 72%)"
      : "linear-gradient(105deg,transparent," + (dark ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.95)") + " 50%,transparent)") + ";" +
    "transform:translateX(-170%) skewX(-12deg);opacity:0}",
    // skip
    "#brandIntro .bi-skip{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);z-index:5;" +
    "color:" + dim + ";font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-family:" + font + "}"
  );

  // ---- raw (pre-film) layer: overexposed glare, washed-out mark
  if (pull === "down") {
    R.push(
      "#brandIntro .bi-raw{background:#f3dcb8}",
      "#brandIntro .bi-glare{position:absolute;inset:-10%;" +
      "background:radial-gradient(60% 55% at 72% 16%,#fffaf0 0%,#ffe2b4 26%,rgba(255,196,120,.85) 50%,rgba(246,214,170,.0) 80%)," +
      "radial-gradient(90% 70% at 20% 90%,rgba(255,170,90,.45),transparent 70%)}",
      "#brandIntro .bi-raw .bi-lock{filter:url(#biHeatFx);will-change:transform}",
      "#brandIntro .bi-raw .bi-mark-img{filter:brightness(1.55) contrast(.5) saturate(.4) blur(.8px);opacity:.8}",
      "#brandIntro .bi-raw .bi-rule,#brandIntro .bi-raw .bi-sub{visibility:hidden}"
    );
  } else if (pull === "forward") {
    R.push(
      "#brandIntro .bi-raw{background:" + bg + "}",
      "#brandIntro .bi-glare{position:absolute;inset:0;" +
      "background:radial-gradient(42% 16% at 50% 50%,rgba(255,70,50,.20),transparent 75%)," +
      "linear-gradient(180deg,transparent 46%,rgba(255,60,40,.16) 49.6%,rgba(255,226,214,.42) 50%,rgba(255,60,40,.16) 50.4%,transparent 54%)}",
      // taillights among the headlights
      "#brandIntro .bi-streak1,#brandIntro .bi-streak4{background:linear-gradient(90deg,transparent,rgba(255,40,24,.9),transparent)}",
      "#brandIntro .bi-sub{opacity:.7;font-size:clamp(9px,1.2vw,12px)}",

      "#brandIntro .bi-streak{position:absolute;left:0;height:1px;width:38%;border-radius:1px;opacity:0;" +
      "background:linear-gradient(90deg,transparent,rgba(255,226,214,.85),transparent)}",
      "#brandIntro .bi-streak0{top:30%}#brandIntro .bi-streak1{top:37%;width:24%}#brandIntro .bi-streak2{top:44.6%;height:2px;width:52%}" +
      "#brandIntro .bi-streak3{top:53%;width:30%}#brandIntro .bi-streak4{top:61%;width:20%}#brandIntro .bi-streak5{top:68%;width:34%}"
    );
  } else {
    R.push(
      "#brandIntro .bi-raw{background:#fdfeff}",
      "#brandIntro .bi-glare{position:absolute;inset:-10%;" +
      "background:radial-gradient(55% 45% at 50% 46%,#ffffff 0%,rgba(236,243,255,.9) 45%,rgba(214,226,246,.55) 100%)}",
      "#brandIntro .bi-raw .bi-mark{filter:brightness(1.9) contrast(.35) blur(1.4px);opacity:.35}",
      "#brandIntro .bi-raw .bi-rule,#brandIntro .bi-raw .bi-sub{visibility:hidden}"
    );
  }

  // ---- the blade (squeegee edge)
  if (pull === "cut") {
    R.push(
      "#brandIntro .bi-cutblade{position:absolute;left:0;right:0;top:var(--cy,50%);height:var(--bh,4px);margin-top:calc(var(--bh,4px) / -2);" +
      "background:" + accent + ";border-radius:3px;z-index:4;transform-origin:left center;" +
      "box-shadow:0 0 0 0 rgba(13,27,61,0)}"
    );
  } else {
    // frame is 124% of the viewport (inset -12%) so it still covers after
    // rotating; .bi-wj maps back to exactly the viewport: 12/124, 100/124
    var ang = (pull === "forward" ? 6 : 2.6) + "deg";
    var vert = pull === "forward"; // edge runs vertically (sweeps sideways)
    R.push(
      "#brandIntro .bi-wr{position:absolute;inset:-12%;transform:rotate(" + ang + ");transform-origin:50% 50%;pointer-events:none}",
      "#brandIntro .bi-ww{position:absolute;inset:0;overflow:hidden}",
      "#brandIntro .bi-wi{position:absolute;inset:0}",
      "#brandIntro .bi-wj{position:absolute;left:9.6774%;top:9.6774%;width:80.6452%;height:80.6452%;" +
      "transform:rotate(-" + ang + ");transform-origin:50% 50%}",
      "#brandIntro .bi-ww,#brandIntro .bi-wi,#brandIntro .bi-bm{will-change:transform}",
      "#brandIntro .bi-bfr{z-index:4}",
      "#brandIntro .bi-bm{position:absolute;inset:0}",
      "#brandIntro .bi-bar{position:absolute;display:block;border-radius:2px;" +
      (vert ? "top:0;bottom:0;width:2px;" : "left:0;right:0;height:2.5px;") +
      "background:" + (dark ? "#fff3ee" : "#ffffff") + ";box-shadow:" +
      (dark
        ? "0 0 6px 1px rgba(255,90,60,.9),0 0 22px 5px rgba(255,40,30,.45)}"
        : "0 0 7px 1px rgba(255,255,255,.95),0 0 20px 5px rgba(255,255,255,.55),0 1.5px 0 rgba(96,72,48,.3)}"),
      // entry bar rides the window's leading edge; exit bar rides its trailing edge
      vert
        ? "#brandIntro .bi-bin .bi-bar{right:0;transform:translateX(50%)}#brandIntro .bi-bout .bi-bar{left:0;transform:translateX(-50%)}"
        : "#brandIntro .bi-bin .bi-bar{bottom:0;transform:translateY(50%)}#brandIntro .bi-bout .bi-bar{top:0;transform:translateY(-50%)}",
      "#brandIntro .bi-bout{opacity:0}#brandIntro.bi-exit .bi-bout{opacity:1}",
      vert && dark
        ? "#brandIntro .bi-bin .bi-bar::before{content:'';position:absolute;top:0;bottom:0;right:100%;width:18vw;" +
          "background:linear-gradient(90deg,transparent,rgba(255,36,20,.10) 55%,rgba(255,60,40,.38))}"
        : ""
    );
  }

  // ---- glass slab (geometry comes from placeGlass() as px custom properties)
  if (glass) {
    var ga = glass.ang + "deg";
    R.push(
      // frame = viewport + 12% bleed, rotated to the slab's angle
      "#brandIntro .bi-gfr{position:absolute;left:-12vw;top:-12vh;width:124vw;height:124vh;z-index:3;pointer-events:none;" +
      "transform:rotate(" + ga + ");transform-origin:50% 50%}",
      "#brandIntro .bi-gmv{position:absolute;inset:0;will-change:transform}",
      "#brandIntro .bi-gcard{position:absolute;left:var(--cl,40vw);top:var(--ct,40vh);width:var(--cw,30vw);height:var(--ch,30vh);" +
      "border-radius:" + glass.radius + "px;overflow:hidden;box-shadow:" + glass.drop + "}",
      // the counter-sliding view: lines the copy up with the real mark underneath
      "#brandIntro .bi-gin{position:absolute;left:calc(var(--cl,40vw) * -1);top:calc(var(--ct,40vh) * -1);width:124vw;height:124vh;will-change:transform}",
      "#brandIntro .bi-gj{position:absolute;left:12vw;top:12vh;width:100vw;height:100vh;background:" + bg + ";" +
      "display:flex;align-items:center;justify-content:center;transform:rotate(" + (-glass.ang) + "deg);transform-origin:50% 50%}",
      // refraction: the mark through thick glass — magnified, softened, tinted
      "#brandIntro .bi-gj .bi-lock{filter:" + glass.refract + ";transform:scale(" + glass.mag + ")}",
      "#brandIntro .bi-gj .bi-rule,#brandIntro .bi-gj .bi-sub{visibility:hidden}",
      "#brandIntro .bi-gtint{position:absolute;inset:0;background:" + glass.tint + "}",
      // rim light + specular streak along the leading edge
      "#brandIntro .bi-gsheen{position:absolute;inset:0;border-radius:inherit;box-shadow:" + glass.rim + "," + glass.edge + ";" +
      "background:" + (glass.sheenBg ||
        "radial-gradient(120% 52% at 22% -6%,rgba(255,255,255," + glass.spec + ") 0%,rgba(255,255,255,0) 58%)," +
        "linear-gradient(100deg,transparent 0%," + glass.sheen + " 5%,transparent 16%,transparent 82%,rgba(255,255,255,.14) 94%,transparent 100%)") + "}",
    );
  }

  // ---- motion (skipped wholesale for reduced motion)
  if (!reduced) {
    var p = T.pull + "s", pd = T.pullDur + "s";
    // glare breathes in, then holds — the light is there before the film
    R.push(
      "#brandIntro .bi-glare{animation:biGlare 1.4s " + out + " both}",
      "@keyframes biGlare{from{opacity:.55;transform:scale(1.08)}to{opacity:1;transform:scale(1)}}"
    );
    if (glass) {
      var gd = glass.dur + "s", gat = glass.at + "s";
      R.push(
        // the mark settles in, then the slab crosses it — lingering over the
        // mark mid-pass — while its view counter-slides by the same amount
        "#brandIntro .bi-set .bi-lock{animation:biLogoIn .6s " + out + " both}",
        "@keyframes biLogoIn{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:none}}",
        "#brandIntro .bi-gmv{animation:biGlassMv " + gd + " " + glass.ease + " " + gat + " both}",
        "#brandIntro .bi-gin{animation:biGlassIn " + gd + " " + glass.ease + " " + gat + " both}",
        glass.band
          ? "@keyframes biGlassMv{from{transform:translateY(calc(var(--gx,80vh) * -1))}to{transform:translateY(var(--gx,80vh))}}" +
            "@keyframes biGlassIn{from{transform:translateY(var(--gx,80vh))}to{transform:translateY(calc(var(--gx,80vh) * -1))}}"
          : "@keyframes biGlassMv{from{transform:translateX(calc(var(--gx,80vw) * -1))}to{transform:translateX(var(--gx,80vw))}}" +
            "@keyframes biGlassIn{from{transform:translateX(var(--gx,80vw))}to{transform:translateX(calc(var(--gx,80vw) * -1))}}",
        // a fuller shimmer for these: wider, brighter, a touch slower
        "#brandIntro .bi-glint span{width:38%}"
      );
    } else if (pull === "down") {
      R.push(
        "#brandIntro .bi-rw{animation:biRWd " + pd + " " + ease + " " + p + " both}",
        "#brandIntro .bi-ri{animation:biRId " + pd + " " + ease + " " + p + " both}",
        "#brandIntro .bi-bin{animation:biRWd " + pd + " " + ease + " " + p + " both}",
        "@keyframes biRWd{from{transform:translateY(-100%)}to{transform:translateY(0)}}",
        "@keyframes biRId{from{transform:translateY(100%)}to{transform:translateY(0)}}",
        // frozen heat warp still breathes: a slow composited rise
        "#brandIntro .bi-raw .bi-lock{animation:biRise 1.3s ease-in-out infinite alternate}",
        "@keyframes biRise{from{transform:translateY(1.5px)}to{transform:translateY(-1.5px)}}"
      );
    } else if (pull === "forward" && fx) {
      R.push(
        // the GL drove the stripes; the DOM lockup it hands off to is the parked state
        "#brandIntro .bi-strp .bi-smear{visibility:hidden}",
        "#brandIntro .bi-bloom{animation:biBloom 1.1s ease-out " + (S_T.zoom + 0.3) + "s both}",
        "@keyframes biBloom{0%{opacity:0}30%{opacity:1}100%{opacity:.35}}"
      );
    } else if (pull === "forward") {
      R.push(
        "#brandIntro .bi-rw{animation:biRWf " + pd + " " + ease + " " + p + " both}",
        "#brandIntro .bi-ri{animation:biRIf " + pd + " " + ease + " " + p + " both}",
        "#brandIntro .bi-bin{animation:biRWf " + pd + " " + ease + " " + p + " both}",
        "@keyframes biRWf{from{transform:translateX(-100%)}to{transform:translateX(0)}}",
        "@keyframes biRIf{from{transform:translateX(100%)}to{transform:translateX(0)}}",
        // the line (and its afterglow) burns off once it has crossed
        "#brandIntro .bi-bin .bi-bar{animation:biBurnOff .3s linear " + (T.pull + T.pullDur - 0.1) + "s both}",
        "@keyframes biBurnOff{from{opacity:1}to{opacity:0}}",
        // headlight streaks race past in the raw night before the pull
        "#brandIntro .bi-streak{animation:biStreak .42s cubic-bezier(.5,0,.5,1) infinite}",
        "#brandIntro .bi-streak1{animation-delay:.12s}#brandIntro .bi-streak2{animation-delay:.05s;animation-duration:.36s}" +
        "#brandIntro .bi-streak3{animation-delay:.2s}#brandIntro .bi-streak4{animation-delay:.28s}#brandIntro .bi-streak5{animation-delay:.16s}",
        "@keyframes biStreak{0%{opacity:0;transform:translateX(-110%)}20%{opacity:1}80%{opacity:1}100%{opacity:0;transform:translateX(280%)}}",
        // the stripes drive in behind the line: smeared at speed, sharpening as
        // they brake into place, staggered like lanes of traffic
        "#brandIntro .bi-strp{animation:biDrive .82s cubic-bezier(.16,1,.3,1) both}",
        "#brandIntro .bi-strp0{animation-delay:" + (T.pull - 0.04) + "s}" +
        "#brandIntro .bi-strp1{animation-delay:" + (T.pull + 0.03) + "s}" +
        "#brandIntro .bi-strp2{animation-delay:" + (T.pull + 0.10) + "s}",
        "#brandIntro .bi-strp .bi-smear{animation:biSmear .82s linear both;animation-delay:inherit}",
        "#brandIntro .bi-strp .bi-sharp{animation:biSharp .82s linear both;animation-delay:inherit}",
        "@keyframes biDrive{from{transform:translateX(-95%)}to{transform:none}}",
        "@keyframes biSmear{0%{opacity:1}30%{opacity:.9}62%{opacity:0}100%{opacity:0}}",
        "@keyframes biSharp{0%{opacity:0}26%{opacity:0}58%{opacity:1}100%{opacity:1}}",
        // the wordmark carries a little of the same momentum
        "#brandIntro .bi-word{animation:biWordIn .9s cubic-bezier(.16,1,.3,1) " + T.pull + "s both}",
        "@keyframes biWordIn{from{transform:translateX(-4%)}to{transform:none}}",
        // brake-light bloom as the stripes lock
        "#brandIntro .bi-bloom{animation:biBloom 1.1s ease-out " + (T.pull + 0.5) + "s both}",
        "@keyframes biBloom{0%{opacity:0}30%{opacity:1}100%{opacity:.35}}"
      );
    } else {
      // cut: blade draws across at the strike line, the mark opens out of it,
      // then the blade contracts into the logo's own strike
      R.push(
        "#brandIntro .bi-cutblade{animation:biBladeDraw " + T.bladeDur + "s cubic-bezier(.65,0,.35,1) " + T.blade + "s both," +
        "biBladeLand " + T.landDur + "s cubic-bezier(.7,0,.2,1) " + T.land + "s both}",
        "#brandIntro .bi-set{animation:biCutOpen " + pd + " " + ease + " " + p + " both}",
        "@keyframes biBladeDraw{from{transform:scaleX(0)}to{transform:scaleX(1)}}",
        "@keyframes biBladeLand{from{left:0;right:0}to{left:var(--sl,30%);right:var(--sr,30%)}}",
        "@keyframes biCutOpen{from{clip-path:inset(var(--cy,50%) 0 calc(100% - var(--cy,50%)) 0)}to{clip-path:inset(0 0 0 0)}}"
      );
    }
    // shared settle: rule draws in the pull's direction, tagline tracks in,
    // one clean glint confirms the finish
    if (cfg.rule !== false) R.push(
      "#brandIntro .bi-set .bi-rule{animation:biRule .7s cubic-bezier(.65,0,.35,1) " + T.rule + "s both}",
      "@keyframes biRule{from{transform:scaleX(0)}to{transform:scaleX(1)}}"
    );
    R.push(
      "#brandIntro .bi-set .bi-sub span{opacity:0;animation:biChar .55s " + out + " both;" +
      "animation-delay:calc(" + T.sub + "s + var(--i) * 18ms)}",
      "#brandIntro .bi-set .bi-kick span{opacity:0;animation:biChar .55s " + out + " both;" +
      "animation-delay:calc(" + (T.sub - 0.14) + "s + var(--i) * 22ms)}",
      "@keyframes biChar{from{opacity:0;transform:translateY(.5em);filter:blur(5px)}to{opacity:.85;transform:none;filter:blur(0)}}",
      "#brandIntro .bi-glint span{animation:biGlint .75s cubic-bezier(.45,0,.25,1) " + T.glint + "s both}",
      // invisible at BOTH ends: fill-mode "both" holds the first keyframe through
      // the delay, so an opaque start would sit parked over the first letters
      "@keyframes biGlint{0%{opacity:0;transform:translateX(-170%) skewX(-12deg)}12%{opacity:1}88%{opacity:1}" +
      "100%{opacity:0;transform:translateX(430%) skewX(-12deg)}}",
      "#brandIntro .bi-skip{opacity:0;animation:biFade .5s ease " + (T.glint - 0.2) + "s forwards}",
      "@keyframes biFade{to{opacity:1}}"
    );
    // exit: the pane is pulled away the same way it went on, revealing the app
    var xd = T.exitDur + "s";
    if (pull === "down") R.push(
      "#brandIntro.bi-exit .bi-xw,#brandIntro.bi-exit .bi-bout{animation:biXWd " + xd + " " + ease + " both}",
      "#brandIntro.bi-exit .bi-xi{animation:biXId " + xd + " " + ease + " both}",
      "@keyframes biXWd{from{transform:translateY(0)}to{transform:translateY(100%)}}",
      "@keyframes biXId{from{transform:translateY(0)}to{transform:translateY(-100%)}}"
    );
    else if (pull === "forward") R.push(
      "#brandIntro.bi-exit .bi-xw,#brandIntro.bi-exit .bi-bout{animation:biXWf " + xd + " " + ease + " both}",
      "#brandIntro.bi-exit .bi-xi{animation:biXIf " + xd + " " + ease + " both}",
      "@keyframes biXWf{from{transform:translateX(0)}to{transform:translateX(100%)}}",
      "@keyframes biXIf{from{transform:translateX(0)}to{transform:translateX(-100%)}}"
    );
    else R.push(
      "#brandIntro.bi-exit .bi-pane{animation:biCutClose " + xd + " cubic-bezier(.7,0,.25,1) both}",
      "#brandIntro.bi-exit .bi-cutblade{animation:biBladeOut " + xd + " cubic-bezier(.7,0,.25,1) both}",
      "@keyframes biCutClose{from{clip-path:inset(0 0 0 0)}to{clip-path:inset(var(--cy,50%) 0 calc(100% - var(--cy,50%)) 0)}}",
      "@keyframes biBladeOut{0%{left:var(--sl,30%);right:var(--sr,30%);opacity:1}55%{left:0;right:0;opacity:1}100%{left:0;right:0;opacity:0}}"
    );
  } else {
    // reduced motion: no pull, no blade — the finished lockup, then a fade
    R.push(
      "#brandIntro .bi-raw,#brandIntro .bi-bfr,#brandIntro .bi-cutblade,#brandIntro .bi-gfr{display:none}",
      "#brandIntro .bi-glint,#brandIntro .bi-skip{display:none}",
      "#brandIntro .bi-sub span,#brandIntro .bi-kick span{opacity:.85}",
      "#brandIntro .bi-smear{display:none}",
      "#brandIntro{transition:opacity .35s ease}#brandIntro.bi-exit{opacity:0}"
    );
  }

  css.textContent = R.join("");
  document.head.appendChild(css);
  document.documentElement.appendChild(el);

  if (glass) {
    var placeGlass = function () {
      var vw = window.innerWidth, vh = window.innerHeight;
      var set = el.querySelector(".bi-set");
      var lock = set && set.querySelector(".bi-lock");
      if (!lock) return;
      var mw = lock.querySelector(".bi-markwrap");
      var top = lock.offsetTop + mw.offsetTop;
      var bot = lock.offsetTop + mw.offsetTop + mw.offsetHeight;
      var fw = vw * 1.24, fh = vh * 1.24;
      var my = (top + bot) / 2;                                   // mark centre (viewport y)
      var cw, ch, ct, gx;
      if (glass.band) {
        var a = Math.abs(glass.ang) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
        ch = Math.max(84, (bot - top) * glass.hMul);
        cw = 2 * (vw / 2 * c + vh / 2 * sn) + 80;                 // long enough to bleed off both ends, any aspect
        ct = fh / 2 + (my - vh / 2) * c - ch / 2;                  // rest position: centred on the mark
        gx = vw / 2 * sn + vh / 2 * c + Math.abs(my - vh / 2) + ch / 2 + 24; // fully off-screen at both ends
      } else {
        cw = Math.max(150, lock.offsetWidth * glass.wFrac);
        ch = Math.max(120, (bot - top) * glass.hMul);
        ct = my + vh * 0.12 - ch / 2;
        gx = fw / 2 + cw;                                          // starts and ends fully off-screen
      }
      el.style.setProperty("--cw", cw.toFixed(1) + "px");
      el.style.setProperty("--ch", ch.toFixed(1) + "px");
      el.style.setProperty("--cl", (fw / 2 - cw / 2).toFixed(1) + "px");
      el.style.setProperty("--ct", ct.toFixed(1) + "px");
      el.style.setProperty("--gx", gx.toFixed(1) + "px");
    };
    placeGlass();
    window.addEventListener("resize", placeGlass);
    var gimg = el.querySelector(".bi-set .bi-mark-img");
    if (gimg && !gimg.complete) gimg.addEventListener("load", placeGlass, { once: true });
  }

  // Edge: the blade has to land exactly on the logo's own strike, so measure
  // the rendered mark and hand the geometry to the CSS
  if (pull === "cut") {
    var placeBlade = function () {
      var mw = el.querySelector(".bi-set .bi-markwrap");
      if (!mw) return;
      var r = mw.getBoundingClientRect();
      var vw = window.innerWidth, vh = window.innerHeight;
      var cy = r.top + r.height * 0.53;                 // strike sits at 53% of the mark
      var ext = r.width * 0.03;                         // strike overhangs the letters ~3%
      el.style.setProperty("--cy", (cy / vh * 100).toFixed(3) + "%");
      el.style.setProperty("--bh", Math.max(2, r.height * 0.022).toFixed(2) + "px");
      el.style.setProperty("--sl", Math.max(0, r.left - ext).toFixed(1) + "px");
      el.style.setProperty("--sr", Math.max(0, vw - r.right - ext).toFixed(1) + "px");
    };
    placeBlade();
    window.addEventListener("resize", placeBlade);
  }

  // ---------------------------------------------------------------- ready
  // Nothing moves until the mark can be seen: on a cold or hammered load the
  // logo arrives late, and the glass/blade would play across an empty field.
  // Ready = every logo decoded (the <img>s, plus the URL itself for the
  // CSS background/mask copies) and the tagline face loaded. Capped, so a
  // dead asset delays the opener but never strands the site behind it. A tab
  // opened in the background holds until it's looked at (decode() waits for
  // that anyway) — the opener plays for the viewer, not for an empty room.
  var READY_CAP = 4000;
  function whenVisible(fn) {
    if (!document.hidden) return fn();
    document.addEventListener("visibilitychange", function on() {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", on);
      fn();
    });
  }
  var ready = new Promise(function (res) {
    var waits = [];
    var pre = new Image();
    pre.src = cfg.logo;
    el.querySelectorAll("img").forEach(function (im) { waits.push(im); });
    waits.push(pre);
    var jobs = waits.map(function (im) {
      if (im.decode) return im.decode().catch(function () {});
      return new Promise(function (r) { if (im.complete) r(); else { im.onload = im.onerror = r; } });
    });
    if (document.fonts && document.fonts.load) {
      try { jobs.push(document.fonts.load("600 14px " + font).catch(function () {})); } catch (e) {}
    }
    Promise.all(jobs).then(res);
    whenVisible(function () { setTimeout(res, READY_CAP); });
  });

  // tracked-out taglines must never run off a phone: tighten the tracking
  // just enough to fit (measured with the real face, once it's loaded)
  var fitText = function () {
    el.querySelectorAll(".bi-sub,.bi-kick").forEach(function (t) {
      t.style.letterSpacing = t.style.textIndent = "";
      var max = window.innerWidth * 0.92, w = t.scrollWidth;
      if (w <= max) return;
      var ls = parseFloat(getComputedStyle(t).letterSpacing) || 0;
      var fit = Math.max(1, ls - (w - max) / Math.max(1, t.children.length)).toFixed(2) + "px";
      t.style.letterSpacing = t.style.textIndent = fit;
    });
  };
  ready.then(fitText);
  window.addEventListener("resize", fitText);
  // speed fx: textures are built once everything is decoded
  if (fx) ready.then(function () {
    fx.prepare(el.querySelector(".bi-set"), el.querySelector(".bi-set .bi-parts"), PARTS);
  });

  // ---------------------------------------------------------------- lifecycle
  var done = false;
  function finish() {
    el.remove();
    css.remove();
  }
  function dismiss() {
    if (done) return;
    done = true;
    if (fx) fx.finish(); // a skip mid-rush lands on the finished DOM lockup
    el.classList.remove("bi-hold"); // a skip during the hold must not freeze the exit
    resolveDone(); // the app boots underneath while the pane pulls away
    // the app's panels arrive as they're uncovered (app.css .zt-enter)
    document.documentElement.classList.add("zt-enter");
    setTimeout(function () { document.documentElement.classList.remove("zt-enter"); }, 1600);
    el.classList.add("bi-exit");
    setTimeout(finish, reduced ? 380 : T.exitDur * 1000 + 60);
  }

  el.addEventListener("pointerdown", dismiss);
  window.addEventListener("keydown", dismiss, { once: true });

  if (debugT) {
    var dt = +debugT;
    var freeze = function () {
      el.getAnimations({ subtree: true }).forEach(function (a) {
        a.currentTime = dt;
        a.pause();
      });
    };
    if (!reduced && dt >= T.exit * 1000) {
      // freeze the main timeline at its end, then scrub the exit itself
      var EXIT_ANIMS = /^bi(XW[df]|XI[df]|CutClose|BladeOut)$/;
      ready.then(function () { el.classList.remove("bi-hold"); if (fx) fx.finish(); requestAnimationFrame(function () {
        el.getAnimations({ subtree: true }).forEach(function (a) {
          try { a.finish(); } catch (e) { a.pause(); } // infinite (streaks) can't finish
        });
        el.classList.add("bi-exit");
        requestAnimationFrame(function () {
          var xt = dt - T.exit * 1000;
          el.getAnimations({ subtree: true }).forEach(function (a) {
            if (!EXIT_ANIMS.test(a.animationName || "")) return;
            a.currentTime = xt;
            a.pause();
          });
        });
      }); });
    } else {
      ready.then(function () {
        el.classList.remove("bi-hold");
        if (fx) fx.renderAt(dt / 1000);
        requestAnimationFrame(freeze);
      });
    }
  } else if (reduced) {
    ready.then(function () { setTimeout(dismiss, 1100); });
  } else {
    // Hold the timeline until the mark is ready AND the overlay has really
    // painted: on a busy load (Autobahn pulls in the 3D engine) the first
    // frames can arrive late, and an already-running clock would skip straight
    // past the opening. Two frames = painted. rAF can stall in embedded
    // iframes, so a timer races it; either way the clock — and the
    // auto-dismiss — start together, so the intro always plays in full.
    var started = false;
    var start = function () {
      if (started) return;
      started = true;
      el.classList.remove("bi-hold");
      if (fx) fx.start();
      if (!done) setTimeout(dismiss, T.exit * 1000);
    };
    ready.then(function () {
      whenVisible(function () {
        if (done) return;
        requestAnimationFrame(function () { requestAnimationFrame(start); });
        setTimeout(start, 700);
      });
    });
  }
})();
