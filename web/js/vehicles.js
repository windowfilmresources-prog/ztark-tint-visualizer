// Side-profile vehicle art, studio-render style. Layers per vehicle:
//   floor glow + contact shadow → body (paint via --paint) → paint-depth overlay (shoulder
//   highlight, character-line shadow) → dark lower fascia/rocker → wheel wells → windshield glass
//   → cabin+interior (clipped to glass) → per-zone tint overlays → glass reflections → trim,
//   LED lights → wheels (dark alloys, accent caliper).
// Tint overlays fill the exact glass paths; JS only touches their opacity.
// "front" = front door glass (front-side VLT laws), "rear" = everything behind the B-pillar.

(function () {
  function wheel(cx, cy, r) {
    const rim = Math.round(r * 0.62);
    let spokes = "";
    for (let i = 0; i < 5; i++) {
      spokes += `<path d="M ${cx - 3},${cy - rim + 5} L ${cx + 3},${cy - rim + 5} L ${cx + 1.5},${cy - 4} L ${cx - 1.5},${cy - 4} Z" fill="#7e8892" transform="rotate(${i * 72} ${cx} ${cy})"/>`;
    }
    return `<g>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#101315"/>
      <circle cx="${cx}" cy="${cy}" r="${r - 1.5}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="3"/>
      <circle cx="${cx}" cy="${cy}" r="${rim}" fill="url(#rimGrad)"/>
      <circle cx="${cx}" cy="${cy}" r="${rim - 3}" fill="#1c2126"/>
      <rect x="${cx + rim - 15}" y="${cy - 9}" width="9" height="18" rx="3" fill="var(--accent,#c00)" transform="rotate(-38 ${cx} ${cy})"/>
      ${spokes}
      <circle cx="${cx}" cy="${cy}" r="${Math.round(rim * 0.2)}" fill="#454e56"/>
      <circle cx="${cx}" cy="${cy}" r="${Math.round(rim * 0.2) - 3}" fill="#20262b"/>
      <circle cx="${cx}" cy="${cy}" r="${rim}" fill="none" stroke="#565f68" stroke-width="1.6"/>
    </g>`;
  }

  const DEFS = `
    <radialGradient id="rimGrad" cx="35%" cy="32%" r="80%">
      <stop offset="0%" stop-color="#b9c2cb"/><stop offset="55%" stop-color="#6d7780"/><stop offset="100%" stop-color="#3a4148"/>
    </radialGradient>
    <linearGradient id="cabinDay" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#a8b9c4"/><stop offset="100%" stop-color="#5c6871"/>
    </linearGradient>
    <linearGradient id="cabinNight" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#141a21"/><stop offset="100%" stop-color="#06080b"/>
    </linearGradient>
    <linearGradient id="paintDepth" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".42"/>
      <stop offset="16%" stop-color="#ffffff" stop-opacity=".14"/>
      <stop offset="36%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="54%" stop-color="#000000" stop-opacity=".06"/>
      <stop offset="72%" stop-color="#000000" stop-opacity=".30"/>
      <stop offset="86%" stop-color="#000000" stop-opacity=".14"/>
      <stop offset="100%" stop-color="#000000" stop-opacity=".38"/>
    </linearGradient>
    <radialGradient id="floorGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".30"/>
      <stop offset="60%" stop-color="#ffffff" stop-opacity=".10"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="glassSheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".28"/>
      <stop offset="45%" stop-color="#ffffff" stop-opacity=".04"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="ledTail" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff3b30"/><stop offset="100%" stop-color="#a3111a"/>
    </linearGradient>
    <linearGradient id="beamGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#fff3c4" stop-opacity=".55"/>
      <stop offset="100%" stop-color="#fff3c4" stop-opacity="0"/>
    </linearGradient>`;

  function assemble(v) {
    const zonePaths = v.zones.map(z =>
      `<path class="tint" data-zone="${z.zone}" d="${z.d}" fill="#020507" opacity="0"/>`).join("\n");
    const glassOutlines = v.zones.map(z =>
      `<path d="${z.d}" fill="none" stroke="rgba(6,10,14,.55)" stroke-width="2"/>`).join("\n");
    const clipPaths = v.zones.map(z => `<path d="${z.d}"/>`).join("");
    const wells = v.wheels.map((w) => {
      const arch = w[3] || w[2] + 10;
      return `<path d="M ${w[0] - arch},${w[1]} A ${arch},${arch} 0 0 1 ${w[0] + arch},${w[1]} Z" fill="#07090b"/>`;
    }).join("\n");

    return `<svg class="vehicle" viewBox="0 0 900 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${v.label} side profile">
      <defs>${DEFS}<clipPath id="glass-${v.id}">${clipPaths}</clipPath></defs>
      <ellipse cx="440" cy="308" rx="400" ry="34" fill="url(#floorGlow)"/>
      <ellipse cx="440" cy="303" rx="330" ry="14" fill="#000" opacity=".38"/>
      <path d="${v.body}" style="fill:var(--paint,#c8102e)"/>
      <path d="${v.body}" fill="url(#paintDepth)"/>
      ${v.fascia || ""}
      ${wells}
      <path class="ws-glass" d="${v.windshield}"/>
      ${v.details || ""}
      <g clip-path="url(#glass-${v.id})">
        <rect class="cabin-day" x="0" y="0" width="900" height="360" fill="url(#cabinDay)"/>
        <rect class="cabin-night" x="0" y="0" width="900" height="360" fill="url(#cabinNight)"/>
        <g fill="#39424a" opacity=".95" class="interior">${v.interior}</g>
      </g>
      ${zonePaths}
      <g clip-path="url(#glass-${v.id})" class="reflections">
        ${v.reflections}
        <rect x="0" y="0" width="900" height="360" fill="url(#glassSheen)"/>
      </g>
      ${glassOutlines}
      ${v.trim || ""}
      ${v.wheels.map(w => wheel(w[0], w[1], w[2])).join("\n")}
      <g class="lights">${v.lights || ""}</g>
    </svg>`;
  }

  // ── Sport sedan: long, low fastback ──────────────────────────────────────
  const SEDAN = {
    id: "sedan",
    label: "Sedan",
    body: `M 118,252 C 104,252 96,244 96,232 L 98,214 C 99,204 106,199 118,197 L 130,195
           C 154,189 180,186 208,185 C 224,184 238,185 250,187
           C 282,152 314,138 360,133 L 462,131 C 486,131 505,136 521,144
           C 545,156 562,173 576,191 L 592,194 C 636,198 678,203 708,209
           C 731,213 743,221 745,232 L 746,242 C 746,250 740,252 730,252
           L 716,252 A 56,56 0 0 0 604,252 L 301,252 A 56,56 0 0 0 189,252 L 118,252 Z`,
    windshield: `M 580,191 Q 558,148 522,140 L 505,140 Q 545,153 566,191 Z`,
    zones: [
      { zone: "rear",  d: "M 436,190 L 436,142 L 372,140 Q 318,148 290,190 Z" },
      { zone: "front", d: "M 450,190 L 450,142 L 508,141 Q 543,150 566,190 Z" },
    ],
    interior: `
      <rect x="376" y="154" width="30" height="21" rx="9"/>
      <rect x="368" y="171" width="44" height="19" rx="4"/>
      <rect x="470" y="150" width="32" height="23" rx="9"/>
      <rect x="462" y="169" width="46" height="21" rx="4"/>
      <circle cx="540" cy="186" r="12" fill="none" stroke="#39424a" stroke-width="5"/>`,
    reflections: `
      <path d="M 350,136 L 388,136 L 322,196 L 284,196 Z" fill="#fff" opacity=".16"/>
      <path d="M 488,138 L 506,138 L 452,196 L 434,196 Z" fill="#fff" opacity=".10"/>`,
    fascia: `
      <path d="M 690,238 C 716,240 736,244 745,248 L 746,242 C 746,250 740,252 730,252 L 690,252 Z" fill="rgba(0,0,0,.38)"/>
      <path d="M 301,246 L 604,246 L 604,252 L 301,252 Z" fill="rgba(0,0,0,.32)"/>
      <path d="M 98,238 L 130,240 L 130,252 L 118,252 C 104,252 96,244 96,232 Z" fill="rgba(0,0,0,.38)"/>`,
    details: `
      <path d="M 150,214 C 330,218 560,220 700,224" stroke="rgba(0,0,0,.20)" stroke-width="3" fill="none"/>
      <path d="M 208,186 C 330,184 480,190 560,196" stroke="rgba(255,255,255,.14)" stroke-width="2" fill="none"/>
      <path d="M 442,194 L 440,248" stroke="rgba(0,0,0,.25)" stroke-width="2.5" fill="none"/>
      <path d="M 572,196 L 568,248" stroke="rgba(0,0,0,.2)" stroke-width="2.5" fill="none"/>
      <rect x="458" y="203" width="26" height="5" rx="2.5" fill="rgba(0,0,0,.35)"/>
      <rect x="350" y="203" width="26" height="5" rx="2.5" fill="rgba(0,0,0,.35)"/>
      <path d="M 572,178 L 590,171 Q 596,169 595,175 L 593,181 Q 581,184 573,182 Z" fill="rgba(0,0,0,.55)"/>`,
    trim: `
      <path d="M 250,189 L 578,191" stroke="rgba(230,238,244,.5)" stroke-width="1.6" fill="none"/>
      <path d="M 708,210 L 742,220 L 744,214 L 714,204 Z" fill="#dbe9f4"/>
      <path d="M 708,210 L 742,220 L 743,217 L 710,207 Z" fill="#8fd0f0" opacity=".8"/>
      <path d="M 99,206 L 130,200 L 131,208 L 100,213 Z" fill="url(#ledTail)"/>`,
    lights: `
      <path d="M 742,216 L 872,208 L 872,246 L 746,242 Z" fill="url(#beamGrad)"/>
      <path d="M 99,206 L 130,200 L 131,208 L 100,213 Z" fill="#ff4438" opacity=".9"/>`,
    wheels: [[245, 252, 50], [660, 252, 50, 56]],
  };

  // ── Luxury crossover: raked D-pillar, tall stance ────────────────────────
  const SUV = {
    id: "suv",
    label: "SUV",
    body: `M 128,248 C 114,248 106,240 106,228 L 108,162 C 108,148 118,140 134,137 L 152,134
           C 192,120 234,112 290,110 L 520,110 C 548,112 570,124 590,158 L 606,163
           C 648,168 684,175 708,182 C 730,188 742,197 744,209 L 745,236
           C 745,246 738,250 728,250 L 711,248 A 58,58 0 0 0 599,248
           L 308,248 A 58,58 0 0 0 192,248 L 128,248 Z`,
    windshield: `M 600,162 Q 582,126 552,116 L 536,116 Q 570,128 586,162 Z`,
    zones: [
      { zone: "rear",  d: "M 320,186 L 320,120 L 242,122 Q 192,128 168,186 Z" },
      { zone: "rear",  d: "M 334,186 L 334,120 L 424,120 L 424,186 Z" },
      { zone: "front", d: "M 438,186 L 438,120 L 518,118 Q 554,128 578,186 Z" },
    ],
    interior: `
      <rect x="256" y="136" width="30" height="20" rx="8"/>
      <rect x="250" y="152" width="42" height="22" rx="4"/>
      <rect x="356" y="128" width="32" height="22" rx="9"/>
      <rect x="348" y="146" width="46" height="26" rx="4"/>
      <rect x="464" y="124" width="34" height="24" rx="9"/>
      <rect x="456" y="144" width="48" height="28" rx="4"/>
      <circle cx="556" cy="178" r="13" fill="none" stroke="#39424a" stroke-width="5"/>`,
    reflections: `
      <path d="M 262,116 L 298,116 L 216,192 L 180,192 Z" fill="#fff" opacity=".15"/>
      <path d="M 482,114 L 500,114 L 428,192 L 410,192 Z" fill="#fff" opacity=".10"/>`,
    fascia: `
      <path d="M 690,232 C 718,236 738,242 745,248 L 745,236 C 745,246 738,250 728,250 L 690,250 Z" fill="rgba(0,0,0,.38)"/>
      <path d="M 308,242 L 599,242 L 599,248 L 308,248 Z" fill="rgba(0,0,0,.32)"/>
      <path d="M 108,236 L 140,238 L 140,248 L 128,248 C 114,248 106,240 106,228 Z" fill="rgba(0,0,0,.38)"/>`,
    details: `
      <rect x="300" y="100" width="250" height="5" rx="2.5" fill="rgba(0,0,0,.5)"/>
      <path d="M 160,212 C 340,218 570,220 710,222" stroke="rgba(0,0,0,.20)" stroke-width="3" fill="none"/>
      <path d="M 431,190 L 429,244" stroke="rgba(0,0,0,.25)" stroke-width="2.5" fill="none"/>
      <path d="M 327,190 L 326,244" stroke="rgba(0,0,0,.25)" stroke-width="2.5" fill="none"/>
      <path d="M 584,190 L 580,244" stroke="rgba(0,0,0,.2)" stroke-width="2.5" fill="none"/>
      <rect x="452" y="198" width="26" height="5" rx="2.5" fill="rgba(0,0,0,.35)"/>
      <rect x="348" y="198" width="26" height="5" rx="2.5" fill="rgba(0,0,0,.35)"/>
      <path d="M 584,172 L 602,165 Q 608,163 607,169 L 605,175 Q 593,178 585,176 Z" fill="rgba(0,0,0,.55)"/>`,
    trim: `
      <path d="M 168,186 L 586,186" stroke="rgba(230,238,244,.5)" stroke-width="1.6" fill="none"/>
      <path d="M 708,183 L 738,196 L 740,189 L 714,177 Z" fill="#dbe9f4"/>
      <path d="M 708,183 L 738,196 L 739,193 L 710,180 Z" fill="#8fd0f0" opacity=".8"/>
      <path d="M 110,196 L 138,190 L 140,199 L 112,204 Z" fill="url(#ledTail)"/>`,
    lights: `
      <path d="M 738,190 L 868,184 L 868,222 L 742,220 Z" fill="url(#beamGrad)"/>
      <path d="M 110,196 L 138,190 L 140,199 L 112,204 Z" fill="#ff4438" opacity=".9"/>`,
    wheels: [[250, 248, 52, 58], [655, 248, 52, 58]],
  };

  // ── Crew-cab pickup: modern, aggressive ──────────────────────────────────
  const TRUCK = {
    id: "truck",
    label: "Pickup",
    body: `M 122,246 C 110,246 104,238 104,228 L 106,152 C 106,146 110,142 118,142
           L 340,142 L 346,136 L 346,114 C 346,104 354,98 366,98 L 500,98
           C 524,100 545,112 564,144 L 578,148 C 626,153 676,160 708,166
           C 730,171 741,180 742,192 L 743,232 C 743,242 737,246 728,246
           L 721,246 A 56,56 0 0 0 609,246 L 291,246 A 56,56 0 0 0 179,246 L 122,246 Z`,
    windshield: `M 572,148 Q 556,112 528,102 L 513,101 Q 542,114 558,148 Z`,
    zones: [
      { zone: "rear",  d: "M 464,152 L 464,106 L 362,104 L 362,152 Z" },
      { zone: "front", d: "M 478,152 L 478,106 L 512,104 Q 542,114 560,152 Z" },
    ],
    interior: `
      <rect x="482" y="114" width="30" height="22" rx="9"/>
      <rect x="474" y="132" width="44" height="20" rx="4"/>
      <rect x="394" y="112" width="32" height="22" rx="9"/>
      <rect x="386" y="130" width="46" height="22" rx="4"/>
      <circle cx="536" cy="146" r="12" fill="none" stroke="#39424a" stroke-width="5"/>`,
    reflections: `
      <path d="M 392,108 L 424,108 L 384,148 L 356,148 Z" fill="#fff" opacity=".15"/>
      <path d="M 494,102 L 510,102 L 472,156 L 456,156 Z" fill="#fff" opacity=".10"/>`,
    fascia: `
      <path d="M 690,220 C 718,226 736,236 742,244 L 743,232 C 743,242 737,246 728,246 L 690,246 Z" fill="rgba(0,0,0,.38)"/>
      <path d="M 291,240 L 609,240 L 609,246 L 291,246 Z" fill="rgba(0,0,0,.32)"/>
      <path d="M 106,232 L 138,234 L 138,246 L 122,246 C 110,246 104,238 104,228 Z" fill="rgba(0,0,0,.38)"/>`,
    details: `
      <path d="M 346,142 L 346,242" stroke="rgba(0,0,0,.28)" stroke-width="3" fill="none"/>
      <path d="M 112,158 L 338,158" stroke="rgba(0,0,0,.16)" stroke-width="3" fill="none"/>
      <path d="M 120,212 C 320,218 560,220 716,220" stroke="rgba(0,0,0,.20)" stroke-width="3" fill="none"/>
      <path d="M 471,156 L 469,242" stroke="rgba(0,0,0,.25)" stroke-width="2.5" fill="none"/>
      <path d="M 566,158 L 562,242" stroke="rgba(0,0,0,.2)" stroke-width="2.5" fill="none"/>
      <rect x="486" y="168" width="26" height="5" rx="2.5" fill="rgba(0,0,0,.35)"/>
      <rect x="398" y="168" width="26" height="5" rx="2.5" fill="rgba(0,0,0,.35)"/>
      <path d="M 566,134 L 584,127 Q 590,125 589,131 L 587,137 Q 575,140 567,138 Z" fill="rgba(0,0,0,.55)"/>`,
    trim: `
      <path d="M 356,152 L 562,152" stroke="rgba(230,238,244,.5)" stroke-width="1.6" fill="none"/>
      <path d="M 708,167 L 736,180 L 738,172 L 714,161 Z" fill="#dbe9f4"/>
      <path d="M 708,167 L 736,180 L 737,177 L 710,164 Z" fill="#8fd0f0" opacity=".8"/>
      <path d="M 108,156 L 134,150 L 136,160 L 110,165 Z" fill="url(#ledTail)"/>`,
    lights: `
      <path d="M 734,174 L 866,168 L 866,206 L 738,204 Z" fill="url(#beamGrad)"/>
      <path d="M 108,156 L 134,150 L 136,160 L 110,165 Z" fill="#ff4438" opacity=".9"/>`,
    wheels: [[235, 246, 54, 60], [665, 246, 54, 60]],
  };

  window.VEHICLES = [SEDAN, SUV, TRUCK].map(v => ({ id: v.id, label: v.label, svg: assemble(v) }));
})();
