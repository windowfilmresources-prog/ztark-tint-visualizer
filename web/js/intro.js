// Animated brand opener — "the pull". Every tint customer has watched an
// installer squeegee film across glass: raw glare on one side of the edge,
// calm clear glass on the other. The opener IS that stroke. It opens on
// unfiltered light, a film edge pulls across the screen, and the brand mark
// is revealed crisp behind it; the exit pulls the pane away to hand off to
// the app. Each brand plays the same stroke in its own language:
//   down    (Hüper)    heat shimmer + warm glare, film pulled down the pane
//   forward (Autobahn) night + speed streaks; a hot diagonal line sweeps across
//                      and reveals the official lockup — the stripes drive in
//                      at speed (motion-smeared) and lock into place
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

  // ---------------------------------------------------------------- water
  // Autobahn: the installer's first move. Night glass, traffic and city lights
  // streaming past behind it at three depths; three pumps of slip solution
  // coat the window — fine mist through to fat drops, irregular, the heavy
  // ones starting to run and leaving wet trails — then an invisible rag wipes
  // it down in one fast diagonal stroke: no wiper, only what water does (a
  // bead of pushed water rides the edge, drops are gathered into it), and the
  // mark is on the clean glass with its stripes driving in at speed.
  // Optics as a camera sees rain on glass: focus is ON the glass, so the night
  // behind is soft bokeh — but every drop is a lens that refocuses it, holding
  // a tiny, sharp, inverted copy of the lights. So the scene renders twice
  // (bokeh + focused) and the composite looks through glass at one, through
  // drops at the other, from a splatted height field (normals → dark rims,
  // lit lower crescent). The finished frame is the DOM lockup pixel-for-pixel,
  // so the canvas hands off invisibly and releases its GPU context before the
  // 3D viewer boots.
  var W_T = {
    bursts: [0.05, 0.17, 0.29],
    wipe: 0.74, wipeDur: 0.52, drive: [0.8, 0.87, 0.94], driveDur: 0.82, word: 0.74, wordDur: 0.9,
    handoff: 1.8,
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
  function keys(p, k) { // piecewise-linear [[at,val],...]
    if (p <= k[0][0]) return k[0][1];
    for (var i = 1; i < k.length; i++) if (p <= k[i][0]) {
      var a = k[i - 1], b = k[i];
      return a[1] + (b[1] - a[1]) * (p - a[0]) / (b[0] - a[0]);
    }
    return k[k.length - 1][1];
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function makeWater(cv, bgHex) {
    var gl = null;
    try {
      gl = cv.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    } catch (e) {}
    if (!gl) return null;

    var VS_FULL = "attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}";
    // night lights: one quad each; bokeh disc (glass view) or focused point (drop view)
    var VS_LIGHT = "attribute vec2 corner;attribute vec4 l0;attribute vec4 l1;" +
      "uniform vec2 uRes;uniform float uT;uniform float uSharp;varying vec2 vq;varying vec3 vc;" +
      "void main(){float m=min(uRes.x,uRes.y);float span=uRes.x*1.7;" +
      "float x=mod(l0.x*uRes.x-uT*l0.w*uRes.x,span)-uRes.x*.35;" +
      "float r=l0.z*m*(uSharp>.5?.32:1.);float st=uSharp>.5?1.+(l1.w-1.)*.4:l1.w;" +
      "vec2 px=vec2(x,l0.y*uRes.y)+corner*vec2(r*st,r);vq=corner;vc=l1.rgb;" +
      "vec2 n=px/uRes*2.-1.;gl_Position=vec4(n.x,-n.y,0.,1.);}";
    var FS_LIGHT = "precision highp float;varying vec2 vq;varying vec3 vc;uniform float uK;uniform float uSharp;" +
      "void main(){float d=length(vq);float f=uSharp>.5?smoothstep(1.,.45,d)*2.4:" +
      "smoothstep(1.,.62,d)*(.85+.2*smoothstep(.45,.9,d));gl_FragColor=vec4(vc*f*uK,0.);}";
    var VS_QUAD = "attribute vec2 q;uniform vec4 uRect;uniform vec2 uRes;varying vec2 vuv;varying vec2 vpx;" +
      "void main(){vpx=uRect.xy+q*uRect.zw;vuv=q;vec2 n=vpx/uRes*2.-1.;gl_Position=vec4(n.x,-n.y,0.,1.);}";
    var FS_QUAD = "precision highp float;uniform sampler2D uTex;uniform float uA;uniform float uGhost;uniform vec3 uW;" +
      "varying vec2 vuv;varying vec2 vpx;" +
      "void main(){vec4 t=texture2D(uTex,vuv);float s=dot(uW.xy,vpx)-uW.z;float wiped=1.-smoothstep(-4.,3.,s);" +
      "gl_FragColor=t*(uA*mix(uGhost,1.,wiped));}";
    // drops: d0 = x, y, r, landing time; d1 = shape seed, kind (0 drop, 1 runner, 2 trail), run start, run accel
    var VS_DROP = "attribute vec2 corner;attribute vec4 d0;attribute vec4 d1;" +
      "uniform float uT;uniform vec2 uRes;uniform vec3 uW;varying vec2 vq;varying float vk;varying float vs;varying float vkind;" +
      "const vec2 RUN=vec2(-.2,.98);" +
      "void main(){float age=uT-d0.w;float on=age<0.?0.:1.;" +
      "float run=d1.y>.5?d1.w*pow(max(0.,uT-d1.z),2.):0.;vec2 pos=d0.xy;vec2 px;vs=d1.x;" +
      "if(d1.y>1.5){vec2 pp=vec2(RUN.y,-RUN.x);float on2=on*step(1.5,run);" +
      "px=pos+RUN*(run*(corner.y*.5+.5))*on2+pp*corner.x*d0.z*.34*on2;" +
      "vq=corner;vk=.24*min(1.,d0.z/11.);vkind=2.;}" +
      "else{float r=on*d0.z*(.6+.4*clamp(age/.06,0.,1.))*(1.+.1*clamp(age/.5,0.,1.));" +
      "pos+=RUN*run;float s=dot(uW.xy,pos)-uW.z;float c=max(0.,-s);pos+=uW.xy*c;r*=exp(-c/60.);" +
      "px=pos+corner*r*1.16;vq=corner*1.16;vk=min(1.,d0.z/11.);vkind=0.;}" +
      "vec2 n=px/uRes*2.-1.;gl_Position=vec4(n.x,-n.y,0.,1.);}";
    var FS_DROP = "precision mediump float;varying vec2 vq;varying float vk;varying float vs;varying float vkind;" +
      "void main(){if(vkind>1.5){float x=abs(vq.x);if(x>1.)discard;" +
      "gl_FragColor=vec4(sqrt(1.-x*x)*vk*(.35+.65*(vq.y*.5+.5)),0.,0.,1.);return;}" +
      "float th=atan(vq.y,vq.x);float rr=1.+.03*sin(3.*th+vs*6.283)+.018*sin(5.*th+vs*17.);" +
      "vec2 q=vq;q.y*=q.y>0.?.93:1.03;float d=length(q)/rr;if(d>1.)discard;" +
      "gl_FragColor=vec4(sqrt(1.-d*d)*vk,0.,0.,1.);}";
    var FS_WIPE = "precision highp float;varying vec2 uv;uniform vec2 uRes;uniform vec3 uW;uniform float uMode;" +
      "float h1(float n){return fract(sin(n)*43758.5453);}" +
      "float ns(float x){float i=floor(x),f=fract(x);return mix(h1(i),h1(i+1.),f*f*(3.-2.*f));}" +
      "void main(){vec2 px=vec2(uv.x,1.-uv.y)*uRes;float s=dot(uW.xy,px)-uW.z;" +
      "if(uMode<.5){gl_FragColor=vec4(smoothstep(-1.,3.,s));return;}" +
      "float al=dot(vec2(-uW.y,uW.x),px);float wob=.62+.3*ns(al*.04)+.22*ns(al*.19);" +
      "float bead=exp(-pow((s-7.)/6.5,2.))*wob;" +
      "gl_FragColor=vec4(bead,0.,0.,1.);}";
    var FS_COMP = "precision highp float;varying vec2 uv;uniform sampler2D uA;uniform sampler2D uB;uniform sampler2D uH;" +
      "uniform vec2 uRes;uniform vec2 uTx;uniform vec3 uW;uniform float uLens;uniform float uSlope;uniform float uWet;" +
      "float H(vec2 p){return texture2D(uH,p).r;}" +
      "void main(){float hc=H(uv);" +
      "vec2 g=vec2(H(uv+vec2(uTx.x,0.))-H(uv-vec2(uTx.x,0.)),H(uv+vec2(0.,uTx.y))-H(uv-vec2(0.,uTx.y)));" +
      "vec3 n=normalize(vec3(-g*uSlope,1.));float w=smoothstep(.015,.07,hc);" +
      "vec2 px=vec2(uv.x,1.-uv.y)*uRes;float ws=smoothstep(-2.,8.,dot(uW.xy,px)-uW.z)*uWet;" +
      // the glass between drops: out-of-focus night, fogged a little by the film
      "vec2 b=2./uRes;vec2 e=vec2(b.x*1.6,0.);vec2 f=vec2(0.,b.y*1.6);" +
      "vec3 bl=(texture2D(uA,uv+b).rgb+texture2D(uA,uv-b).rgb+texture2D(uA,uv+vec2(b.x,-b.y)).rgb+texture2D(uA,uv+vec2(-b.x,b.y)).rgb+" +
      "texture2D(uA,uv+e).rgb+texture2D(uA,uv-e).rgb+texture2D(uA,uv+f).rgb+texture2D(uA,uv-f).rgb)*.125;" +
      "vec3 glass=mix(texture2D(uA,uv).rgb,bl,ws*.85)+vec3(.007,.0075,.009)*ws;" +
      // inside a drop: a lens — the night refocused, inverted, shrunk
      "vec2 lo=-n.xy*uLens/uRes;vec3 drop=texture2D(uA,uv+lo*.45).rgb*.9+texture2D(uB,uv+lo).rgb*.55+vec3(.01,.011,.013);" +
      "vec3 c=mix(glass,drop,w);float sl=length(n.xy);" +
      "c*=1.-.48*smoothstep(.68,.98,sl)*w;" +
      "c+=vec3(.78,.84,.95)*.06*smoothstep(.35,.9,sl)*w*clamp(.3-n.y*1.6,0.,1.);" +
      "c+=vec3(1.)*pow(max(dot(n,normalize(vec3(-.4,.55,.75))),0.),110.)*.28*w;" +
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
      P = {
        light: prog(VS_LIGHT, FS_LIGHT, ["corner", "l0", "l1"]), quad: prog(VS_QUAD, FS_QUAD, ["q"]),
        drop: prog(VS_DROP, FS_DROP, ["corner", "d0", "d1"]), wipe: prog(VS_FULL, FS_WIPE, ["p"]),
        comp: prog(VS_FULL, FS_COMP, ["p"]),
      };
    } catch (e) {
      if (window.console) console.warn("intro: water off, falling back —", e && e.message);
      return null;
    }

    var tri = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tri);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var unit = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, unit);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    var dropBuf = gl.createBuffer(), dropN = 0, lightBuf = gl.createBuffer(), lightN = 0;
    var CORNERS = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];

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
    function free(o) { if (o) { gl.deleteTexture(o.t); if (o.f) gl.deleteFramebuffer(o.f); } }

    // seeded so every load sprays the same handsome pattern
    function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

    function genDrops(Wc, Hc) {
      var r = rng(7), area = Wc * Hc;
      var gauss = function () { return Math.sqrt(-2 * Math.log(r() || 1e-6)) * Math.cos(6.2832 * r()); };
      var bursts = [
        { x: 0.28 * Wc, y: 0.40 * Hc, t: W_T.bursts[0] },
        { x: 0.68 * Wc, y: 0.36 * Hc, t: W_T.bursts[1] },
        { x: 0.50 * Wc, y: 0.68 * Hc, t: W_T.bursts[2] },
      ];
      // [count, rMin, rMax, runner share]: mist → fat drops; the heavy ones run
      var groups = [[area / 120, 0.7, 2.2, 0], [area / 900, 2.2, 4.5, 0], [area / 3200, 4.5, 8.5, 0.08], [area / 22000, 8, 12.5, 0.45]];
      var out = [];
      var push = function (x, y, rad, t0, seed, kind, runT, acc) {
        for (var k = 0; k < 6; k++) out.push(CORNERS[k * 2], CORNERS[k * 2 + 1], x, y, rad, t0, seed, kind, runT, acc);
      };
      groups.forEach(function (g) {
        var n = Math.round(g[0]);
        for (var i = 0; i < n; i++) {
          var b = bursts[Math.floor(r() * 3)], x, y;
          if (r() < 0.82) { x = b.x + gauss() * 0.26 * Wc; y = b.y + gauss() * 0.24 * Hc; }
          else { x = r() * Wc; y = r() * Hc; }
          x = Math.max(-20, Math.min(Wc + 20, x)); y = Math.max(-20, Math.min(Hc + 20, y));
          var rad = g[1] + (g[2] - g[1]) * r() * r();
          var t0 = b.t + Math.hypot(x - b.x, y - b.y) / 3000 + r() * 0.06;
          var seed = r();
          if (r() < g[3]) {
            var runT = t0 + 0.14 + r() * 0.22, acc = 260 + r() * 520;
            push(x, y, rad, t0, seed, 2, runT, acc);   // its wet trail first, under it
            push(x, y, rad, t0, seed, 1, runT, acc);
          } else {
            push(x, y, rad, t0, seed, 0, 0, 0);
          }
        }
      });
      dropN = out.length / 10;
      gl.bindBuffer(gl.ARRAY_BUFFER, dropBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.STATIC_DRAW);
    }

    // the night at three depths. Focus is on the glass, so every light out
    // there is near infinity: bokeh discs come out about the same size — depth
    // reads as brightness and parallax speed (far drift, near traffic flies)
    function genLights() {
      var r = rng(11), out = [];
      var PAL = [[1.0, 0.52, 0.16], [0.86, 0.9, 1.0], [1.0, 0.1, 0.06], [1.0, 0.68, 0.24], [0.32, 0.46, 1.0], [0.25, 0.9, 0.55]];
      var LAYERS = [ // count, rMin, rMax (frac of min side), speed (W/s), gain, y band
        [13, 0.026, 0.038, 0.25, 0.26, [0.30, 0.60]],
        [9, 0.032, 0.048, 0.75, 0.46, [0.22, 0.78]],
        [4, 0.045, 0.065, 1.6, 0.5, [0.18, 0.86]],
      ];
      LAYERS.forEach(function (L) {
        for (var i = 0; i < L[0]; i++) {
          var c = PAL[r() < 0.93 ? Math.floor(r() * 5) : 5], k = L[4] * (0.55 + r() * 0.6);
          var rad = L[1] + (L[2] - L[1]) * r(), sp = L[3] * (0.8 + r() * 0.4);
          var y = L[5][0] + (L[5][1] - L[5][0]) * r(), st = 1 + sp * 0.35, x0 = r() * 1.7;
          for (var j = 0; j < 6; j++) out.push(CORNERS[j * 2], CORNERS[j * 2 + 1], x0, y, rad, sp, c[0] * k, c[1] * k, c[2] * k, st);
        }
      });
      lightN = out.length / 10;
      gl.bindBuffer(gl.ARRAY_BUFFER, lightBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.STATIC_DRAW);
    }

    var bg = [parseInt(bgHex.slice(1, 3), 16) / 255, parseInt(bgHex.slice(3, 5), 16) / 255, parseInt(bgHex.slice(5, 7), 16) / 255];
    var ease = { wipe: bezier(0.45, 0, 0.2, 1), drive: bezier(0.16, 1, 0.3, 1) };

    var S = null, parts = [], dpr = 1, Wc = 0, Hc = 0, wipeN = [0, 0], cMin = 0, cMax = 0;
    var raf = 0, t0 = 0, lastT = 0, dead = false;

    function layout(set, mw, PARTS) {
      Wc = set.clientWidth; Hc = set.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      cv.width = Math.round(Wc * dpr); cv.height = Math.round(Hc * dpr);
      if (S) { free(S.a); free(S.b); free(S.h); }
      var hs = Math.min(1, 1.5 / dpr);
      S = { a: fbo(cv.width, cv.height), b: fbo(cv.width, cv.height), h: fbo(Math.round(cv.width * hs), Math.round(cv.height * hs)) };
      var lk = mw.offsetParent, mx = lk.offsetLeft + mw.offsetLeft, my = lk.offsetTop + mw.offsetTop;
      var k = mw.offsetWidth / PARTS.w;
      parts.forEach(function (q) { gl.deleteTexture(q.tex); if (q.stex) gl.deleteTexture(q.stex); });
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
        var o = { rect: [mx + q.x * k, my + q.y * k, q.w * k, q.h * k], stripe: !!q.smear };
        if (q.smear) { // markup order per stripe: smear, then sharp
          o.srect = [o.rect[0] - q.padL * k, o.rect[1], (q.w + q.padL + q.padR) * k, o.rect[3]];
          o.stex = raster(imgs[ii++], o.srect[2], o.srect[3]);
        }
        o.tex = raster(imgs[ii++], o.rect[2], o.rect[3]);
        return o;
      });
      // the wipe: a front leaning like the exit line, travelling right
      var a = 12 * Math.PI / 180;
      wipeN = [Math.cos(a), Math.sin(a)];
      var ds = [0, wipeN[0] * Wc, wipeN[1] * Hc, wipeN[0] * Wc + wipeN[1] * Hc];
      cMin = Math.min.apply(null, ds) - 40; cMax = Math.max.apply(null, ds) + 140;
      genDrops(Wc, Hc);
      genLights();
    }

    function attrib10(buf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 40, 0);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 40, 8);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24);
    }
    function attribFull(prg) {
      gl.useProgram(prg.p);
      gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
      gl.bindBuffer(gl.ARRAY_BUFFER, tri);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    }
    function quad(texId, rect, a, ghost, W) {
      var q = P.quad;
      gl.uniform4f(q.u("uRect"), rect[0], rect[1], rect[2], rect[3]);
      gl.uniform1f(q.u("uA"), a);
      gl.uniform1f(q.u("uGhost"), ghost);
      gl.uniform3f(q.u("uW"), W[0], W[1], W[2]);
      gl.bindTexture(gl.TEXTURE_2D, texId);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // the scene behind/on the glass: night lights (bokeh or focused) + the mark
    function scene(target, sharp, t, W, lightsK, spray) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.f);
      gl.viewport(0, 0, target.w, target.h);
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (lightsK > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        var Lp = P.light;
        gl.useProgram(Lp.p);
        attrib10(lightBuf);
        gl.uniform2f(Lp.u("uRes"), Wc, Hc);
        gl.uniform1f(Lp.u("uT"), t);
        gl.uniform1f(Lp.u("uSharp"), sharp ? 1 : 0);
        gl.uniform1f(Lp.u("uK"), lightsK);
        gl.drawArrays(gl.TRIANGLES, 0, lightN);
        gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(P.quad.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, unit);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(P.quad.u("uRes"), Wc, Hc);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(P.quad.u("uTex"), 0);
      var si = 0;
      parts.forEach(function (o) {
        if (!o.stripe) {
          var wpp = ease.drive(clamp01((t - W_T.word) / W_T.wordDur));
          var dx = -0.04 * o.rect[2] * (1 - wpp);
          quad(o.tex, [o.rect[0] + dx, o.rect[1], o.rect[2], o.rect[3]], 1, 0.09 * spray, W);
          return;
        }
        var p = clamp01((t - W_T.drive[si++]) / W_T.driveDur);
        var off = -0.95 * o.rect[2] * (1 - ease.drive(p));
        var sa = keys(p, [[0, 1], [0.3, 0.9], [0.62, 0], [1, 0]]);
        var ha = keys(p, [[0, 0], [0.26, 0], [0.58, 1], [1, 1]]);
        if (sa > 0) quad(o.stex, [o.srect[0] + off, o.srect[1], o.srect[2], o.srect[3]], sa, 0, W);
        if (ha > 0) quad(o.tex, [o.rect[0] + off, o.rect[1], o.rect[2], o.rect[3]], ha, 0, W);
      });
      gl.disable(gl.BLEND);
    }

    function render(t) {
      lastT = t;
      var wp = ease.wipe(clamp01((t - W_T.wipe) / W_T.wipeDur));
      var W = [wipeN[0], wipeN[1], cMin + (cMax - cMin) * wp];
      var spray = clamp01((t - W_T.bursts[0]) / 0.45);
      var lightsK = 1 - clamp01((t - W_T.wipe) / 0.7);

      // 1 the night twice: as the camera sees it (bokeh) and as a drop refocuses it
      scene(S.a, false, t, W, lightsK, spray);
      scene(S.b, true, t, W, lightsK, spray);

      // 2 water height field: drops + trails (additive) → wiped side erased → bead
      gl.bindFramebuffer(gl.FRAMEBUFFER, S.h.f);
      gl.viewport(0, 0, S.h.w, S.h.h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      var D = P.drop;
      gl.useProgram(D.p);
      attrib10(dropBuf);
      gl.uniform1f(D.u("uT"), t);
      gl.uniform2f(D.u("uRes"), Wc, Hc);
      gl.uniform3f(D.u("uW"), W[0], W[1], W[2]);
      gl.drawArrays(gl.TRIANGLES, 0, dropN);

      attribFull(P.wipe);
      gl.uniform2f(P.wipe.u("uRes"), Wc, Hc);
      gl.uniform3f(P.wipe.u("uW"), W[0], W[1], W[2]);
      gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
      gl.uniform1f(P.wipe.u("uMode"), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (wp > 0 && wp < 1) {
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.uniform1f(P.wipe.u("uMode"), 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);

      // 3 composite: through the glass at the bokeh, through each drop at the focused night
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cv.width, cv.height);
      var Cp = P.comp;
      attribFull(Cp);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.a.t);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, S.b.t);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, S.h.t);
      gl.uniform1i(Cp.u("uA"), 0);
      gl.uniform1i(Cp.u("uB"), 1);
      gl.uniform1i(Cp.u("uH"), 2);
      gl.uniform2f(Cp.u("uRes"), Wc, Hc);
      gl.uniform2f(Cp.u("uTx"), 1 / S.h.w, 1 / S.h.h);
      gl.uniform3f(Cp.u("uW"), W[0], W[1], W[2]);
      gl.uniform1f(Cp.u("uLens"), 0.085 * Math.min(Wc, Hc));
      gl.uniform1f(Cp.u("uSlope"), 6);
      gl.uniform1f(Cp.u("uWet"), spray);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    }

    var api = {
      onDone: null,
      prepare: function (set, mw, PARTS) {
        if (dead) return false;
        try {
          layout(set, mw, PARTS);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, cv.width, cv.height);
          gl.clearColor(bg[0], bg[1], bg[2], 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          window.addEventListener("resize", function () {
            if (dead) return;
            try { layout(set, mw, PARTS); render(lastT); } catch (e) { api.finish(); }
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
          if (t >= W_T.handoff) api.finish();
          else raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      renderAt: function (t) {
        if (dead) return;
        try { render(t); } catch (e) { api.finish(); return; }
        if (t >= W_T.handoff) api.finish();
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

  // water needs WebGL; without it Autobahn falls back to the line reveal
  var wcv = null, water = null;
  if (cfg.water && PARTS && !reduced) {
    wcv = document.createElement("canvas");
    wcv.className = "bi-wcv";
    wcv.setAttribute("aria-hidden", "true");
    water = makeWater(wcv, bg);
  }
  if (water) T = { pull: W_T.wipe, pullDur: W_T.wipeDur, sub: 1.28, glint: 1.56, rule: 1.26, exit: 2.95, exitDur: 0.55 };

  var el = document.createElement("div");
  el.id = "brandIntro";
  el.className = "bi-" + pull + (reduced ? " bi-reduced" : " bi-hold") + (water ? " bi-wet" : "");
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
    : water
    ? '<div class="bi-pane">' + win("x", setHTML + skipHTML) + "</div>" + bladeHTML("out")
    : pull === "cut"
    ? heatFx + '<div class="bi-pane">' + rawHTML + setHTML + skipHTML + "</div>" + '<div class="bi-cutblade"></div>'
    : heatFx + '<div class="bi-pane">' + win("x", rawHTML + win("r", setHTML) + skipHTML) + "</div>" +
      bladeHTML("in") + bladeHTML("out");
  if (water) {
    var setEl = el.querySelector(".bi-set");
    setEl.insertBefore(wcv, setEl.firstChild);
    water.onDone = function () { el.classList.remove("bi-wet"); wcv.style.visibility = "hidden"; };
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
    // water canvas sits under the DOM lockup; the DOM parts wait for the handoff
    "#brandIntro .bi-wcv{position:absolute;left:0;top:0;width:100%;height:100%;display:block;z-index:0}",
    "#brandIntro .bi-set .bi-lock{z-index:1}",
    "#brandIntro.bi-wet .bi-parts .bi-pt{visibility:hidden}",
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
    } else if (pull === "forward" && water) {
      R.push(
        // the GL drove the stripes; the DOM lockup it hands off to is the parked state
        "#brandIntro .bi-strp .bi-smear{visibility:hidden}",
        "#brandIntro .bi-bloom{animation:biBloom 1.1s ease-out " + (W_T.wipe + 0.5) + "s both}",
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
  // water: textures + spray pattern are built once everything is decoded
  if (water) ready.then(function () {
    water.prepare(el.querySelector(".bi-set"), el.querySelector(".bi-set .bi-parts"), PARTS);
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
    if (water) water.finish(); // a skip mid-spray lands on the finished DOM lockup
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
      ready.then(function () { el.classList.remove("bi-hold"); if (water) water.finish(); requestAnimationFrame(function () {
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
        if (water) water.renderAt(dt / 1000);
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
      if (water) water.start();
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
