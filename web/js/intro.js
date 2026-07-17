// Animated brand opener. Config-driven from BRANDS[brand].intro — brands
// without a config get no opener. Plays on every page load (it masks the 3D
// model load), skips on any input, respects prefers-reduced-motion.
// ?introDebug=<ms> freezes all opener animations at t for design review.
(function () {
  var qs = new URLSearchParams(location.search);
  var brandId = (qs.get("brand") || "huper").toLowerCase();
  var BRAND = (window.BRANDS && window.BRANDS[brandId]) || null;
  var cfg = BRAND && BRAND.intro;
  if (!cfg || qs.get("nointro")) return;

  var debugT = qs.get("introDebug");
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var el = document.createElement("div");
  el.id = "brandIntro";
  el.setAttribute("role", "presentation");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML =
    '<div class="bi-inner">' +
    (cfg.road ? '<img class="bi-road" src="' + cfg.road + '" alt="">' : "") +
    '  <div class="bi-mark">' +
    '    <img src="' + cfg.logo + '" alt="">' +
    '    <div class="bi-glint" style="-webkit-mask-image:url(\'' + cfg.logo + '\');mask-image:url(\'' + cfg.logo + '\')"></div>' +
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
    // the brand's own road swoosh drives in first
    "#brandIntro .bi-road{width:86%;height:auto;display:block;margin:0 auto 10px;" +
    (reduced ? "" :
      "clip-path:inset(0 100% 0 0);transform:translateY(10px) scale(.97);" +
      "animation:biRoadWipe .62s cubic-bezier(.55,0,.25,1) .05s forwards,biRoadSettle .62s cubic-bezier(.2,.7,.2,1) .05s forwards") + "}" +
    "#brandIntro .bi-mark{position:relative;display:block;width:100%}" +
    "#brandIntro .bi-mark img{width:100%;height:auto;display:block;" +
    (reduced ? "" : "clip-path:inset(0 100% 0 0);animation:biWipe .68s cubic-bezier(.65,0,.35,1) .45s forwards") + "}" +
    "#brandIntro .bi-glint{position:absolute;inset:0;-webkit-mask-size:100% 100%;mask-size:100% 100%;" +
    "background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.85) 50%,transparent 60%);" +
    "background-size:280% 100%;background-position:120% 0;background-repeat:no-repeat;" +
    (reduced ? "opacity:0" : "animation:biGlint .8s ease-in-out 1.35s forwards") + "}" +
    "#brandIntro .bi-line{height:3px;background:" + (cfg.accent || "#a91e22") + ";margin:18px auto 0;width:100%;" +
    "border-radius:2px;transform-origin:left center;" +
    (reduced ? "" : "transform:scaleX(0);animation:biLine .68s cubic-bezier(.65,0,.35,1) .45s forwards") + "}" +
    "#brandIntro .bi-sub{margin-top:16px;color:#fff;opacity:0;font-family:" + (cfg.font || "sans-serif") + ";" +
    "font-size:clamp(12px,1.6vw,15px);font-weight:600;letter-spacing:.55em;text-indent:.55em;" +
    (reduced ? "opacity:.85" : "animation:biSub .6s ease .95s forwards") + "}" +
    "#brandIntro .bi-skip{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);" +
    "color:rgba(255,255,255,.35);font-size:11px;letter-spacing:.14em;text-transform:uppercase;" +
    "font-family:" + (cfg.font || "sans-serif") + ";opacity:0;animation:biSkip .4s ease 1.3s forwards}" +
    "@keyframes biRoadWipe{to{clip-path:inset(0 -2% 0 0)}}" +
    "@keyframes biRoadSettle{to{transform:translateY(0) scale(1)}}" +
    "@keyframes biWipe{to{clip-path:inset(0 0 0 0)}}" +
    "@keyframes biLine{to{transform:scaleX(1)}}" +
    "@keyframes biSub{to{opacity:.85}}" +
    "@keyframes biSkip{to{opacity:1}}" +
    "@keyframes biRise{from{transform:translateY(10px)}to{transform:translateY(0)}}" +
    "@keyframes biGlint{from{background-position:120% 0}to{background-position:-60% 0}}";

  document.head.appendChild(css);
  document.documentElement.appendChild(el);

  var done = false;
  function dismiss() {
    if (done) return;
    done = true;
    el.classList.add("bi-out");
    setTimeout(function () {
      el.remove();
      css.remove();
    }, 500);
  }

  el.addEventListener("pointerdown", dismiss);
  window.addEventListener("keydown", dismiss, { once: true });

  if (debugT) {
    // dev aid: freeze every opener animation at the requested time
    requestAnimationFrame(function () {
      el.getAnimations({ subtree: true }).forEach(function (a) {
        a.currentTime = +debugT;
        a.pause();
      });
    });
  } else {
    setTimeout(dismiss, reduced ? 1200 : 2400);
  }
})();
