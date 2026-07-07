// State tint-law reference (passenger sedans; SUV/van rules differ in some states — see notes).
// Values are the MINIMUM legal VLT % for aftermarket film per window position.
//   number  = minimum VLT allowed (film+glass net VLT in most states)
//   "any"   = any darkness permitted
//   "none"  = no aftermarket tint permitted on that position
//   "strip" = only a top strip is permitted (see note)
// windshield = allowed tint area at the top of the windshield ("AS-1" = above the AS-1 line).
// INFORMATIONAL ONLY — laws change; users must verify with local authorities. Shown with disclaimer.

window.TINT_LAWS = {
  meta: {
    lastReviewed: "2026-07",
    disclaimer:
      "Tint laws shown are informational, based on passenger-car rules, and may be out of date. " +
      "Many states measure net VLT (film + factory glass combined), have different rules for SUVs/vans, " +
      "reflectivity limits, and medical exemptions. Always verify current law with local authorities before installation.",
  },
  states: {
    AL: { name: "Alabama",        front: 32,     back: 32,    rear: 32,    windshield: "Top 6 in." },
    AK: { name: "Alaska",         front: 70,     back: 40,    rear: 40,    windshield: "Top 5 in." },
    AZ: { name: "Arizona",        front: 33,     back: "any", rear: "any", windshield: "Above AS-1 line" },
    AR: { name: "Arkansas",       front: 25,     back: 25,    rear: 10,    windshield: "Top 5 in." },
    CA: { name: "California",     front: 70,     back: "any", rear: "any", windshield: "Top 4 in." },
    CO: { name: "Colorado",       front: 27,     back: 27,    rear: 27,    windshield: "Top 4 in., non-reflective" },
    CT: { name: "Connecticut",    front: 35,     back: 35,    rear: "any", windshield: "Above AS-1 line", note: "Rear window: any darkness with dual side mirrors." },
    DE: { name: "Delaware",       front: 70,     back: "any", rear: "any", windshield: "Above AS-1 line" },
    DC: { name: "Washington, D.C.", front: 70,   back: 50,    rear: 50,    windshield: "Top 5 in." },
    FL: { name: "Florida",        front: 28,     back: 15,    rear: 15,    windshield: "Above AS-1 line" },
    GA: { name: "Georgia",        front: 32,     back: 32,    rear: 32,    windshield: "Top 6 in." },
    HI: { name: "Hawaii",         front: 35,     back: 35,    rear: 35,    windshield: "No tint below AS-1 line" },
    ID: { name: "Idaho",          front: 35,     back: 20,    rear: 35,    windshield: "Above AS-1 line" },
    IL: { name: "Illinois",       front: 35,     back: 35,    rear: 35,    windshield: "Top 6 in.", note: "SUVs/vans: front 50%, back/rear any darkness." },
    IN: { name: "Indiana",        front: 30,     back: 30,    rear: 30,    windshield: "Above AS-1 line" },
    IA: { name: "Iowa",           front: 70,     back: "any", rear: "any", windshield: "Above AS-1 line" },
    KS: { name: "Kansas",         front: 35,     back: 35,    rear: 35,    windshield: "Above AS-1 line" },
    KY: { name: "Kentucky",       front: 35,     back: 18,    rear: 18,    windshield: "Above AS-1 line" },
    LA: { name: "Louisiana",      front: 40,     back: 25,    rear: 12,    windshield: "Above AS-1 line" },
    ME: { name: "Maine",          front: 35,     back: "any", rear: "any", windshield: "Above AS-1 line" },
    MD: { name: "Maryland",       front: 35,     back: 35,    rear: 35,    windshield: "Top 5 in." },
    MA: { name: "Massachusetts",  front: 35,     back: 35,    rear: 35,    windshield: "Top 6 in." },
    MI: { name: "Michigan",       front: "strip", back: "any", rear: "any", windshield: "Top 4 in.", note: "Front side windows: tint allowed only on the top 4 inches." },
    MN: { name: "Minnesota",      front: 50,     back: 50,    rear: 50,    windshield: "No tint permitted" },
    MS: { name: "Mississippi",    front: 28,     back: 28,    rear: 28,    windshield: "Above AS-1 line" },
    MO: { name: "Missouri",       front: 35,     back: "any", rear: "any", windshield: "Above AS-1 line" },
    MT: { name: "Montana",        front: 24,     back: 14,    rear: 14,    windshield: "Above AS-1 line" },
    NE: { name: "Nebraska",       front: 35,     back: 20,    rear: 20,    windshield: "Top 5 in." },
    NV: { name: "Nevada",         front: 35,     back: "any", rear: "any", windshield: "Above AS-1 line" },
    NH: { name: "New Hampshire",  front: "none", back: 35,    rear: 35,    windshield: "Top 6 in." },
    NJ: { name: "New Jersey",     front: "none", back: "any", rear: "any", windshield: "No tint permitted" },
    NM: { name: "New Mexico",     front: 20,     back: 20,    rear: 20,    windshield: "Top 5 in." },
    NY: { name: "New York",       front: 70,     back: 70,    rear: "any", windshield: "Top 6 in." },
    NC: { name: "North Carolina", front: 35,     back: 35,    rear: 35,    windshield: "Above AS-1 line" },
    ND: { name: "North Dakota",   front: 50,     back: "any", rear: "any", windshield: "70% minimum if tinted" },
    OH: { name: "Ohio",           front: 50,     back: "any", rear: "any", windshield: "70% minimum on top strip" },
    OK: { name: "Oklahoma",       front: 25,     back: 25,    rear: 25,    windshield: "Above AS-1 line" },
    OR: { name: "Oregon",         front: 35,     back: 35,    rear: 35,    windshield: "Top 6 in." },
    PA: { name: "Pennsylvania",   front: 70,     back: 70,    rear: 70,    windshield: "Above AS-1 line" },
    RI: { name: "Rhode Island",   front: 70,     back: 70,    rear: 70,    windshield: "Above AS-1 line" },
    SC: { name: "South Carolina", front: 27,     back: 27,    rear: 27,    windshield: "Above AS-1 line" },
    SD: { name: "South Dakota",   front: 35,     back: 20,    rear: 20,    windshield: "Above AS-1 line" },
    TN: { name: "Tennessee",      front: 35,     back: 35,    rear: 35,    windshield: "Above AS-1 line" },
    TX: { name: "Texas",          front: 25,     back: 25,    rear: "any", windshield: "Top 5 in. / above AS-1 line", note: "Rear window: any darkness with dual side mirrors." },
    UT: { name: "Utah",           front: 35,     back: "any", rear: "any", windshield: "Above AS-1 line" },
    VT: { name: "Vermont",        front: "none", back: "any", rear: "any", windshield: "Above AS-1 line" },
    VA: { name: "Virginia",       front: 50,     back: 35,    rear: 35,    windshield: "Above AS-1 line" },
    WA: { name: "Washington",     front: 24,     back: 24,    rear: 24,    windshield: "Top 6 in." },
    WV: { name: "West Virginia",  front: 35,     back: 35,    rear: 35,    windshield: "Top 5 in." },
    WI: { name: "Wisconsin",      front: 50,     back: 35,    rear: 35,    windshield: "No tint below AS-1 line" },
    WY: { name: "Wyoming",        front: 28,     back: 28,    rear: 28,    windshield: "Top 5 in." },
  },

  // Is `vlt` legal for a given rule value? `badge` is the word shown when not ok.
  check(rule, vlt) {
    if (rule === "any") return { ok: true, label: "Any darkness allowed", badge: "Legal" };
    if (rule === "none") return { ok: vlt >= 100, label: "No aftermarket tint allowed", badge: "Not permitted" };
    if (rule === "strip") return { ok: vlt >= 100, label: "Top-strip only", badge: "Not permitted" };
    return { ok: vlt >= rule, label: `${rule}% VLT minimum`, badge: "Too dark" };
  },
};
