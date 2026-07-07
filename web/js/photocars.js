// Photo-based vehicles: real side-profile photos with hand-traced window polygons.
// When this list is non-empty the app uses photos instead of the vector art in vehicles.js.
// zones[].points are polygon coords in the image's native pixel space (w × h).
// Licenses: sedan = Tesla Model 3 (Kazyakuruma, CC0, Wikimedia Commons);
// suv = Toyota Corolla Cross (Autosdeprimera, CC BY 3.0, Wikimedia Commons);
// truck = Nissan Frontier Pro-4X (Autosdeprimera, CC BY 3.0, Wikimedia Commons).

window.PHOTO_CARS = [
  {
    id: "sedan",
    label: "Sedan",
    img: "assets/cars/sedan.png",
    w: 1600, h: 960,
    credit: "", // CC0 — no attribution required
    zones: [
      { zone: "front", points: "552,408 600,362 650,320 695,285 760,270 830,261 886,257 890,388 800,394 700,400 620,405" },
      { zone: "rear",  points: "912,272 1000,277 1080,289 1150,302 1210,316 1264,330 1180,357 1100,371 1020,382 912,392" },
    ],
  },
  {
    id: "suv",
    label: "SUV",
    img: "assets/cars/suv.png",
    w: 1600, h: 800,
    credit: "Photo: Autosdeprimera · CC BY 3.0",
    zones: [
      { zone: "front", points: "716,307 715,180 780,185 845,190 950,295 900,301 800,306" },
      { zone: "rear",  points: "462,308 462,182 660,180 660,306 560,308" },
      { zone: "rear",  points: "264,258 305,222 365,200 436,186 438,298 350,291 284,284" },
    ],
  },
  {
    id: "truck",
    label: "Pickup",
    img: "assets/cars/truck.png",
    w: 1600, h: 686,
    credit: "Photo: Autosdeprimera · CC BY 3.0",
    zones: [
      { zone: "front", points: "860,292 858,155 912,151 960,196 1000,240 1015,262 1005,280 940,288" },
      { zone: "rear",  points: "597,288 596,172 610,153 700,148 840,150 843,155 845,292 700,291" },
    ],
  },
];
