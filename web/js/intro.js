// Animated brand opener — the official mark genuinely rebuilt, not a masked
// image: each road lane is a traced vector path that draws along its own spine,
// and the wordmark letters (sliced from the official art) rise in one by one.
// Config-driven from BRANDS[brand].intro; plays every load (masks the 3D model
// load); skip on any input; ?introDebug=<ms> freezes for review; ?nointro=1 off.
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

  var ROAD_SVG =
    '<div class="bi-road" aria-hidden="true"><svg class="bi-lane bi-lane0" viewBox="0 0 1200 348"><defs><mask id="biM0"><path d="M 30 288 L 60 265 L 90 250 L 120 238 L 150 228 L 180 220 L 210 214 L 240 208 L 270 195 L 300 140 L 330 85 L 360 76 L 390 69 L 420 63 L 450 59 L 480 55 L 510 52 L 540 51 L 570 49 L 600 48 L 630 47 L 660 47 L 690 47 L 720 47 L 750 47 L 780 48" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" fill="none" stroke="#fff" stroke-width="310" stroke-linecap="round" stroke-linejoin="round" class="bi-spine bi-spine0"/></mask></defs><g mask="url(#biM0)"><g><g transform="translate(0,348) scale(0.1,-0.1)"><path d="M5455 3059 c-1083 -30 -2107 -165 -2817 -370 -919 -265 -1573 -655 -2043 -1219 -222 -267 -421 -682 -476 -994 -20 -114 -26 -285 -10 -302 6 -5 573 -8 1512 -6 l1502 2 -49 53 c-100 106 -361 487 -441 644 -360 703 48 1361 1057 1706 717 246 1827 370 3555 397 761 12 845 17 585 36 -749 54 -1633 74 -2375 53z" fill="#ff0a0c"/></g></g></g></svg><svg class="bi-lane bi-lane1" viewBox="0 0 1200 348"><defs><mask id="biM1"><path d="M 420 220 L 450 225 L 480 229 L 510 222 L 540 207 L 570 203 L 600 204 L 630 204 L 660 197 L 690 183 L 720 140 L 750 73 L 780 70 L 810 68 L 840 66 L 870 64 L 900 64 L 930 64 L 960 64" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" fill="none" stroke="#fff" stroke-width="320" stroke-linecap="round" stroke-linejoin="round" class="bi-spine bi-spine1"/></mask></defs><g mask="url(#biM1)"><g><g transform="translate(0,348) scale(0.1,-0.1)"><path d="M7640 2883 c-30 -1 -152 -7 -270 -13 -384 -19 -1125 -79 -1435 -116 -358 -42 -569 -101 -605 -168 -6 -13 -13 -48 -14 -79 -3 -75 -16 -87 -144 -138 -699 -278 -1037 -680 -991 -1180 30 -322 242 -676 579 -968 l65 -56 1284 3 1285 2 -210 126 c-708 424 -1124 775 -1220 1029 -101 271 -67 447 126 636 391 382 1084 631 2140 768 396 51 991 91 1380 91 420 1 205 22 -560 55 -290 13 -1218 18 -1410 8z" fill="#ff0a0c"/></g></g></g></svg><svg class="bi-lane bi-lane2" viewBox="0 0 1200 348"><defs><mask id="biM2"><path d="M 660 192 L 690 197 L 720 203 L 750 208 L 780 231 L 810 243 L 840 250 L 870 255 L 900 259 L 930 265 L 960 272 L 990 274 L 1020 285 L 1050 302 L 1080 320 L 1110 323 L 1140 325 L 1170 328" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" fill="none" stroke="#fff" stroke-width="300" stroke-linecap="round" stroke-linejoin="round" class="bi-spine bi-spine2"/></mask></defs><g mask="url(#biM2)"><g><g transform="translate(0,348) scale(0.1,-0.1)"><path d="M9605 2704 c-33 -2 -152 -8 -265 -14 -1070 -56 -2197 -307 -2606 -580 -106 -71 -250 -218 -292 -297 -53 -101 -59 -261 -15 -398 110 -341 527 -714 1280 -1145 l191 -110 2051 0 c1195 0 2051 4 2051 9 0 5 -10 11 -22 14 -31 8 -282 56 -343 67 -398 68 -1052 192 -1900 361 -1106 220 -1764 482 -2091 832 -121 128 -153 267 -93 397 85 182 418 394 830 528 464 151 1174 259 1918 292 130 6 265 14 301 18 l65 6 -100 7 c-119 8 -874 18 -960 13z" fill="#ffcf00"/></g></g></g></svg></div>';

  var el = document.createElement("div");
  el.id = "brandIntro";
  el.setAttribute("role", "presentation");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML =
    '<div class="bi-inner">' +
    (cfg.roadVector ? ROAD_SVG : "") +
    '  <div class="bi-word" style="background:none"><span class="bi-l bi-l0"></span><span class="bi-l bi-l1"></span><span class="bi-l bi-l2"></span><span class="bi-l bi-l3"></span><span class="bi-l bi-l4"></span><span class="bi-l bi-l5"></span><span class="bi-l bi-l6"></span><span class="bi-l bi-l7"></span><span class="bi-l bi-l8"></span>' +
    '    <div class="bi-glint" style="-webkit-mask-image:url(\'' + cfg.logo + '\');mask-image:url(\'' + cfg.logo + '\')"><span></span></div>' +
    "  </div>" +
    '  <div class="bi-line"></div>' +
    (cfg.sub ? '  <div class="bi-sub">' + cfg.sub + "</div>" : "") +
    "</div>" +
    '<div class="bi-skip">Click to skip</div>';

  var css = document.createElement("style");
  css.textContent =
    "#brandIntro{position:fixed;inset:0;z-index:9999;background:" + (cfg.bg || "#0a0a0b") + ";" +
    "display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:1;transition:opacity .45s ease}" +
    "#brandIntro.bi-out{opacity:0;pointer-events:none}" +
    "#brandIntro .bi-inner{position:relative;width:min(72vw,520px);text-align:center;" +
    (reduced ? "" : "animation:biRise .9s cubic-bezier(.2,.7,.2,1) both") + "}" +
    "#brandIntro.bi-out .bi-inner{transform:scale(1.04);transition:transform .45s ease}" +
    "#brandIntro .bi-road{position:relative;width:86%;margin:0 auto 10px;aspect-ratio:1200/348}" +
    "#brandIntro .bi-lane{position:absolute;inset:0;width:100%;height:100%;will-change:transform,opacity}" +
    (reduced ? "#brandIntro .bi-spine{animation:none!important;stroke-dashoffset:0!important}" : "#brandIntro .bi-spine{animation:biDraw .6s cubic-bezier(.3,.9,.25,1) forwards}#brandIntro .bi-spine0{animation-delay:.6s}#brandIntro .bi-spine1{animation-delay:.74s}#brandIntro .bi-spine2{animation-delay:.88s}") +
    "#brandIntro .bi-word{position:relative;display:flex;align-items:flex-start;width:100%}" +
    "#brandIntro .bi-l{display:block;background-image:url('" + cfg.logo + "');background-repeat:no-repeat;" +
    (reduced ? "" : "opacity:0;transform:translateY(.35em);will-change:transform,opacity;animation:biLetter .38s cubic-bezier(.2,.7,.2,1) forwards;") + "}" +
    (reduced ? "" : "#brandIntro .bi-l0{margin-left:2.917%;width:10.417%;aspect-ratio:0.6010;background-size:960.00% 100%;background-position-x:3.256%;animation-delay:0.05s}#brandIntro .bi-l1{margin-left:1.833%;width:10.333%;aspect-ratio:0.5962;background-size:967.74% 100%;background-position-x:16.914%;animation-delay:0.10s}#brandIntro .bi-l2{margin-left:1.333%;width:6.583%;aspect-ratio:0.3798;background-size:1518.99% 100%;background-position-x:28.724%;animation-delay:0.14s}#brandIntro .bi-l3{margin-left:1.333%;width:10.417%;aspect-ratio:0.6010;background-size:960.00% 100%;background-position-x:38.791%;animation-delay:0.18s}#brandIntro .bi-l4{margin-left:1.583%;width:10.417%;aspect-ratio:0.6010;background-size:960.00% 100%;background-position-x:52.186%;animation-delay:0.23s}#brandIntro .bi-l5{margin-left:1.083%;width:10.333%;aspect-ratio:0.5962;background-size:967.74% 100%;background-position-x:64.963%;animation-delay:0.27s}#brandIntro .bi-l6{margin-left:1.667%;width:10.333%;aspect-ratio:0.5962;background-size:967.74% 100%;background-position-x:78.346%;animation-delay:0.32s}#brandIntro .bi-l7{margin-left:1.333%;width:10.417%;aspect-ratio:0.6010;background-size:960.00% 100%;background-position-x:91.442%;animation-delay:0.36s}#brandIntro .bi-l8{margin-left:1.333%;width:3.333%;aspect-ratio:0.1923;background-size:3000.00% 100%;background-position-x:96.897%;animation-delay:0.41s}") +
    "#brandIntro .bi-glint{position:absolute;inset:0;-webkit-mask-size:100% 100%;mask-size:100% 100%;overflow:hidden;" +
    (reduced ? "opacity:0;" : "") + "}" +
    "#brandIntro .bi-glint span{position:absolute;top:0;bottom:0;width:34%;" +
    "background:linear-gradient(115deg,transparent,rgba(255,255,255,.85) 50%,transparent);" +
    "transform:translateX(-160%);will-change:transform;" +
    (reduced ? "display:none" : "animation:biGlint .8s ease-in-out 1.7s forwards") + "}" +
    "#brandIntro .bi-line{height:3px;background:" + (cfg.accent || "#a91e22") + ";margin:18px auto 0;width:100%;" +
    "border-radius:2px;transform-origin:left center;" +
    (reduced ? "" : "transform:scaleX(0);animation:biLine .6s cubic-bezier(.65,0,.35,1) .5s forwards") + "}" +
    "#brandIntro .bi-sub{margin-top:16px;color:#fff;opacity:0;font-family:" + (cfg.font || "sans-serif") + ";" +
    "font-size:clamp(12px,1.6vw,15px);font-weight:600;letter-spacing:.55em;text-indent:.55em;" +
    (reduced ? "opacity:.85" : "animation:biSub .6s ease 1.45s forwards") + "}" +
    "#brandIntro .bi-skip{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);" +
    "color:rgba(255,255,255,.35);font-size:11px;letter-spacing:.14em;text-transform:uppercase;" +
    "font-family:" + (cfg.font || "sans-serif") + ";opacity:0;animation:biSkip .4s ease 1.6s forwards}" +
    "@keyframes biDraw{to{stroke-dashoffset:0}}" +
    "@keyframes biLetter{to{opacity:1;transform:translateY(0)}}" +
    "@keyframes biLine{to{transform:scaleX(1)}}" +
    "@keyframes biSub{to{opacity:.85}}" +
    "@keyframes biSkip{to{opacity:1}}" +
    "@keyframes biRise{from{transform:translateY(10px)}to{transform:translateY(0)}}" +
    "@keyframes biGlint{from{transform:translateX(-160%)}to{transform:translateX(460%)}}";

  document.head.appendChild(css);
  document.documentElement.appendChild(el);

  var done = false;
  function dismiss() {
    if (done) return;
    done = true;
    resolveDone();
    el.classList.add("bi-out");
    setTimeout(function () {
      el.remove();
      css.remove();
    }, 500);
  }

  el.addEventListener("pointerdown", dismiss);
  window.addEventListener("keydown", dismiss, { once: true });

  if (debugT) {
    requestAnimationFrame(function () {
      el.getAnimations({ subtree: true }).forEach(function (a) {
        a.currentTime = +debugT;
        a.pause();
      });
    });
  } else {
    setTimeout(dismiss, reduced ? 1200 : 2950);
  }
})();
