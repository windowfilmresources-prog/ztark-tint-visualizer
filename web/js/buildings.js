// Architectural (flat-glass) mode: ZTARK-original 3D diorama buildings (locked
// isometric exterior + furnished interior view), real transmission glass driven
// by the film selection. Hüper Optik and Edge only — Autobahn is automotive-only.
// Catalogs from the brands' architectural lines (factory spec sheets for Hüper;
// programedge.com published TSER/glare for Edge — Edge does not publish VLT,
// shade number is nominal VLT by industry convention).

window.BUILDINGS = {
  scenes: {
    residential: {
      label: "Residential",
      glb: "assets/models/buildings/house.glb?v=5",
      credit: "ZTARK original concept architecture",
      isoDir: [-1, 0.62, 1],   // slider walls face +Z, wing glass -X
    },
    commercial: {
      label: "Commercial",
      glb: "assets/models/buildings/office.glb?v=4",
      credit: "ZTARK original concept architecture",
      isoDir: [-1, 0.62, -1],  // curtain-wall front + entry face -X/-Z
    },
  },

  catalogs: {
    huper: {
      heroSub: "See every Hüper Optik architectural film on real residential and commercial spaces — patented nano-ceramic comfort for the places you live and work.",
      products: [
        { name: "Ceramic Series", tech: "Nano-Ceramic · Non-Metal",
          tagline: "The patented nano-ceramic architectural film — neutral appearance, no metals, no corrosion, exceptional heat rejection.",
          warranty: "Lifetime residential · 15-year commercial warranty.",
          shades: [
            { sku: 20, vlt: 21, tser: 68, glare: 76, uv: 99, refl: 14 },
            { sku: 30, vlt: 30, tser: 63, glare: 62, uv: 99, refl: 11 },
            { sku: 40, vlt: 42, tser: 55, glare: 53, uv: 99, refl: 9 },
            { sku: 50, vlt: 50, tser: 50, glare: 45, uv: 99, refl: 10 },
            { sku: 60, vlt: 60, tser: 43, glare: 34, uv: 99, refl: 9 },
            { sku: 70, vlt: 71, tser: 48, glare: 21, uv: 99, refl: 10 },
            { sku: 85, vlt: 85, tser: 32, glare: 9,  uv: 99, refl: 8, name: "Klar 85" },
          ] },
        { name: "Select Series", tech: "Sputtered Silver + Gold · Spectrally Selective",
          tagline: "Precious-metal films that optimize natural light while rejecting heat — the highest-performing non-reflective film in the world.",
          warranty: "Lifetime residential · 15-year commercial warranty.",
          shades: [
            { sku: 35, vlt: 35, tser: 70, glare: 61, uv: 99.9, refl: 12, name: "Select Drei" },
            { sku: 59, vlt: 59, tser: 54, glare: 34, uv: 99.9, refl: 8,  name: "Select Sech" },
          ] },
        { name: "Fusion Series", tech: "Dual-Reflective",
          tagline: "Performance and aesthetics fused — strong exterior reflectivity for daytime privacy with a low-glare interior side.",
          warranty: "Lifetime residential · 15-year commercial warranty.",
          shades: [
            { sku: 10, vlt: 11, tser: 77, glare: 88, uv: 99, refl: 51 },
            { sku: 20, vlt: 20, tser: 69, glare: 78, uv: 99, refl: 39 },
            { sku: 28, vlt: 27, tser: 65, glare: 70, uv: 99, refl: 34 },
          ] },
        { name: "Traditional Series", tech: "Classic Reflective",
          tagline: "True silver and bronze reflective looks with serious solar performance.",
          warranty: "Lifetime residential · 15-year commercial warranty.",
          shades: [
            { sku: 18, vlt: 17, tser: 80, glare: 80, uv: 99, refl: 56, name: "Silver 18" },
            { sku: 30, vlt: 31, tser: 68, glare: 62, uv: 99, refl: 42, name: "Silver 30" },
            { sku: 25, vlt: 22, tser: 73, glare: 72, uv: 99, refl: 32, tone: "warm", name: "Bronze 25" },
            { sku: 40, vlt: 39, tser: 59, glare: 56, uv: 99, refl: 17, tone: "warm", name: "Bronze 40" },
          ] },
      ],
    },

    edge: {
      heroSub: "Preview Edge architectural films on real homes and workplaces — clarity, comfort, and control for every space.",
      products: [
        { name: "Pristine Ceramic", tech: "Ceramic Technology",
          tagline: "Next-generation ceramic film for spaces where clarity, comfort, and long-term performance matter.",
          warranty: "Backed by Edge No Hassle residential & commercial warranties.",
          shades: [
            { sku: 30, vlt: 30, tser: 59, glare: 61, uv: 99, refl: 9 },
            { sku: 40, vlt: 40, tser: 51, glare: 49, uv: 99, refl: 9 },
            { sku: 50, vlt: 50, tser: 45, glare: 40, uv: 99, refl: 8 },
            { sku: 70, vlt: 70, tser: 50, glare: 25, uv: 99, refl: 8 },
            { sku: 80, vlt: 80, tser: 44, glare: 12, uv: 99, refl: 8 },
          ] },
        { name: "Nature Series", tech: "Dual-Reflective Privacy",
          tagline: "Enjoy the view while keeping daytime privacy — high glare reduction with a soft interior side.",
          warranty: "Backed by Edge No Hassle residential & commercial warranties.",
          shades: [
            { sku: 10, vlt: 10, tser: 69, glare: 89, uv: 99, refl: 45 },
            { sku: 20, vlt: 20, tser: 66, glare: 78, uv: 99, refl: 35 },
            { sku: 30, vlt: 30, tser: 56, glare: 69, uv: 99, refl: 28 },
          ] },
        { name: "Ultra View", tech: "View-Preserving",
          tagline: "Darker shades engineered for clarity from the inside looking out.",
          warranty: "Backed by Edge No Hassle residential & commercial warranties.",
          shades: [
            { sku: 5,  vlt: 5,  tser: 80, glare: 91, uv: 99, refl: 12 },
            { sku: 15, vlt: 15, tser: 75, glare: 84, uv: 99, refl: 11 },
            { sku: 25, vlt: 25, tser: 60, glare: 70, uv: 99, refl: 10 },
            { sku: 35, vlt: 35, tser: 45, glare: 58, uv: 99, refl: 9 },
          ] },
        { name: "Cool Alloy", tech: "Advanced Reflective",
          tagline: "Bold metallic finish — privacy and visual impact with a refined modern aesthetic.",
          warranty: "Backed by Edge No Hassle residential & commercial warranties.",
          shades: [
            { sku: 20, vlt: 20, tser: 65, glare: 78, uv: 99, refl: 48 },
            { sku: 35, vlt: 35, tser: 52, glare: 61, uv: 99, refl: 38 },
            { sku: 60, vlt: 60, tser: 35, glare: 36, uv: 99, refl: 22 },
          ] },
        { name: "Silver Series", tech: "Classic Reflective",
          tagline: "Strong reflective finish for a bold, modern exterior and cooler interiors.",
          warranty: "Backed by Edge No Hassle residential & commercial warranties.",
          shades: [
            { sku: 20, vlt: 20, tser: 78, glare: 79, uv: 99, refl: 55 },
            { sku: 30, vlt: 30, tser: 68, glare: 67, uv: 99, refl: 45 },
            { sku: 40, vlt: 40, tser: 56, glare: 51, uv: 99, refl: 35 },
          ] },
        { name: "Bronze Series", tech: "Warm Copper Finish",
          tagline: "A warm copper aesthetic with genuine solar performance.",
          warranty: "Backed by Edge No Hassle residential & commercial warranties.",
          shades: [
            { sku: 20, vlt: 20, tser: 81, glare: 75, uv: 99, refl: 35, tone: "warm" },
            { sku: 35, vlt: 35, tser: 66, glare: 61, uv: 99, refl: 25, tone: "warm" },
          ] },
      ],
    },
  },
};
