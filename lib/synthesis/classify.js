import { PRICE_TIERS } from "../trades";

/*
  Price classification happens HERE, in code, and never in a prompt.

  This is deliberate and it is the point of Phase 3. A prompt can be talked out of
  its own rules by the document it is reading — a price list that says "our sewer
  work is a flat $4,000" will happily convince a model to mark sewer work
  quotable. This function cannot be argued with, it is deterministic, and it is
  tested. See test/classify.test.js, which asserts exactly that case.

  The rules, in the order they are applied:
    1. Services on the trade's `alwaysHuman` list are human_required, whatever the
       document claims and however confident the extraction was.
    2. Anything below the trade's confidence floor (0.7) is human_required.
    3. A hedged or open-ended figure ("starting at", "depends", "$150-$300", an
       hourly rate) is range_only — real information, but not a number the agent
       may commit the business to.
    4. A single bare amount is quotable.
    5. Everything else is human_required. The default is the safe one on purpose:
       a shape we do not recognise is a shape we do not quote.
*/

/* Open-ended or conditional language. Any of these means "not a firm price". */
const HEDGE = new RegExp(
  [
    "starting at",
    "starts at",
    "start from",
    "starting from",
    "from as little as",
    "as low as",
    "as little as",
    "\\bfrom\\b",
    "up to",
    "and up",
    "or more",
    "\\+\\s*$",
    "depend",
    "vary",
    "varies",
    "varies by",
    "typical",
    "average",
    "around",
    "approx",
    "roughly",
    "about",
    "~",
    "estimate",
    "quote",
    "call for",
    "contact us",
    "ask us",
    "subject to",
    "minimum",
    "min\\.",
    "onwards",
  ].join("|"),
  "i",
);

/*
  A rate is not a job price. "$95/hour" quoted as "$95" is precisely the kind of
  answer that gets a business into an argument on the doorstep, so rates are
  range_only however plainly they are stated.
*/
const RATE = /\b(per|\/|an?\s)\s*(hour|hr|day|foot|ft|metre|meter|fixture|unit)\b|\bhourly\b|\bper\b/i;

/** A currency amount: $1,499.00 / 1499 / £95 */
const AMOUNT = /(?:[$£€]\s*)?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|(?:[$£€]\s*)?\d+(?:\.\d{1,2})?/g;

/** Words that can sit around a bare amount without making it conditional. */
const HARMLESS = /^(?:[$£€]|flat|fee|fixed|price|cost|is|of|the|a|an|for|charge|rate|only|usd|gbp|eur|dollars?|each|per\s+job|per\s+visit|per\s+call|call-?out|callout|service|standard|[.,:;()\-–—])$/i;

export function amountsIn(text) {
  const matches = String(text ?? "").match(AMOUNT) ?? [];
  return matches
    .map((m) => Number(m.replace(/[^\d.]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * True when the text is a single amount and nothing that qualifies it.
 * "$149" and "flat fee of $149" are bare; "$149 per hour" and "from $149" are not.
 */
export function isBareAmount(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return false;
  if (HEDGE.test(raw) || RATE.test(raw)) return false;
  if (amountsIn(raw).length !== 1) return false;

  /* Anything left over after removing the number must be harmless filler. */
  const remainder = raw
    .replace(AMOUNT, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  return remainder.every((word) => HARMLESS.test(word));
}

/**
 * Classify one extracted price.
 *
 * @param {object} price       - { serviceKey, rawText, confidence }
 * @param {object} trade       - the trade definition (alwaysHuman, confidenceFloor)
 * @returns {{ tier: string, amount: number|null, reason: string }}
 */
export function classifyPrice(price, trade) {
  const { serviceKey, rawText, confidence } = price ?? {};
  const text = String(rawText ?? "").trim();

  /* 1. The override. No document, and no confidence score, moves these. */
  if (trade?.alwaysHuman?.includes(serviceKey)) {
    return {
      tier: PRICE_TIERS.HUMAN_REQUIRED,
      amount: null,
      reason: `${serviceKey} is always quoted by a person for this trade`,
    };
  }

  /*
    2. A number we are not sure we read correctly is not a number we quote.
    Number.isFinite, not typeof — NaN is a "number" and every comparison against
    it is false, so a `typeof` check lets a malformed confidence through as
    quotable. That is the exact failure this whole function exists to prevent.
  */
  const floor = trade?.confidenceFloor ?? 0.7;
  if (!Number.isFinite(confidence) || confidence < floor) {
    return {
      tier: PRICE_TIERS.HUMAN_REQUIRED,
      amount: null,
      reason: `confidence ${confidence ?? "unknown"} is below the ${floor} floor`,
    };
  }

  if (!text) {
    return { tier: PRICE_TIERS.HUMAN_REQUIRED, amount: null, reason: "no price text" };
  }

  /* 3. Hedged, ranged or rated. Useful to say out loud, not safe to commit to. */
  if (HEDGE.test(text)) {
    return { tier: PRICE_TIERS.RANGE_ONLY, amount: null, reason: "open-ended wording" };
  }
  if (RATE.test(text)) {
    return { tier: PRICE_TIERS.RANGE_ONLY, amount: null, reason: "a rate, not a job price" };
  }
  if (amountsIn(text).length > 1) {
    return { tier: PRICE_TIERS.RANGE_ONLY, amount: null, reason: "a range, not one price" };
  }

  /* 4. One plain number. */
  if (isBareAmount(text)) {
    return { tier: PRICE_TIERS.QUOTABLE, amount: amountsIn(text)[0], reason: "a single flat price" };
  }

  /* 5. Unrecognised shape — fail towards a human. */
  return {
    tier: PRICE_TIERS.HUMAN_REQUIRED,
    amount: null,
    reason: "price wording not recognised",
  };
}

/** Classify a whole extraction in one go. */
export function classifyPrices(prices, trade) {
  return (prices ?? []).map((price) => ({ ...price, ...classifyPrice(price, trade) }));
}
