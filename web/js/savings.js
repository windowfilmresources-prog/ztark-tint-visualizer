// Fuel & energy savings estimator for automotive window film.
//
// Model chain: solar radiation through glazing -> cabin heat load -> A/C load
// -> fuel (or battery). Film is modeled on SIDE + REAR glass only (windshield
// film is excluded, matching law and the visualizer's zones).
//
//   savings = AC_energy(climate, miles)          annual A/C fuel or kWh
//           x SOLAR_SHARE                        A/C load caused by sun through glass
//           x FILMED_SHARE                       portion of that on filmable surfaces
//           x dR                                 incremental rejection of the film
//   dR = (TSER_film - TSER_factory_glass) / (1 - TSER_factory_glass)
//
// TSER spec values already include the glass the film is measured on, so the
// factory-glass baseline keeps us honest: film only saves what the factory
// glass wasn't already rejecting.
//
// Constants are intentionally conservative; each carries its basis. The
// PROVISIONAL tags are being tightened against primary sources (NREL/LBNL/SAE)
// — structure will not change, values may move slightly.
(function () {
  var C = {
    // National-average annual A/C fuel for a conventional gas car. VERIFIED:
    // NREL (Rugh et al. 2018, SAE 06-12-01-0002 / NREL CP-5400-69047): U.S.
    // light-duty A/C fuel = 7.59B gal/yr = 6.1% of LD fuel = 30.0 gal per
    // vehicle-year (11,346 mi/yr avg). docs.nrel.gov/docs/fy18osti/69047.pdf
    AC_GALLONS_BASE: 30,
    // EV annual cooling energy. Recurrent 2023 telematics (~5% range loss at
    // 90F; ~1 kW steady / 3-5 kW pulldown) + Geotab 2025: cooling = 4-7% of
    // ~3,800 kWh/yr => 150-280 kWh band; 220 = midpoint (260 was the hot-
    // climate top of the band — the TIER multiplier handles hot states).
    // STILL PROVISIONAL (no published annual cooling-only figure exists).
    AC_KWH_BASE: 220,
    // Hybrids: electric compressor + efficient engine burn less fuel for the
    // same cooling. Engineering ratio (thermal load served at ~35% avg engine
    // efficiency + no idle-drag compressor vs ~25% incl. idle) = 0.6-0.7 band;
    // direction confirmed by fueleconomy.gov/feg/hotweather + ANL SAE
    // 2013-01-1462. STILL PROVISIONAL.
    HYBRID_FACTOR: 0.65,
    // Share of ANNUAL A/C energy attributable to solar gain through GLAZING.
    // Derived from Rugh 2018 Table 5: solar-control glass cutting transmitted
    // solar ~25% on ALL glazing saves 8.7% of annual A/C fuel => glazing solar
    // ~= 0.087/0.25 ~= 0.35 of A/C load. (NREL 1999 co-heating test CP-540-
    // 26615 shows ~48% of parked-SOAK gain is glazing, but drive-time A/C adds
    // ambient/ventilation/pull-down load, diluting the solar share. The old
    // 0.5 overstated savings ~40%.)
    SOLAR_SHARE: 0.35,
    // Share of glazing solar gain arriving through FILMABLE surfaces (sides +
    // rear; windshield excluded — it is the single largest solar aperture).
    // Basis: glazing area breakdowns weighted for orientation. PROVISIONAL.
    FILMED_SHARE: 0.5,
    // TSER of typical factory automotive glass. Rugh 2018 baseline production
    // side glazing Tds=45.1% (ISO 13837) => SHGC ~0.60, TSER ~0.38-0.42;
    // 0.37 is the conservative edge. VERIFIED-CONSERVATIVE.
    FACTORY_GLASS_TSER: 0.37,
    // EPA: 8,887 g CO2 per gallon of gasoline.
    CO2_LB_PER_GAL: 19.6,
    MILES_BASE: 13500, // FHWA average annual miles
    // Filmable glazing splits front sides vs rear surfaces (back sides + backlight).
    // Rear carries more area on most bodies. PROVISIONAL.
    FRONT_SHARE: 0.45,
    // Factory deep-dyed "privacy" glass baseline on rear surfaces where fitted
    // (most trucks/SUVs/vans). Rugh 2018 measured privacy glass Tds ~16.6% =>
    // TSER ~0.6 — film adds little on glass that dark, and we only credit the
    // difference.
    PRIVACY_GLASS_TSER: 0.6,
  };

  // Body-style factors: relative filmable glazing area (sedan = 1.0) and
  // whether rear surfaces typically ship with factory privacy glass. PROVISIONAL.
  var BODY = {
    sedan: { glaze: 1.0,  privacy: false, label: "Sedan / Coupe" },
    suv:   { glaze: 1.35, privacy: true,  label: "SUV" },
    truck: { glaze: 1.1,  privacy: true,  label: "Truck" },
    van:   { glaze: 1.5,  privacy: true,  label: "Minivan" },
  };

  // Climate tiers scale A/C energy with cooling demand. State groupings by
  // cooling-degree-day bands. PROVISIONAL multipliers.
  var TIER = {
    hot: 1.6, warm: 1.15, moderate: 0.85, cool: 0.55,
  };
  var STATE_TIER = {
    AZ: "hot", NV: "hot", TX: "hot", FL: "hot", LA: "hot", MS: "hot", AL: "hot",
    GA: "hot", SC: "hot", OK: "hot", AR: "hot", HI: "hot", NM: "hot",
    CA: "warm", NC: "warm", TN: "warm", KY: "warm", VA: "warm", MO: "warm",
    KS: "warm", MD: "warm", DE: "warm", DC: "warm", NJ: "warm", IL: "warm", IN: "warm",
    OH: "moderate", PA: "moderate", NY: "moderate", CT: "moderate", RI: "moderate",
    MA: "moderate", IA: "moderate", NE: "moderate", UT: "moderate", CO: "moderate", WV: "moderate",
    WA: "cool", OR: "cool", ID: "cool", MT: "cool", WY: "cool", ND: "cool", SD: "cool",
    MN: "cool", WI: "cool", MI: "cool", VT: "cool", NH: "cool", ME: "cool", AK: "cool",
  };

  function fmtMoney(x) {
    return "$" + (x >= 100 ? Math.round(x) : x.toFixed(x >= 10 ? 0 : 2));
  }

  window.SAVINGS = {
    DEFAULT_GAS_PRICE: 3.10,
    DEFAULT_KWH_PRICE: 0.17,

    BODY: BODY,

    compute: function (o) {
      var tierKey = (o.usState && STATE_TIER[o.usState]) || null;
      var tier = tierKey ? TIER[tierKey] : 1.0;
      var milesScale = (o.miles || C.MILES_BASE) / C.MILES_BASE;
      var body = BODY[o.body] || BODY.sedan;
      var tser = Math.max(0, Math.min(1, (o.tser || 0) / 100));
      // incremental rejection per surface group: rear surfaces of most
      // trucks/SUVs already carry dark factory privacy glass, so film adds
      // less there than on the clear front doors
      var inc = function (g) { return Math.max(0, tser - g) / (1 - g); };
      var dFront = inc(C.FACTORY_GLASS_TSER);
      var dRear = inc(body.privacy ? C.PRIVACY_GLASS_TSER : C.FACTORY_GLASS_TSER);
      var dR = C.FRONT_SHARE * dFront + (1 - C.FRONT_SHARE) * dRear;

      var solarCut = Math.round(dR * 100); // honest headline: heat through filmed glass cut by this
      var ev = o.mode === "ev";
      var price = o.price || (ev ? this.DEFAULT_KWH_PRICE : this.DEFAULT_GAS_PRICE);

      var tiles, note;
      var chain = C.SOLAR_SHARE * C.FILMED_SHARE * dR * tier * milesScale * body.glaze;
      if (ev) {
        var kwh = C.AC_KWH_BASE * chain;
        tiles = [
          [fmtMoney(kwh * price) + "/yr", "Est. energy savings"],
          [Math.round(kwh) + " kWh/yr", "Less battery drain"],
          ["−" + solarCut + "%", "Solar heat via tinted glass"],
        ];
      } else {
        var gal = C.AC_GALLONS_BASE * chain * (o.mode === "hybrid" ? C.HYBRID_FACTOR : 1);
        tiles = [
          [fmtMoney(gal * price) + "/yr", "Est. fuel savings"],
          [gal.toFixed(1) + " gal/yr", "Less fuel burned"],
          ["−" + solarCut + "%", "Solar heat via tinted glass"],
        ];
      }
      note =
        (tierKey
          ? "Climate-adjusted for your selected state (" + tierKey + " tier)."
          : "U.S.-average climate — pick your state above for a local estimate.") +
        " Modeled on U.S. DOE / NREL vehicle air-conditioning research: sun through the glass drives A/C load, and this film rejects " +
        solarCut + "% of the solar energy your factory glass lets through on tinted surfaces" +
        (body.privacy ? " (factory privacy glass on the rear already rejects some — we only credit the film for the difference)" : "") +
        ". Windshield excluded. Estimates are directional — actual savings vary with parking, usage, and vehicle. " +
        "The comfort difference (cooler cabin, faster cool-down, less rolled-down driving) comes free either way.";
      return { tiles: tiles, note: note, solarCut: solarCut };
    },
  };
})();
