// Animated brand opener — "the pull". Every tint customer has watched an
// installer squeegee film across glass: raw glare on one side of the edge,
// calm clear glass on the other. The opener IS that stroke. It opens on
// unfiltered light, a film edge pulls across the screen, and the brand mark
// is revealed crisp behind it; the exit pulls the pane away to hand off to
// the app. Each brand plays the same stroke in its own language:
//   down    (Hüper)    heat shimmer + warm glare, film pulled down the pane
//   forward (Autobahn) night flare + speed streaks, fast forward-leaning pull,
//                      road lanes draw in the wake
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

  var pull = cfg.pull || (cfg.kind === "strike" ? "cut" : cfg.roadVector ? "forward" : "down");
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
    forward: { pull: 0.34, pullDur: 0.62, rule: 0.86, sub: 0.98, glint: 1.62, exit: 2.45, exitDur: 0.55 },
    cut:     { blade: 0.14, bladeDur: 0.46, pull: 0.50, pullDur: 0.68, land: 0.98, landDur: 0.52,
               sub: 1.30, glint: 1.80, exit: 2.55, exitDur: 0.55 },
  }[pull];

  // ---------------------------------------------------------------- glass
  // Hüper + Autobahn: the mark is already there; brand-tinted "liquid glass"
  // crosses it at an angle — the mark seen through it refracts (magnified,
  // softened, tinted) — then the mark shimmers. Hüper is a quick diagonal band
  // (a flash of green); Autobahn is a red slab. Edge keeps its cut.
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
    // Autobahn: brand-red glass. (Smoked/dark glass was invisible on the black
    // field — it read as a static logo, i.e. "unchanged".) Glass on black is
    // only seen by its light: lit rim, edge-pooled red, glow, specular.
    autobahn: {
      ang: -10, at: 0.28, dur: 1.15, ease: "cubic-bezier(.2,.8,.8,.2)", radius: 34, wFrac: 0.5, hMul: 2.15, mag: 1.12,
      tint: "linear-gradient(158deg,rgba(255,74,52,.34),rgba(196,18,16,.18) 50%,rgba(255,96,44,.32))",
      edge: "inset 0 0 36px rgba(255,40,24,.66)",
      rim: "inset 0 1.5px 0 rgba(255,226,216,.95),inset 0 0 0 1.5px rgba(255,142,112,.72),inset 0 -3px 10px rgba(80,0,0,.45)",
      drop: "0 0 64px -4px rgba(255,40,24,.58),0 0 130px -12px rgba(255,30,20,.36)",
      refract: "blur(1.6px) saturate(1.35) brightness(1.06)",
      spec: 0.55, sheen: "rgba(255,255,255,.62)",
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

  // ---------------------------------------------------------------- markup
  var ROAD_SVG =
    '<div class="bi-road" aria-hidden="true"><svg class="bi-lane bi-lane0" viewBox="0 0 1200 348"><defs><mask id="biM0"><path d="M 191 393 L 161 330 L 152 312 L 148 294 L 144 276 L 143 258 L 144 240 L 147 222 L 154 204 L 162 186 L 176 168 L 192 150 L 214 132 L 242 114 L 340 82 L 370 73 L 400 66 L 430 61 L 460 58 L 490 54 L 520 52 L 550 50 L 580 48 L 610 47 L 640 46 L 670 46 L 700 46 L 730 47 L 760 48 L 810 48" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" fill="none" stroke="#fff" stroke-width="310" stroke-linecap="butt" stroke-linejoin="round" class="bi-spine bi-spine0"/></mask></defs><g mask="url(#biM0)"><g><g transform="translate(0,348) scale(0.1,-0.1)"><path d="M5455 3059 c-1083 -30 -2107 -165 -2817 -370 -919 -265 -1573 -655 -2043 -1219 -222 -267 -421 -682 -476 -994 -20 -114 -26 -285 -10 -302 6 -5 573 -8 1512 -6 l1502 2 -49 53 c-100 106 -361 487 -441 644 -360 703 48 1361 1057 1706 717 246 1827 370 3555 397 761 12 845 17 585 36 -749 54 -1633 74 -2375 53z" fill="#ff0a0c"/></g></g></g></svg><svg class="bi-lane bi-lane1" viewBox="0 0 1200 348"><defs><mask id="biM1"><path d="M 356 211 L 425 221 L 450 224 L 475 228 L 500 224 L 525 219 L 550 205 L 575 202 L 600 204 L 625 203 L 650 201 L 675 192 L 651 115 L 670 100 L 699 85 L 800 68 L 825 66 L 850 65 L 875 64 L 900 64 L 925 64 L 950 64 L 1000 65" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" fill="none" stroke="#fff" stroke-width="320" stroke-linecap="butt" stroke-linejoin="round" class="bi-spine bi-spine1"/></mask></defs><g mask="url(#biM1)"><g><g transform="translate(0,348) scale(0.1,-0.1)"><path d="M7640 2883 c-30 -1 -152 -7 -270 -13 -384 -19 -1125 -79 -1435 -116 -358 -42 -569 -101 -605 -168 -6 -13 -13 -48 -14 -79 -3 -75 -16 -87 -144 -138 -699 -278 -1037 -680 -991 -1180 30 -322 242 -676 579 -968 l65 -56 1284 3 1285 2 -210 126 c-708 424 -1124 775 -1220 1029 -101 271 -67 447 126 636 391 382 1084 631 2140 768 396 51 991 91 1380 91 420 1 205 22 -560 55 -290 13 -1218 18 -1410 8z" fill="#ff0a0c"/></g></g></g></svg><svg class="bi-lane bi-lane2" viewBox="0 0 1200 348"><defs><mask id="biM2"><path d="M 1250 334 L 1180 328 L 1155 326 L 1130 324 L 1105 322 L 1080 320 L 1055 302 L 1030 290 L 1005 281 L 980 274 L 955 269 L 930 264 L 905 261 L 880 256 L 855 252 L 830 248 L 805 242 L 780 231 L 755 213 L 730 204 L 705 200 L 680 195 L 655 191 L 606 183" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" fill="none" stroke="#fff" stroke-width="300" stroke-linecap="butt" stroke-linejoin="round" class="bi-spine bi-spine2"/></mask></defs><g mask="url(#biM2)"><g><g transform="translate(0,348) scale(0.1,-0.1)"><path d="M9605 2704 c-33 -2 -152 -8 -265 -14 -1070 -56 -2197 -307 -2606 -580 -106 -71 -250 -218 -292 -297 -53 -101 -59 -261 -15 -398 110 -341 527 -714 1280 -1145 l191 -110 2051 0 c1195 0 2051 4 2051 9 0 5 -10 11 -22 14 -31 8 -282 56 -343 67 -398 68 -1052 192 -1900 361 -1106 220 -1764 482 -2091 832 -121 128 -153 267 -93 397 85 182 418 394 830 528 464 151 1174 259 1918 292 130 6 265 14 301 18 l65 6 -100 7 c-119 8 -874 18 -960 13z" fill="#ffcf00"/></g></g></g></svg></div>';

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }

  // the mark itself — identical structure in both layers so the raw (glare)
  // and set (filmed) marks sit pixel-for-pixel on top of each other
  var LOGO_DIMS = { "assets/intro-huper-word.png": [765, 125], "assets/plate-autobahn.png": [1200, 208] };
  var dimAttr = LOGO_DIMS[cfg.logo] ? ' width="' + LOGO_DIMS[cfg.logo][0] + '" height="' + LOGO_DIMS[cfg.logo][1] + '"' : "";
  function markHTML(layer) {
    var glint = layer === "set"
      ? '<div class="bi-glint" style="-webkit-mask-image:url(\'' + cfg.logo + '\');mask-image:url(\'' + cfg.logo + '\')"><span></span></div>'
      : "";
    if (pull === "cut") {
      return '<div class="bi-markwrap"><div class="bi-mark" style="background-image:url(\'' + cfg.logo + '\')"></div>' + glint + "</div>";
    }
    return '<div class="bi-markwrap bi-markwrap-word">' +
      '<img class="bi-mark-img" src="' + cfg.logo + '"' + dimAttr + ' alt="" draggable="false">' + glint + "</div>";
  }

  function subHTML() {
    if (!cfg.sub) return "";
    var out = "";
    var chars = Array.from(cfg.sub);
    for (var i = 0; i < chars.length; i++) {
      var c = chars[i] === " " ? "&nbsp;" : esc(chars[i]);
      out += '<span style="--i:' + i + '">' + c + "</span>";
    }
    return '<div class="bi-sub">' + out + "</div>";
  }

  function lockHTML(layer) {
    // the lanes live in the set layer ONLY: their masks use fixed ids, and a
    // second copy would make url(#biM0) resolve to the raw layer's unanimated
    // mask. The raw layer keeps an empty box so both lockups stay aligned.
    var road = !cfg.roadVector ? "" :
      layer === "set" ? ROAD_SVG :
      layer === "copy" ? ROAD_SVG.replace(/biM(\d)/g, "biMg$1") :
      '<div class="bi-road"></div>';
    return '<div class="bi-lock">' +
      road +
      markHTML(layer) +
      (cfg.rule === false ? "" : '<div class="bi-rule"></div>') +
      subHTML() +
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

  var el = document.createElement("div");
  el.id = "brandIntro";
  el.className = "bi-" + pull + (reduced ? " bi-reduced" : " bi-hold");
  el.setAttribute("role", "presentation");
  el.setAttribute("aria-hidden", "true");
  var rawHTML = '<div class="bi-raw"><div class="bi-glare"></div>' + streaks + lockHTML("raw") + "</div>";
  var setHTML = '<div class="bi-set">' + lockHTML("set") + "</div>";
  var skipHTML = '<div class="bi-skip">Click to skip</div>';
  var glassHTML = glass
    ? '<div class="bi-gfr"><div class="bi-gmv"><div class="bi-gcard">' +
      '<div class="bi-gin"><div class="bi-gj">' + lockHTML("copy") + "</div></div>" +
      '<div class="bi-gtint"></div><div class="bi-gsheen"></div></div></div></div>'
    : "";
  el.innerHTML = glass
    ? '<div class="bi-pane">' + win("x", setHTML + glassHTML + skipHTML) + "</div>" + bladeHTML("out")
    : pull === "cut"
    ? heatFx + '<div class="bi-pane">' + rawHTML + setHTML + skipHTML + "</div>" + '<div class="bi-cutblade"></div>'
    : heatFx + '<div class="bi-pane">' + win("x", rawHTML + win("r", setHTML) + skipHTML) + "</div>" +
      bladeHTML("in") + bladeHTML("out");

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
    "#brandIntro .bi-lock{position:relative;width:min(" + (pull === "cut" ? "62vw,500px" : "74vw,560px") + ");text-align:center}",
    // mark
    "#brandIntro .bi-markwrap{position:relative;width:100%;margin:0 auto}",
    "#brandIntro .bi-markwrap-word{line-height:0}",
    "#brandIntro .bi-mark-img{width:100%;height:auto;display:block}",
    "#brandIntro .bi-mark{position:absolute;inset:0;background-size:contain;background-position:center;background-repeat:no-repeat}",
    pull === "cut" ? "#brandIntro .bi-markwrap{aspect-ratio:600/296;width:88%}" : "",
    // road (Autobahn)
    "#brandIntro .bi-road{position:relative;width:86%;margin:0 auto 10px;aspect-ratio:1200/348}",
    "#brandIntro .bi-lane{position:absolute;inset:0;width:100%;height:100%}",
    // rule + tagline
    "#brandIntro .bi-rule{height:3px;background:" + accent + ";margin:18px auto 0;width:100%;border-radius:2px;transform-origin:left center}",
    "#brandIntro .bi-sub{margin-top:16px;color:" + fg + ";font-family:" + font + ";white-space:nowrap;" +
    "width:max-content;max-width:94vw;position:relative;left:50%;transform:translateX(-50%);" +
    "font-size:clamp(10px,1.5vw,14px);font-weight:600;letter-spacing:clamp(.22em,1.25vw,.5em);text-indent:clamp(.22em,1.25vw,.5em)}",
    "#brandIntro .bi-sub span{display:inline-block}",
    // glint
    "#brandIntro .bi-glint{position:absolute;inset:0;-webkit-mask-size:100% 100%;mask-size:100% 100%;overflow:hidden;pointer-events:none}",
    "#brandIntro .bi-glint span{position:absolute;top:-10%;bottom:-10%;width:30%;" +
    "background:linear-gradient(105deg,transparent," + (dark ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.95)") + " 50%,transparent);" +
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
      "background:radial-gradient(38% 20% at 50% 44%,rgba(255,236,220,.55),rgba(255,90,60,.22) 45%,transparent 75%)," +
      "linear-gradient(180deg,transparent 41%,rgba(255,110,80,.28) 44.5%,rgba(255,240,230,.65) 45%,rgba(255,110,80,.28) 45.5%,transparent 49%)}",
      "#brandIntro .bi-raw .bi-road{visibility:hidden}",
      "#brandIntro .bi-raw .bi-mark-img{filter:brightness(2.4) saturate(0) blur(1.6px);opacity:.45}",
      "#brandIntro .bi-raw .bi-rule,#brandIntro .bi-raw .bi-sub{visibility:hidden}",
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
      "#brandIntro .bi-bout{opacity:0}#brandIntro.bi-exit .bi-bout{opacity:1}"
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
      // the lanes are part of the mark here — drawn from the start
      "#brandIntro .bi-spine{stroke-dashoffset:0}"
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
    } else if (pull === "forward") {
      R.push(
        "#brandIntro .bi-rw{animation:biRWf " + pd + " " + ease + " " + p + " both}",
        "#brandIntro .bi-ri{animation:biRIf " + pd + " " + ease + " " + p + " both}",
        "#brandIntro .bi-bin{animation:biRWf " + pd + " " + ease + " " + p + " both}",
        "@keyframes biRWf{from{transform:translateX(-100%)}to{transform:translateX(0)}}",
        "@keyframes biRIf{from{transform:translateX(100%)}to{transform:translateX(0)}}",
        // headlight streaks race past in the raw night before the pull
        "#brandIntro .bi-streak{animation:biStreak .42s cubic-bezier(.5,0,.5,1) infinite}",
        "#brandIntro .bi-streak1{animation-delay:.12s}#brandIntro .bi-streak2{animation-delay:.05s;animation-duration:.36s}" +
        "#brandIntro .bi-streak3{animation-delay:.2s}#brandIntro .bi-streak4{animation-delay:.28s}#brandIntro .bi-streak5{animation-delay:.16s}",
        "@keyframes biStreak{0%{opacity:0;transform:translateX(-110%)}20%{opacity:1}80%{opacity:1}100%{opacity:0;transform:translateX(280%)}}",
        // the lanes draw in the wake of the pull
        "#brandIntro .bi-set .bi-spine{animation:biDraw .62s cubic-bezier(.3,.9,.25,1) forwards}",
        "#brandIntro .bi-set .bi-spine0{animation-delay:" + (T.pull + 0.18) + "s}" +
        "#brandIntro .bi-set .bi-spine1{animation-delay:" + (T.pull + 0.31) + "s}" +
        "#brandIntro .bi-set .bi-spine2{animation-delay:" + (T.pull + 0.44) + "s}",
        "@keyframes biDraw{to{stroke-dashoffset:0}}"
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
      "#brandIntro .bi-sub span{opacity:.85}",
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
      var mw = lock.querySelector(".bi-markwrap"), rd = lock.querySelector(".bi-road");
      var top = lock.offsetTop + (rd ? rd.offsetTop : mw.offsetTop);
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

  // ---------------------------------------------------------------- lifecycle
  var done = false;
  function finish() {
    el.remove();
    css.remove();
  }
  function dismiss() {
    if (done) return;
    done = true;
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
      ready.then(function () { el.classList.remove("bi-hold"); requestAnimationFrame(function () {
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
      ready.then(function () { el.classList.remove("bi-hold"); requestAnimationFrame(freeze); });
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
