// Cooling-cost savings estimator for ARCHITECTURAL (flat-glass) film — the
// building-space counterpart of savings.js.
//
// Model chain: cooling-season solar load through vertical glazing -> AC load
// removed by the film -> electricity -> dollars, using regional typicals the
// user can override.
//
//   L (kBTU/sqft-yr) = 32 + 0.023 x CDD      solar heat through clear vertical
//                                            glass over the cooling season,
//                                            calibrated so Phoenix ~ 122,
//                                            Houston ~ 99, NYC ~ 50. PROVISIONAL.
//   kWh saved = sqft x L x TSER / SEER       SEER = BTU per Wh, so kBTU/SEER = kWh
//   $ saved   = kWh x rate                   regional residential rate (EIA)
//   payback   = (sqft x $/sqft) / $ saved
//
// TSER is the film's spec-sheet Total Solar Energy Rejected — measured on
// glass, so no factory-glass adjustment is needed (unlike automotive, the
// baseline here IS clear glass).
(function () {
  // state -> { name, cdd (annual base-65 cooling degree days, population-
  // weighted approx from NOAA normals), rate ($/kWh residential, EIA approx) }
  var STATES = {
    AL: { name: "Alabama", cdd: 2000, rate: 0.15 },      AK: { name: "Alaska", cdd: 50, rate: 0.24 },
    AZ: { name: "Arizona", cdd: 3900, rate: 0.14 },      AR: { name: "Arkansas", cdd: 1900, rate: 0.13 },
    CA: { name: "California", cdd: 1100, rate: 0.30 },   CO: { name: "Colorado", cdd: 800, rate: 0.15 },
    CT: { name: "Connecticut", cdd: 750, rate: 0.28 },   DE: { name: "Delaware", cdd: 1200, rate: 0.16 },
    DC: { name: "Washington DC", cdd: 1600, rate: 0.17 },FL: { name: "Florida", cdd: 3500, rate: 0.15 },
    GA: { name: "Georgia", cdd: 2000, rate: 0.14 },      HI: { name: "Hawaii", cdd: 3300, rate: 0.42 },
    ID: { name: "Idaho", cdd: 750, rate: 0.11 },         IL: { name: "Illinois", cdd: 1100, rate: 0.15 },
    IN: { name: "Indiana", cdd: 1100, rate: 0.15 },      IA: { name: "Iowa", cdd: 1000, rate: 0.13 },
    KS: { name: "Kansas", cdd: 1600, rate: 0.14 },       KY: { name: "Kentucky", cdd: 1400, rate: 0.13 },
    LA: { name: "Louisiana", cdd: 2800, rate: 0.12 },    ME: { name: "Maine", cdd: 350, rate: 0.24 },
    MD: { name: "Maryland", cdd: 1300, rate: 0.17 },     MA: { name: "Massachusetts", cdd: 650, rate: 0.30 },
    MI: { name: "Michigan", cdd: 700, rate: 0.19 },      MN: { name: "Minnesota", cdd: 700, rate: 0.15 },
    MS: { name: "Mississippi", cdd: 2300, rate: 0.13 },  MO: { name: "Missouri", cdd: 1500, rate: 0.12 },
    MT: { name: "Montana", cdd: 450, rate: 0.12 },       NE: { name: "Nebraska", cdd: 1200, rate: 0.11 },
    NV: { name: "Nevada", cdd: 2900, rate: 0.14 },       NH: { name: "New Hampshire", cdd: 500, rate: 0.24 },
    NJ: { name: "New Jersey", cdd: 1100, rate: 0.18 },   NM: { name: "New Mexico", cdd: 1500, rate: 0.14 },
    NY: { name: "New York", cdd: 800, rate: 0.23 },      NC: { name: "North Carolina", cdd: 1600, rate: 0.13 },
    ND: { name: "North Dakota", cdd: 550, rate: 0.11 },  OH: { name: "Ohio", cdd: 1000, rate: 0.15 },
    OK: { name: "Oklahoma", cdd: 2100, rate: 0.12 },     OR: { name: "Oregon", cdd: 450, rate: 0.12 },
    PA: { name: "Pennsylvania", cdd: 1000, rate: 0.17 }, RI: { name: "Rhode Island", cdd: 700, rate: 0.28 },
    SC: { name: "South Carolina", cdd: 2100, rate: 0.14 },SD: { name: "South Dakota", cdd: 800, rate: 0.12 },
    TN: { name: "Tennessee", cdd: 1700, rate: 0.12 },    TX: { name: "Texas", cdd: 2900, rate: 0.15 },
    UT: { name: "Utah", cdd: 1100, rate: 0.11 },         VT: { name: "Vermont", cdd: 400, rate: 0.21 },
    VA: { name: "Virginia", cdd: 1500, rate: 0.14 },     WA: { name: "Washington", cdd: 350, rate: 0.11 },
    WV: { name: "West Virginia", cdd: 1000, rate: 0.14 },WI: { name: "Wisconsin", cdd: 700, rate: 0.17 },
    WY: { name: "Wyoming", cdd: 500, rate: 0.12 },
  };

  // ZIP prefix (first 3 digits) -> state, as [lo, hi, state] ranges
  var ZIP3 = [
    [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"], [50, 59, "VT"],
    [60, 69, "CT"], [70, 89, "NJ"], [100, 149, "NY"], [150, 196, "PA"], [197, 199, "DE"],
    [200, 205, "DC"], [206, 219, "MD"], [220, 246, "VA"], [247, 268, "WV"], [270, 289, "NC"],
    [290, 299, "SC"], [300, 319, "GA"], [320, 349, "FL"], [350, 369, "AL"], [370, 385, "TN"],
    [386, 397, "MS"], [398, 399, "GA"], [400, 427, "KY"], [430, 459, "OH"], [460, 479, "IN"],
    [480, 499, "MI"], [500, 528, "IA"], [530, 549, "WI"], [550, 567, "MN"], [570, 577, "SD"],
    [580, 588, "ND"], [590, 599, "MT"], [600, 629, "IL"], [630, 658, "MO"], [660, 679, "KS"],
    [680, 693, "NE"], [700, 714, "LA"], [716, 729, "AR"], [730, 749, "OK"], [750, 799, "TX"],
    [800, 816, "CO"], [820, 831, "WY"], [832, 838, "ID"], [840, 847, "UT"], [850, 865, "AZ"],
    [870, 884, "NM"], [885, 885, "TX"], [889, 898, "NV"], [900, 966, "CA"],
    [967, 968, "HI"], [970, 979, "OR"], [980, 994, "WA"], [995, 999, "AK"],
  ];

  var C = {
    // "Average home AC for the area": DOE minimums are SEER2 14.3 South/SW vs
    // 13.4 North, installed stock runs a bit above minimum. PROVISIONAL.
    SEER_HOT: 14.5,
    SEER_COOL: 13.5,
    // Commercial spaces cool longer occupied hours with higher internal gains,
    // so a sqft of glass removes more annual AC energy than in a home; packaged
    // rooftop units also run less efficient than home splits. Net factor on
    // energy, and commercial power is cheaper than residential. PROVISIONAL.
    COMMERCIAL_LOAD: 1.3,
    COMMERCIAL_RATE: 0.8,
    // Typical installed film price bands ($/sqft) — dealer-quotable defaults.
    COST_RES: 9,
    COST_COM: 7,
    // Default glass areas: average U.S. home ~15-20 windows ~ 180 sqft;
    // small commercial storefront/office ~ 1200 sqft of glazing.
    SQFT_RES: 180,
    SQFT_COM: 1200,
  };

  function zipToState(zip) {
    var p = parseInt(String(zip || "").trim().slice(0, 3), 10);
    if (isNaN(p)) return null;
    for (var i = 0; i < ZIP3.length; i++) {
      if (p >= ZIP3[i][0] && p <= ZIP3[i][1]) return ZIP3[i][2];
    }
    return null;
  }

  function fmtMoney(x) {
    return "$" + (x >= 100 ? Math.round(x).toLocaleString() : x.toFixed(x >= 10 ? 0 : 2));
  }

  window.BSAVINGS = {
    STATES: STATES,
    C: C,
    zipToState: zipToState,

    defaults: function (space) {
      var com = space === "commercial";
      return { sqft: com ? C.SQFT_COM : C.SQFT_RES, cost: com ? C.COST_COM : C.COST_RES };
    },

    // o: { sqft, tser (0-100), usState, commercial, costPerSqft, rate?, seer? }
    compute: function (o) {
      var s = STATES[o.usState] || { name: null, cdd: 1500, rate: 0.15 };
      var com = !!o.commercial;
      var seer = o.seer || (s.cdd >= 1800 ? C.SEER_HOT : C.SEER_COOL);
      var rate = o.rate || s.rate * (com ? C.COMMERCIAL_RATE : 1);
      var tser = Math.max(0, Math.min(1, (o.tser || 0) / 100));
      var sqft = Math.max(0, o.sqft || 0);

      var load = (32 + 0.023 * s.cdd) * (com ? C.COMMERCIAL_LOAD : 1); // kBTU/sqft-yr
      var kwh = (sqft * load * tser) / seer;
      var dollars = kwh * rate;
      var cost = sqft * (o.costPerSqft || (com ? C.COST_COM : C.COST_RES));
      var payback = dollars > 0 ? cost / dollars : null;

      var tiles = [
        [fmtMoney(dollars) + "/yr", "Est. cooling savings"],
        [Math.round(kwh).toLocaleString() + " kWh/yr", "AC load removed"],
        [payback ? (payback >= 20 ? "20+ yrs" : payback.toFixed(payback >= 10 ? 0 : 1) + " yrs") : "—",
         "Film pays for itself"],
      ];
      var note =
        (s.name
          ? s.name + ": ~" + s.cdd.toLocaleString() + " cooling degree days, $" + rate.toFixed(2) +
            "/kWh, SEER " + seer + " average AC."
          : "U.S.-average climate — enter your ZIP above for a local estimate.") +
        " This film rejects " + Math.round(tser * 100) + "% of solar heat before your AC has to pump it back out" +
        (com ? "; commercial spaces cool longer hours, so glass works harder" : "") +
        ". Estimate covers cooling energy only — glare relief, 99% UV / fade protection, and comfort come on top. " +
        "Directional numbers (NOAA / EIA / DOE typicals); orientation, shading and glass type move the real answer. " +
        "Install cost estimated at " + fmtMoney(o.costPerSqft || (com ? C.COST_COM : C.COST_RES)) + "/sq ft — your dealer quotes the real price.";
      return { tiles: tiles, note: note, dollars: dollars, kwh: kwh, payback: payback };
    },
  };
})();
