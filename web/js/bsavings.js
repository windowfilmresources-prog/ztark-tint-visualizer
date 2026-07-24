// Cooling-cost savings estimator for ARCHITECTURAL (flat-glass) film — the
// building-space counterpart of savings.js.
//
// Model chain: cooling-season solar load through vertical glazing -> AC load
// removed by the film -> electricity -> dollars, using regional typicals the
// user can override.
//
//   L (kBTU/sqft-yr) = 32 + 0.023 x CDD      solar heat through clear vertical
//                                            glass over the cooling season; with
//                                            the sourced CDD table this gives
//                                            AZ ~102, TX ~96, FL ~115, NY ~46.
//                                            Coefficient itself PROVISIONAL.
//   kWh saved = sqft x L x TSER / SEER       SEER = BTU per Wh, so kBTU/SEER = kWh
//   $ saved   = kWh x rate                   regional residential rate (EIA)
//   payback   = (sqft x $/sqft) / $ saved
//
// TSER is the film's spec-sheet Total Solar Energy Rejected — measured on
// glass, so no factory-glass adjustment is needed (unlike automotive, the
// baseline here IS clear glass).
(function () {
  // state -> { name, cdd, rate } — SOURCED (was PROVISIONAL):
  //   cdd: EIA State Energy Data System "Energy Indicators" series ZWCDP —
  //        population-weighted NOAA cooling degree days (base 65F), averaged
  //        1991-2020 to match NOAA normals, rounded to 50. AK true value ~16,
  //        floored to 50. Cross-checked against NOAA CPC weighted dailies.
  //        eia.gov/state/seds/sep_indicators/energy_indicators.csv
  //   rate: EIA Electric Power Monthly Table 5.6.A, residential, April 2026
  //        (released 6/2026). eia.gov/electricity/monthly (epmt_5_6_a)
  var STATES = {
    AL: { name: "Alabama", cdd: 1950, rate: 0.174 },      AK: { name: "Alaska", cdd: 50, rate: 0.274 },
    AZ: { name: "Arizona", cdd: 3050, rate: 0.155 },      AR: { name: "Arkansas", cdd: 1750, rate: 0.142 },
    CA: { name: "California", cdd: 950, rate: 0.353 },   CO: { name: "Colorado", cdd: 350, rate: 0.165 },
    CT: { name: "Connecticut", cdd: 600, rate: 0.322 },   DE: { name: "Delaware", cdd: 1150, rate: 0.188 },
    DC: { name: "Washington DC", cdd: 1700, rate: 0.254 },FL: { name: "Florida", cdd: 3600, rate: 0.154 },
    GA: { name: "Georgia", cdd: 1750, rate: 0.154 },      HI: { name: "Hawaii", cdd: 4650, rate: 0.466 },
    ID: { name: "Idaho", cdd: 500, rate: 0.127 },         IL: { name: "Illinois", cdd: 900, rate: 0.205 },
    IN: { name: "Indiana", cdd: 900, rate: 0.179 },      IA: { name: "Iowa", cdd: 800, rate: 0.139 },
    KS: { name: "Kansas", cdd: 1450, rate: 0.158 },       KY: { name: "Kentucky", cdd: 1250, rate: 0.150 },
    LA: { name: "Louisiana", cdd: 2700, rate: 0.144 },    ME: { name: "Maine", cdd: 250, rate: 0.284 },
    MD: { name: "Maryland", cdd: 1150, rate: 0.221 },     MA: { name: "Massachusetts", cdd: 500, rate: 0.295 },
    MI: { name: "Michigan", cdd: 600, rate: 0.214 },      MN: { name: "Minnesota", cdd: 450, rate: 0.164 },
    MS: { name: "Mississippi", cdd: 2200, rate: 0.168 },  MO: { name: "Missouri", cdd: 1250, rate: 0.140 },
    MT: { name: "Montana", cdd: 200, rate: 0.139 },       NE: { name: "Nebraska", cdd: 1000, rate: 0.133 },
    NV: { name: "Nevada", cdd: 2150, rate: 0.143 },       NH: { name: "New Hampshire", cdd: 300, rate: 0.272 },
    NJ: { name: "New Jersey", cdd: 850, rate: 0.235 },   NM: { name: "New Mexico", cdd: 1000, rate: 0.152 },
    NY: { name: "New York", cdd: 600, rate: 0.295 },      NC: { name: "North Carolina", cdd: 1450, rate: 0.163 },
    ND: { name: "North Dakota", cdd: 450, rate: 0.124 },  OH: { name: "Ohio", cdd: 800, rate: 0.195 },
    OK: { name: "Oklahoma", cdd: 1900, rate: 0.133 },     OR: { name: "Oregon", cdd: 250, rate: 0.158 },
    PA: { name: "Pennsylvania", cdd: 700, rate: 0.215 }, RI: { name: "Rhode Island", cdd: 550, rate: 0.283 },
    SC: { name: "South Carolina", cdd: 1950, rate: 0.171 },SD: { name: "South Dakota", cdd: 700, rate: 0.145 },
    TN: { name: "Tennessee", cdd: 1400, rate: 0.149 },    TX: { name: "Texas", cdd: 2800, rate: 0.170 },
    UT: { name: "Utah", cdd: 550, rate: 0.133 },         VT: { name: "Vermont", cdd: 200, rate: 0.246 },
    VA: { name: "Virginia", cdd: 1150, rate: 0.174 },     WA: { name: "Washington", cdd: 200, rate: 0.144 },
    WV: { name: "West Virginia", cdd: 800, rate: 0.161 },WI: { name: "Wisconsin", cdd: 500, rate: 0.192 },
    WY: { name: "Wyoming", cdd: 300, rate: 0.147 },
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
    // energy PROVISIONAL; the rate ratio is EIA-sourced (US avg 4/2026:
    // commercial 13.51 c/kWh vs residential 18.83 = 0.72).
    COMMERCIAL_LOAD: 1.3,
    COMMERCIAL_RATE: 0.72,
    // Typical installed film price bands ($/sqft) — dealer-quotable defaults.
    COST_RES: 9,
    COST_COM: 7,
    // Default glass areas: average U.S. home ~15-20 windows ~ 180 sqft;
    // small commercial storefront/office ~ 1200 sqft of glazing.
    SQFT_RES: 180,
    SQFT_COM: 1200,

    // --- full-value ROI additions ---
    // People film the SUN-FACING glass (south/west), which over a cooling
    // season transmits well above a whole-house all-orientation average. ASHRAE
    // orientation factors put S/W vertical glass ~1.5-2x the 4-way mean (north
    // is ~0.4x and rarely filmed). 1.6 models the sun-exposed glass film goes on.
    SUN_FACING: 1.6,
    // UV / fade protection ($/sqft-yr of sun glass): film blocks 99% UV, the
    // leading cause of fading in furnishings, flooring and art near sun windows.
    // Value = deferred replacement of those goods, amortized. Conservative
    // ESTIMATE (homes carry more fade-prone soft goods than commercial fitouts).
    FADE_RES: 0.55,
    FADE_COM: 0.35,
    // Commercial buildings pay DEMAND charges ($/kW of monthly peak). Film cuts
    // the peak afternoon solar cooling load, trimming that peak. Modeled as a
    // fraction of commercial energy savings (peak-solar/demand coincidence
    // ~0.4 x typical $10-15/kW-mo). ESTIMATE.
    DEMAND_COM: 0.35,
    // Film warranty horizon for the lifetime-savings headline (Huper: lifetime
    // residential / 15-yr commercial; Edge similar) — use 15 yr for both.
    WARRANTY_YRS: 15,
    // Long-run electricity + replacement-cost inflation (EIA real+nominal
    // electricity price growth has run ~2-3%/yr). Compounds the lifetime total.
    ESCALATION: 0.03,
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

  // compact form for the big lifetime headline, e.g. $5,900 / $48k
  function fmtBig(x) {
    if (x >= 10000) return "$" + Math.round(x / 1000) + "k";
    return "$" + (Math.round(x / 100) * 100).toLocaleString();
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
      var seer = o.seer || (s.cdd >= 1400 ? C.SEER_HOT : C.SEER_COOL);
      var rate = o.rate || s.rate * (com ? C.COMMERCIAL_RATE : 1);
      var tser = Math.max(0, Math.min(1, (o.tser || 0) / 100));
      var sqft = Math.max(0, o.sqft || 0);
      var costSqft = o.costPerSqft || (com ? C.COST_COM : C.COST_RES);

      // 1) cooling energy — modeled on the SUN-FACING glass film actually goes on
      var load = (32 + 0.023 * s.cdd) * C.SUN_FACING * (com ? C.COMMERCIAL_LOAD : 1); // kBTU/sqft-yr
      var kwh = (sqft * load * tser) / seer;
      var energy = kwh * rate;
      // 2) UV / fade protection — deferred replacement of sun-faded goods
      var fade = sqft * (com ? C.FADE_COM : C.FADE_RES);
      // 3) commercial demand-charge savings (peak cooling load trimmed)
      var demand = com ? energy * C.DEMAND_COM : 0;

      var annual = energy + fade + demand;
      var cost = sqft * costSqft;
      var payback = annual > 0 ? cost / annual : null;

      // lifetime savings over the warranty horizon, with cost escalation
      var n = C.WARRANTY_YRS, g = C.ESCALATION;
      var mult = g > 0 ? (Math.pow(1 + g, n) - 1) / g : n; // ~18.6 for 3%/15yr
      var lifetime = annual * mult;

      var pb = payback
        ? (payback >= 20 ? "20+ yrs" : payback.toFixed(payback >= 10 ? 0 : 1) + " yrs")
        : "—";
      var tiles = [
        [fmtBig(lifetime), "Saved over " + n + " years"],
        [pb, "Pays for itself in"],
        [fmtMoney(annual) + "/yr", "Total value / year"],
      ];

      // itemized, sourced breakdown
      var parts = [fmtMoney(energy) + " cooling energy", fmtMoney(fade) + " UV / fade protection"];
      if (com) parts.splice(1, 0, fmtMoney(demand) + " peak-demand charges");
      var note =
        "<b>" + fmtMoney(annual) + "/yr</b> = " + parts.join(" + ") + ". " +
        (s.name
          ? s.name + ": ~" + s.cdd.toLocaleString() + " cooling degree days, $" + rate.toFixed(2) +
            "/kWh, SEER " + seer + " average AC. "
          : "U.S.-average climate — enter your ZIP above for a local estimate. ") +
        "This film rejects " + Math.round(tser * 100) + "% of solar heat, and blocks 99% of the UV that fades " +
        "furnishings, floors and art near the glass" + (com ? "; commercial spaces cool longer hours and pay peak-demand charges, so the glass works harder" : "") + ". " +
        "Modeled on the sun-facing glass film is applied to; comfort and glare relief come on top of these numbers. " +
        "Lifetime figure covers " + n + " years with ~" + Math.round(g * 100) + "%/yr energy inflation. " +
        "Directional estimate (NOAA / EIA / DOE / ASHRAE typicals + IWFA fade guidance); orientation, shading and glass type move the real answer. " +
        "Install estimated at " + fmtMoney(costSqft) + "/sq ft — your dealer quotes the exact price.";
      return { tiles: tiles, note: note, dollars: annual, energy: energy, fade: fade,
               demand: demand, kwh: kwh, payback: payback, lifetime: lifetime };
    },
  };
})();
