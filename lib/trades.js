/*
  The trade definition is the single source of truth for the whole product.

  `needs` drives, with no other edit anywhere:
    - which fields the wizard renders (Step 2)
    - what the call slip in the right rail checks off
    - what the website scraper tries to extract, via `scrape`
    - what Phase 3 synthesis extracts against, via `extract`
    - what the gap interview asks about, using `question` verbatim

  Add a need here and it appears in all five. If you ever find yourself typing a
  need's key into JSX or into the extractor, stop and fix the generic code instead.
*/

/** Input kinds a need can render as. Keep this list small on purpose. */
export const FIELD_TYPES = {
  TEXT: "text",
  TEL: "tel",
  TEXTAREA: "textarea",
  CHIPS: "chips",
  MONEY: "money",
  CHOICE: "choice",
  HOURS: "hours",
};

/*
  Named extraction strategies. A need names one; the heuristic engine looks it up
  in lib/scrape/heuristics.js. The engine never reads `need.key`, so a new need
  reuses an existing strategy for free.
*/
export const SCRAPE = {
  BUSINESS_NAME: "business_name",
  PHONE: "phone",
  PLACE_LIST: "place_list",
  HOURS: "hours",
  EMERGENCY_POLICY: "emergency_policy",
  SERVICE_MATCH: "service_match",
  DESCRIPTION: "description",
};

/*
  Prices get classified in code, never in a prompt (PLAN.md Phase 3).
  These live on the trade so the rule is data, not a conditional buried in a route.
  A document claiming "our sewer work is a flat $4,000" must not move sewer_line
  out of human_required.
*/
export const PRICE_TIERS = {
  QUOTABLE: "quotable",
  RANGE_ONLY: "range_only",
  HUMAN_REQUIRED: "human_required",
};

export const PLUMBING = {
  id: "plumbing",
  label: "Plumbing",
  blurb: "Drains, leaks, water heaters, fixtures.",
  icon: "🔧",
  available: true,

  /* Confidence below this floor is never quotable, whatever the document says. */
  confidenceFloor: 0.7,

  /* Always human, regardless of any price found in the corpus. */
  alwaysHuman: ["sewer_line", "repipe"],

  /* `aliases` is what the scraper matches on — data, not code. */
  services: [
    {
      key: "drain_clear",
      label: "Drain clearing",
      aliases: ["drain clearing", "drain cleaning", "blocked drain", "clogged drain", "rooter"],
    },
    {
      key: "leak_repair",
      label: "Leak repair",
      aliases: ["leak repair", "leak detection", "burst pipe", "pipe repair"],
    },
    {
      key: "water_heater",
      label: "Water heater repair or swap",
      aliases: ["water heater", "hot water", "tankless", "boiler"],
    },
    {
      key: "fixture_install",
      label: "Fixture install",
      aliases: ["fixture", "faucet", "sink install", "shower install", "garbage disposal"],
    },
    {
      key: "toilet_repair",
      label: "Toilet repair",
      aliases: ["toilet", "running toilet", "toilet install"],
    },
    {
      key: "sewer_line",
      label: "Sewer line",
      aliases: ["sewer line", "sewer", "trenchless", "main line"],
    },
    {
      key: "repipe",
      label: "Repipe",
      aliases: ["repipe", "re-pipe", "whole house repipe", "pipe replacement"],
    },
    {
      key: "emergency",
      label: "Emergency call-out",
      aliases: ["emergency", "24/7", "24 hour", "same day", "after hours"],
    },
  ],

  needs: [
    {
      key: "business_name",
      label: "Business name",
      question: "What name should the agent answer the phone with?",
      hint: "Exactly how you want it said out loud.",
      type: FIELD_TYPES.TEXT,
      placeholder: "Nolte & Sons Plumbing",
      slipLabel: "Answers as",
      required: true,
      scrape: SCRAPE.BUSINESS_NAME,
      extract: "The trading name of the business.",
    },
    {
      key: "phone",
      label: "Business phone",
      question: "What number do calls come in on?",
      hint: "The line the agent picks up, and the number we match callers against.",
      type: FIELD_TYPES.TEL,
      placeholder: "(503) 555-0142",
      slipLabel: "Line",
      required: true,
      scrape: SCRAPE.PHONE,
      extract: "The main inbound phone number.",
    },
    {
      key: "service_area",
      label: "Service area",
      question: "Which towns or postcodes do you cover?",
      hint: "Add each one separately. The agent turns away calls outside these.",
      type: FIELD_TYPES.CHIPS,
      placeholder: "Type a town and press Enter",
      slipLabel: "Covers",
      required: true,
      scrape: SCRAPE.PLACE_LIST,
      extract:
        "Towns, suburbs, postcodes or radius the business will travel to.",
    },
    {
      key: "hours",
      label: "Opening hours",
      question: "When are you open for normal, non-emergency jobs?",
      hint: "The agent books inside these and offers the next slot outside them.",
      type: FIELD_TYPES.HOURS,
      slipLabel: "Open",
      required: true,
      scrape: SCRAPE.HOURS,
      extract: "Regular business hours, per day of the week.",
    },
    {
      key: "emergency_policy",
      label: "After hours",
      question: "Do you take emergency call-outs outside those hours?",
      type: FIELD_TYPES.CHOICE,
      options: [
        { value: "24_7", label: "Yes, any time" },
        { value: "on_call", label: "Yes, but on-call only" },
        { value: "none", label: "No, next business day" },
      ],
      slipLabel: "After hours",
      required: true,
      scrape: SCRAPE.EMERGENCY_POLICY,
      extract:
        "Whether the business takes emergency work outside its regular hours.",
    },
    {
      key: "services_offered",
      label: "What you do",
      question: "Which of these do you actually take on?",
      hint: "Anything you leave off, the agent will decline rather than guess.",
      type: FIELD_TYPES.CHOICE,
      multiple: true,
      optionsFrom: "services",
      slipLabel: "Takes",
      required: true,
      scrape: SCRAPE.SERVICE_MATCH,
      extract: "Which services the business performs.",
    },
    {
      key: "business_notes",
      label: "What you actually do",
      question: "In your own words, what should the agent know about the job?",
      hint: "How you'd describe the business, plus anything you never take on. The agent reads this before it says anything it can't back up.",
      type: FIELD_TYPES.TEXTAREA,
      placeholder:
        "Family-run since 1994, residential only. We don't do gas fitting, and anything commercial goes to Dave.",
      slipLabel: "In their words",
      required: false,
      scrape: SCRAPE.DESCRIPTION,
      extract:
        "How the business describes itself, and any work it explicitly does not take on.",
    },
  ],
};

/* Other trades come later. They are listed so the picker shows the shape of the thing. */
export const TRADES = [
  PLUMBING,
  {
    id: "electrical",
    label: "Electrical",
    blurb: "Faults, rewires, panels, EV chargers.",
    icon: "⚡",
    available: false,
  },
  {
    id: "hvac",
    label: "Heating & cooling",
    blurb: "Furnaces, heat pumps, servicing.",
    icon: "🌡️",
    available: false,
  },
  {
    id: "locksmith",
    label: "Locksmith",
    blurb: "Lockouts, rekeys, hardware.",
    icon: "🔑",
    available: false,
  },
];

export function getTrade(id) {
  return TRADES.find((t) => t.id === id) ?? null;
}

/** Resolve a need's options, following `optionsFrom` into the trade definition. */
export function optionsForNeed(trade, need) {
  if (need.options) return need.options;
  if (need.optionsFrom === "services") {
    return trade.services.map((s) => ({ value: s.key, label: s.label }));
  }
  return [];
}
