# ZTARK Tint Visualizer

Customer-facing window tint visualizer with three brand skins — **Hüper Optik**, **Autobahn**,
and **Edge** — each styled to its brand's live website and loaded with that brand's real
automotive film catalog (from official product pages and technical data sheets, researched 2026-07).

Pure static vanilla HTML/CSS/JS — no build step, hostable anywhere, iframe-embeddable.

## Run

```
python3 -m http.server 8742 --directory web
```

- http://localhost:8742/?brand=huper — white/lime, Abel type, Ceramic/Fusion/Xtreme Optiks/Klar 85
- http://localhost:8742/?brand=autobahn — black/crimson, Vast Shadow/Cairo, i3+/i3/Black Ceramic/Black
- http://localhost:8742/?brand=edge — navy/white, Gothic A1, Ceramic XR/Spectra HP/Carbon Crystalline/Clear Comfort

## Features

- **3D showroom (primary)**: Three.js white-studio environment with an orbitable glTF car
  (drag to rotate, scroll to zoom). Tint is a physical glass material driven by VLT; the glass
  is auto-split into zones — windshield stays factory-clear, front sides / rear tint
  independently. Paint picker drives the real car-paint material. Press-and-hold
  factory-glass compare. Set `MODE_3D = false` in `app.js` to fall back to photo mode
  (traced photos in `photocars.js`) or vector art (`vehicles.js`).
- Real film series + shade SKUs per brand; chips show the marketed shade number, tint-law checks
  use the measured VLT from the spec sheet (they differ on some SKUs, e.g. Autobahn "50" = 47% VLT)
- Per-shade performance card (VLT/TSER/IR/UV) from official spec tables
- 50-state + DC tint-law lookup (front/back/rear/windshield) with legal/too-dark badges —
  informational data in `web/js/tintlaws.js`, last reviewed 2026-07, shown with disclaimer
- Single conversion CTA per brand — "Find a Dealer Near You" — linking to the brand site's own
  dealer-locator page (which iframes the z-tark locator): huperoptikusa.com/store-locator-view,
  autobahnwindowfilms.com/dealer-locator, programedge.com/dealer-locator. Opens with
  `target="_top"` so it escapes the iframe when the visualizer itself is embedded.

## 3D model licenses & credits

All three fleet models are **CC BY 4.0** with a linked in-app credit, a `LICENSE.txt`
next to each file, and a modification notice (they are **de-identified**: badges,
model lettering, plates, and baked brand logos removed; materials rebuilt; compressed
with gltf-transform resize→webp→draco — never `optimize`, it destroys the material
names the glass detection needs).

- `web/assets/models/corvette/car.glb` (3.3 MB) — based on **"Chevrolet Corvette (C7)"**
  by Martin Trafas, sketchfab.com/3d-models/chevrolet-corvette-c7-2b509d1bce104224b147c81757f6f43a
  (author's handle has changed since download; the model page is canonical).
- `web/assets/models/truck/truck.glb` (1.4 MB) — based on **"2018 Ford F-150 Lariat Super
  Crew"** by David_Holiday, sketchfab.com/3d-models/2018-ford-f-150-lariat-super-crew-014ebfab735341248431da3d6447bbb5
  (obtained via allenai/objaverse, uid 014ebfab735341248431da3d6447bbb5).
- `web/assets/models/suv/suv.glb` (1.7 MB) — based on **"2020 BMW X5 M Competition"**
  by David_Holiday, sketchfab.com/3d-models/2020-bmw-x5-m-competition-9b211d525797457e988c903f67d0b753.
- `web/assets/models/carconcept.glb` — **"Car Concept"** by Eric Chadwick / Darmstadt Graphics
  Group, from KhronosGroup/glTF-Sample-Assets, **CC BY 4.0**. Fictional design, named glass
  zones — kept as a neutral fallback; its canopy design shows tint poorly.
- `web/vendor/` — Three.js r160 (MIT) + Draco decoder (Apache-2.0).

De-identification reduces recognizability; it does not license the underlying vehicle
trade dress. Long-term de-risk options are commissioned originals or user-photo mode.

## Photo licenses & credits (photo mode, retained as fallback)

- `web/assets/cars/sedan.jpg` — Tesla Model 3 (2023), Kazyakuruma, **CC0** (no attribution required),
  https://commons.wikimedia.org/wiki/File:Tesla_Model_3_(2023),_long_range,_Japan,_left-side.jpg
- `web/assets/cars/suv.jpg` — Toyota Corolla Cross Hybrid, Autosdeprimera, **CC BY 3.0** (credit shown in-app),
  https://commons.wikimedia.org/wiki/File:2021_Toyota_Corolla_Cross_Hybrid_SEG_(Colombia)_side_view.png
- `web/assets/cars/truck.jpg` — Nissan Frontier Pro-4X, Autosdeprimera, **CC BY 3.0** (credit shown in-app),
  https://commons.wikimedia.org/wiki/File:2021_Nissan_Frontier_Pro_4X_(Colombia;_facelift)_side_view.png

- `web/assets/buildings/residential.jpg` — modern house exterior, Max Vakhtbovych, **Pexels License**
  (free commercial use, no attribution required; credited in-app anyway), pexels.com/photo/7031607
- `web/assets/buildings/commercial.jpg` — Redmond office building, Pixabay via Pexels, **CC0**,
  pexels.com/photo/269077

The CC-BY images are YouTube-CC-BY-sourced Commons files; consider archiving the Commons + YouTube
pages before public launch (belt-and-suspenders on the license grant).

## Files

- `web/js/photocars.js` — photo vehicles: image paths + traced window polygons + credits
- `web/js/vehicles.js` — SVG vehicle art fallback + layer assembly
- `web/js/brands.js` — the 3 brand themes (CSS vars, fonts, logos, copy) + product catalogs
- `web/js/tintlaws.js` — state law dataset + legality check
- `web/js/app.js` — brand-agnostic engine
- `web/css/app.css` — structural styles, themed via CSS vars

## TODO / v2

- Set real `dealerUrl` per brand once the dealer map is hosted
- Replace mailto quote CTA with a real endpoint when hosting exists
- v2: customer photo upload with SAM-assisted window masking (SlimSAM in-browser — see research
  in memory: tint visualizer deep research 2026-07-06)
