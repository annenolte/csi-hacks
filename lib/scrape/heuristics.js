import { SCRAPE } from "../trades";

/*
  Hand-written extractors, one per named strategy in lib/trades.js. A need says
  which strategy it uses; nothing here reads a need's key, so adding a need that
  reuses an existing strategy needs no edit to this file.

  Every result carries the verbatim sentence it came from. That is the same shape
  Phase 3's LLM extraction returns, so the UI that renders provenance doesn't
  change when the smarter extractor takes over.
*/

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DAY_WORDS = {
  monday: "mon", mon: "mon",
  tuesday: "tue", tues: "tue", tue: "tue",
  wednesday: "wed", weds: "wed", wed: "wed",
  thursday: "thu", thurs: "thu", thur: "thu", thu: "thu",
  friday: "fri", fri: "fri",
  saturday: "sat", sat: "sat",
  sunday: "sun", sun: "sun",
};

const DAY_WORD_RE = Object.keys(DAY_WORDS).sort((a, b) => b.length - a.length).join("|");

/** The sentence around a match, for provenance. */
export function sentenceAt(text, index, span = 0) {
  if (index < 0) return null;
  const before = text.lastIndexOf("\n", index);
  const startPunct = Math.max(
    text.lastIndexOf(". ", index),
    text.lastIndexOf("! ", index),
    text.lastIndexOf("? ", index),
  );
  const start = Math.max(before, startPunct === -1 ? -1 : startPunct + 1, -1) + 1;

  const from = index + span;
  const ends = [text.indexOf("\n", from), text.indexOf(". ", from)]
    .filter((i) => i !== -1);
  const end = ends.length ? Math.min(...ends) + 1 : Math.min(text.length, from + 160);

  return text.slice(start, end).replace(/\s+/g, " ").trim() || null;
}

function found(value, confidence, source) {
  return { found: true, value, confidence, source: source ?? null };
}

const NOT_FOUND = { found: false };

/* ---------- business name ---------- */

const NAME_NOISE =
  /\b(home|welcome|official site|plumbing services?|plumbers?|contact us?|about us?)\b/gi;

function businessName({ page }) {
  if (page.siteName) {
    return found(page.siteName.trim(), 0.85, `Site name: ${page.siteName}`);
  }
  if (!page.title) return NOT_FOUND;

  /* Titles are usually "Nolte & Sons Plumbing | Portland OR Plumbers". */
  const [first] = page.title.split(/\s*[|·—–]\s*|\s+-\s+/);
  const candidate = (first ?? page.title).replace(NAME_NOISE, "").replace(/\s+/g, " ").trim();

  if (candidate.length < 2 || candidate.length > 60) return NOT_FOUND;
  return found(candidate, 0.6, `Page title: ${page.title}`);
}

/* ---------- phone ---------- */

const TEL_HREF = /href=["']tel:([+\d()\-.\s]{7,})["']/i;
const PHONE_RE = /(\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?!\d)/;

export function formatPhone(raw) {
  const digits = String(raw).replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits.length !== 10) return String(raw).trim();
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function phone({ page, html }) {
  /* A tel: link is the business's own number far more reliably than body text. */
  const href = html?.match(TEL_HREF);
  if (href) {
    return found(formatPhone(href[1]), 0.9, `Listed as a call link: ${href[1].trim()}`);
  }
  const m = page.text.match(PHONE_RE);
  if (!m) return NOT_FOUND;
  return found(formatPhone(m[0]), 0.65, sentenceAt(page.text, m.index, m[0].length));
}

/* ---------- service area ---------- */

const AREA_LEAD =
  /\b(serving|we serve|service area[s]?|proudly serve[s]?|areas we cover|we cover)\b[:\s]*/i;
const PLACE_RE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
const PLACE_STOPWORDS = new Set([
  "We", "Our", "The", "And", "All", "Call", "Free", "Plumbing", "Plumber",
  "Emergency", "Service", "Services", "Area", "Areas", "Home", "Contact",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
]);

function placeList({ page }) {
  const m = page.text.match(AREA_LEAD);
  if (!m) return NOT_FOUND;

  const start = m.index + m[0].length;
  /* Stay inside the sentence — the next one is usually about something else. */
  const chunkEnd = [page.text.indexOf("\n", start), page.text.indexOf(". ", start)]
    .filter((i) => i !== -1);
  const chunk = page.text.slice(start, chunkEnd.length ? Math.min(...chunkEnd) : start + 240);

  const places = [];
  for (const match of chunk.matchAll(PLACE_RE)) {
    const place = match[1].trim();
    if (PLACE_STOPWORDS.has(place.split(" ")[0])) continue;
    if (places.some((p) => p.toLowerCase() === place.toLowerCase())) continue;
    places.push(place);
    if (places.length >= 12) break;
  }

  if (places.length === 0) return NOT_FOUND;
  return found(places, places.length > 1 ? 0.7 : 0.5, sentenceAt(page.text, m.index, m[0].length));
}

/* ---------- hours ---------- */

const TIME = "(\\d{1,2})(?::(\\d{2}))?\\s*([ap]\\.?m\\.?)?";
const HOURS_RE = new RegExp(
  `(${DAY_WORD_RE})\\s*(?:(?:-|–|—|to|thru|through)\\s*(${DAY_WORD_RE}))?` +
    `\\s*[:\\s]\\s*${TIME}\\s*(?:-|–|—|to)\\s*${TIME}`,
  "gi",
);

export function to24Hour(hour, minute, meridiem) {
  let h = Number(hour);
  const m = Number(minute ?? 0);
  const mer = meridiem?.replace(/\./g, "").toLowerCase();
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  /* No meridiem and a small closing hour almost always means afternoon. */
  if (!mer && h <= 7) h += 12;
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function expandDayRange(from, to) {
  const start = DAYS.indexOf(from);
  if (start === -1) return [];
  if (!to) return [from];
  const end = DAYS.indexOf(to);
  if (end === -1) return [from];
  const out = [];
  for (let i = start; ; i = (i + 1) % 7) {
    out.push(DAYS[i]);
    if (i === end || out.length > 7) break;
  }
  return out;
}

function hours({ page }) {
  const text = page.text;
  const result = {};
  let firstIndex = -1;
  let matchCount = 0;

  for (const m of text.matchAll(HOURS_RE)) {
    const [, fromWord, toWord, oh, om, omer, ch, cm, cmer] = m;
    const open = to24Hour(oh, om, omer);
    const close = to24Hour(ch, cm, cmer ?? omer);
    if (!open || !close) continue;

    const days = expandDayRange(DAY_WORDS[fromWord.toLowerCase()], toWord ? DAY_WORDS[toWord.toLowerCase()] : null);
    if (days.length === 0) continue;

    for (const day of days) result[day] = { open, close };
    if (firstIndex === -1) firstIndex = m.index;
    matchCount++;
  }

  if (matchCount === 0) return NOT_FOUND;
  return found(result, matchCount > 1 ? 0.75 : 0.55, sentenceAt(text, firstIndex));
}

/* ---------- emergency policy ---------- */

const ALWAYS_OPEN = /\b(24\s*\/\s*7|24-?7|24\s*hours?\s*(a\s*day)?|round[- ]the[- ]clock|always open)\b/i;
const EMERGENCY_WORD = /\b(emergency|after[- ]hours?|out[- ]of[- ]hours?|weekend service)\b/i;

function emergencyPolicy({ page }) {
  const always = page.text.match(ALWAYS_OPEN);
  if (always) {
    return found("24_7", 0.8, sentenceAt(page.text, always.index, always[0].length));
  }
  const emergency = page.text.match(EMERGENCY_WORD);
  if (emergency) {
    /* The page mentions emergencies but not round-the-clock — on-call is the
       safe reading, and the owner confirms it on the form either way. */
    return found("on_call", 0.5, sentenceAt(page.text, emergency.index, emergency[0].length));
  }
  return NOT_FOUND;
}

/* ---------- services ---------- */

function serviceMatch({ page, trade }) {
  const haystack = `${page.headings.join("\n")}\n${page.text}`;
  const lower = haystack.toLowerCase();

  const matched = [];
  let firstIndex = -1;

  for (const service of trade.services) {
    const terms = [service.label, ...(service.aliases ?? [])];
    for (const term of terms) {
      const at = lower.indexOf(term.toLowerCase());
      if (at === -1) continue;
      matched.push(service.key);
      if (firstIndex === -1 || at < firstIndex) firstIndex = at;
      break;
    }
  }

  if (matched.length === 0) return NOT_FOUND;
  return found(
    matched,
    matched.length >= 3 ? 0.75 : 0.55,
    sentenceAt(haystack, firstIndex),
  );
}

/* ---------- how the business describes itself ---------- */

function description({ page }) {
  if (page.description && page.description.length > 25) {
    return found(
      page.description.trim(),
      0.7,
      `Page description: ${page.description}`,
    );
  }

  /* Otherwise the first substantial paragraph of body copy. */
  const paragraph = page.text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 60 && line.length < 400 && /[a-z]/.test(line));

  if (!paragraph) return NOT_FOUND;
  return found(paragraph, 0.4, paragraph);
}

/* ---------- registry ---------- */

const STRATEGIES = {
  [SCRAPE.BUSINESS_NAME]: businessName,
  [SCRAPE.PHONE]: phone,
  [SCRAPE.PLACE_LIST]: placeList,
  [SCRAPE.HOURS]: hours,
  [SCRAPE.EMERGENCY_POLICY]: emergencyPolicy,
  [SCRAPE.SERVICE_MATCH]: serviceMatch,
  [SCRAPE.DESCRIPTION]: description,
};

/**
 * Runs every need's strategy over one page.
 * Returns { [needKey]: { value, confidence, source } } for fields that were found.
 */
export function extractWithHeuristics({ trade, page, html }) {
  const fields = {};

  for (const need of trade.needs) {
    const strategy = STRATEGIES[need.scrape];
    if (!strategy) continue;

    let result;
    try {
      result = strategy({ page, html, trade, need });
    } catch {
      continue; // one bad field must not lose the rest of the page
    }

    if (result?.found) {
      fields[need.key] = {
        value: result.value,
        confidence: result.confidence,
        source: result.source,
      };
    }
  }

  return fields;
}
