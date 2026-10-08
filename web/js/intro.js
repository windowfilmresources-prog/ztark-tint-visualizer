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

  // ---------------------------------------------------------------- markup
  var ROAD_SVG =
    '<div class="bi-road" aria-hidden="true"><svg class="bi-lane bi-lane0" viewBox="0 0 1200 348"><defs><mask id="biM0"><path d="M 191 393 L 161 330 L 152 312 L 148 294 L 144 276 L 143 258 L 144 240 L 147 222 L 154 204 L 162 186 L 176 168 L 192 150 L 214 132 L 242 114 L 340 82 L 370 73 L 400 66 L 430 61 L 460 58 L 490 54 L 520 52 L 550 50 L 580 48 L 610 47 L 640 46 L 670 46 L 700 46 L 730 47 L 760 48 L 810 48" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" fill="none" stroke="#fff" stroke-width="310" stroke-linecap="butt" stroke-linejoin="round" class="bi-spine bi-spine0"/></mask></defs><g mask="url(#biM0)"><g><g transform="translate(0,348) scale(0.1,-0.1)"><path d="M5455 3059 c-1083 -30 -2107 -165 -2817 -370 -919 -265 -1573 -655 -2043 -1219 -222 -267 -421 -682 -476 -994 -20 -114 -26 -285 -10 -302 6 -5 573 -8 1512 -6 l1502 2 -49 53 c-100 106 -361 487 -441 644 -360 703 48 1361 1057 1706 717 246 1827 370 3555 397 761 12 845 17 585 36 -749 54 -1633 74 -2375 53z" fill="#ff0a0c"/></g></g></g></svg><svg class="bi-lane bi-lane1" viewBox="0 0 1200 348"><defs><mask id="biM1"><path d="M 356 211 L 425 221 L 450 224 L 475 228 L 500 224 L 525 219 L 550 205 L 575 202 L 600 204 L 625 203 L 650 201 L 675 192 L 651 115 L 670 100 L 699 85 L 800 68 L 825 66 L 850 65 L 875 64 L 900 64 L 925 64 L 950 64 L 1000 65" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" fill="none" stroke="#fff" stroke-width="320" stroke-linecap="butt" stroke-linejoin="round" class="bi-spine bi-spine1"/></mask></defs><g mask="url(#biM1)"><g><g transform="translate(0,348) scale(0.1,-0.1)"><path d="M7640 2883 c-30 -1 -152 -7 -270 -13 -384 -19 -1125 -79 -1435 -116 -358 -42 -569 -101 -605 -168 -6 -13 -13 -48 -14 -79 -3 -75 -16 -87 -144 -138 -699 -278 -1037 -680 -991 -1180 30 -322 242 -676 579 -968 l65 -56 1284 3 1285 2 -210 126 c-708 424 -1124 775 -1220 1029 -101 271 -67 447 126 636 391 382 1084 631 2140 768 396 51 991 91 1380 91 420 1 205 22 -560 55 -290 13 -1218 18 -1410 8z" fill="#ff0a0c"/></g></g></g></svg><svg class="bi-lane bi-lane2" viewBox="0 0 1200 348"><defs><mask id="biM2"><path d="M 1250 334 L 1180 328 L 1155 326 L 1130 324 L 1105 322 L 1080 320 L 1055 302 L 1030 290 L 1005 281 L 980 274 L 955 269 L 930 264 L 905 261 L 880 256 L 855 252 L 830 248 L 805 242 L 780 231 L 755 213 L 730 204 L 705 200 L 680 195 L 655 191 L 606 183" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" fill="none" stroke="#fff" stroke-width="300" stroke-linecap="butt" stroke-linejoin="round" class="bi-spine bi-spine2"/></mask></defs><g mask="url(#biM2)"><g><g transform="translate(0,348) scale(0.1,-0.1)"><path d="M9605 2704 c-33 -2 -152 -8 -265 -14 -1070 -56 -2197 -307 -2606 -580 -106 -71 -250 -218 -292 -297 -53 -101 -59 -261 -15 -398 110 -341 527 -714 1280 -1145 l191 -110 2051 0 c1195 0 2051 4 2051 9 0 5 -10 11 -22 14 -31 8 -282 56 -343 67 -398 68 -1052 192 -1900 361 -1106 220 -1764 482 -2091 832 -121 128 -153 267 -93 397 85 182 418 394 830 528 464 151 1174 259 1918 292 130 6 265 14 301 18 l65 6 -100 7 c-119 8 -874 18 -960 13z" fill="#ffcf00"/></g></g></g></svg></div>';

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }

  // the mark itself — identical structure in both layers so the raw (glare)
  // and set (filmed) marks sit pixel-for-pixel on top of each other
  function markHTML(layer) {
    var glint = layer === "set"
      ? '<div class="bi-glint" style="-webkit-mask-image:url(\'' + cfg.logo + '\');mask-image:url(\'' + cfg.logo + '\')"><span></span></div>'
      : "";
    if (pull === "cut") {
      return '<div class="bi-markwrap"><div class="bi-mark" style="background-image:url(\'' + cfg.logo + '\')"></div>' + glint + "</div>";
    }
    return '<div class="bi-markwrap bi-markwrap-word">' +
      '<img class="bi-mark-img" src="' + cfg.logo + '" alt="" draggable="false">' + glint + "</div>";
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
    var road = cfg.roadVector ? (layer === "set" ? ROAD_SVG : '<div class="bi-road"></div>') : "";
    return '<div class="bi-lock">' +
      road +
      markHTML(layer) +
      (cfg.rule === false ? "" : '<div class="bi-rule"></div>') +
      subHTML() +
      "</div>";
  }

  // the squeegee: drawn in a 0..100 viewBox stretched over the viewport, with
  // non-scaling strokes, so the line lands exactly on the clip-path edge at
  // any aspect ratio while keeping a constant pixel thickness
  function bladeSVG() {
    var line = pull === "forward" ? 'x1="7" y1="0" x2="0" y2="100"' : 'x1="0" y1="0" x2="100" y2="6"';
    return '<svg class="bi-blade" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
      '<line ' + line + ' class="bi-b-glow" vector-effect="non-scaling-stroke"/>' +
      '<line ' + line + ' class="bi-b-core" vector-effect="non-scaling-stroke"/>' +
      "</svg>";
  }

  var heatFx = cfg.heat
    ? '<svg class="bi-defs" width="0" height="0" aria-hidden="true"><filter id="biHeatFx" x="-5%" y="-20%" width="110%" height="140%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.010 0.050" numOctaves="2" seed="7" result="n">' +
      '<animate attributeName="baseFrequency" dur="1.6s" values="0.010 0.050;0.014 0.068;0.010 0.050" repeatCount="indefinite"/>' +
      "</feTurbulence>" +
      '<feDisplacementMap in="SourceGraphic" in2="n" scale="11" xChannelSelector="R" yChannelSelector="G"/></filter></svg>'
    : "";

  var streaks = "";
  if (pull === "forward") {
    for (var s = 0; s < 6; s++) streaks += '<i class="bi-streak bi-streak' + s + '"></i>';
  }

  var el = document.createElement("div");
  el.id = "brandIntro";
  el.className = "bi-" + pull + (reduced ? " bi-reduced" : "");
  el.setAttribute("role", "presentation");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML =
    heatFx +
    '<div class="bi-pane">' +
    '<div class="bi-raw"><div class="bi-glare"></div>' + streaks + lockHTML("raw") + "</div>" +
    '<div class="bi-set">' + lockHTML("set") + "</div>" +
    '<div class="bi-skip">Click to skip</div>' +
    "</div>" +
    (pull === "cut" ? '<div class="bi-cutblade"></div>' : bladeSVG());

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
      "#brandIntro .bi-raw .bi-lock{filter:url(#biHeatFx)}",
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
    R.push(
      "#brandIntro .bi-blade{position:absolute;inset:0;width:100%;height:100%;z-index:4;overflow:visible;pointer-events:none;" +
      (dark
        ? "filter:drop-shadow(0 0 6px rgba(255,90,60,.9)) drop-shadow(0 0 18px rgba(255,40,30,.45))}"
        : "filter:drop-shadow(0 0 7px rgba(255,255,255,.95)) drop-shadow(0 1.5px 0 rgba(96,72,48,.32))}"),
      "#brandIntro .bi-b-glow{stroke:" + (dark ? "rgba(255,90,60,.35)" : "rgba(255,255,255,.55)") + ";stroke-width:" + (dark ? 9 : 10) + "px}",
      "#brandIntro .bi-b-core{stroke:" + (dark ? "#fff3ee" : "#ffffff") + ";stroke-width:" + (dark ? 2 : 2.5) + "px}"
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
    if (pull === "down") {
      R.push(
        "#brandIntro .bi-set{animation:biPullDown " + pd + " " + ease + " " + p + " both}",
        "#brandIntro .bi-blade{animation:biBladeDown " + pd + " " + ease + " " + p + " both}",
        "@keyframes biPullDown{from{clip-path:polygon(0 0,100% 0,100% -6%,0 -12%)}to{clip-path:polygon(0 0,100% 0,100% 112%,0 106%)}}",
        "@keyframes biBladeDown{from{transform:translateY(-12%)}to{transform:translateY(106%)}}"
      );
    } else if (pull === "forward") {
      R.push(
        "#brandIntro .bi-set{animation:biPullFwd " + pd + " " + ease + " " + p + " both}",
        "#brandIntro .bi-blade{animation:biBladeFwd " + pd + " " + ease + " " + p + " both}",
        "@keyframes biPullFwd{from{clip-path:polygon(0 0,-8% 0,-15% 100%,0 100%)}to{clip-path:polygon(0 0,115% 0,108% 100%,0 100%)}}",
        "@keyframes biBladeFwd{from{transform:translateX(-15%)}to{transform:translateX(108%)}}",
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
      "#brandIntro.bi-exit .bi-pane{animation:biExitDown " + xd + " " + ease + " both}",
      "#brandIntro.bi-exit .bi-blade{animation:biBladeDownX " + xd + " " + ease + " both}",
      "@keyframes biBladeDownX{from{transform:translateY(-12%)}to{transform:translateY(106%)}}",
      "@keyframes biExitDown{from{clip-path:polygon(0 -12%,100% -6%,100% 100%,0 100%)}to{clip-path:polygon(0 106%,100% 112%,100% 100%,0 100%)}}"
    );
    else if (pull === "forward") R.push(
      "#brandIntro.bi-exit .bi-pane{animation:biExitFwd " + xd + " " + ease + " both}",
      "#brandIntro.bi-exit .bi-blade{animation:biBladeFwdX " + xd + " " + ease + " both}",
      "@keyframes biBladeFwdX{from{transform:translateX(-15%)}to{transform:translateX(108%)}}",
      "@keyframes biExitFwd{from{clip-path:polygon(-8% 0,100% 0,100% 100%,-15% 100%)}to{clip-path:polygon(115% 0,100% 0,100% 100%,108% 100%)}}"
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
      "#brandIntro .bi-raw,#brandIntro .bi-blade,#brandIntro .bi-cutblade{display:none}",
      "#brandIntro .bi-glint,#brandIntro .bi-skip{display:none}",
      "#brandIntro .bi-sub span{opacity:.85}",
      "#brandIntro{transition:opacity .35s ease}#brandIntro.bi-exit{opacity:0}"
    );
  }

  css.textContent = R.join("");
  document.head.appendChild(css);
  document.documentElement.appendChild(el);

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

  // ---------------------------------------------------------------- lifecycle
  var done = false;
  function finish() {
    el.remove();
    css.remove();
  }
  function dismiss() {
    if (done) return;
    done = true;
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
      var EXIT_ANIMS = /^bi(ExitDown|ExitFwd|CutClose|BladeDownX|BladeFwdX|BladeOut)$/;
      requestAnimationFrame(function () {
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
      });
    } else {
      requestAnimationFrame(freeze);
    }
  } else {
    setTimeout(dismiss, reduced ? 1100 : T.exit * 1000);
  }
})();
