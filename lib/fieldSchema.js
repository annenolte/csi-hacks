import { FIELD_TYPES, optionsForNeed } from "./trades";

/*
  Turns a need into a JSON Schema fragment, and turns the model's answer back into
  the shape the wizard stores. Shared by the single-page scraper
  (lib/scrape/claude.js) and the whole-corpus synthesis (lib/synthesis/extract.js)
  so the two can never drift into disagreeing about what a field looks like.
*/

export const DAY_ENUM = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * True for needs whose value is a set of items rather than one answer.
 *
 * These can't meaningfully conflict: an extractor that finds "drain clearing" in
 * one sentence and "repipe" in another has found two parts of one list, not two
 * competing answers. Treating them as a disagreement asks the owner to resolve
 * something that was never in dispute.
 */
export function isMultiValue(need) {
  return (
    need.type === FIELD_TYPES.CHIPS ||
    (need.type === FIELD_TYPES.CHOICE && Boolean(need.multiple))
  );
}

/** Folds several partial lists into the one list they were always describing. */
export function mergeMultiValues(entries) {
  const seen = new Set();
  const value = [];

  for (const entry of entries) {
    for (const item of entry.value) {
      if (seen.has(item)) continue;
      seen.add(item);
      value.push(item);
    }
  }

  /* Least-confident wins: the list is only as good as its weakest member. */
  const confidence = Math.min(...entries.map((e) => e.confidence ?? 0.5));
  const best = [...entries].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];

  return {
    value,
    confidence,
    source: best?.source ?? null,
    document: best?.document ?? null,
    /* Every sentence that contributed, so the citation isn't a half-truth. */
    sources: entries.map((e) => e.source).filter(Boolean),
  };
}

/** JSON Schema for one need's `value`, derived from its type alone. */
export function valueSchema(trade, need) {
  switch (need.type) {
    case FIELD_TYPES.CHIPS:
      return { type: "array", items: { type: "string" } };

    case FIELD_TYPES.HOURS:
      /*
        An array of windows rather than an optional-key object: structured outputs
        require every property to be required, and a business that is shut on
        Sunday simply has no entry for it.
      */
      return {
        type: "array",
        items: {
          type: "object",
          properties: {
            days: { type: "array", items: { type: "string", enum: DAY_ENUM } },
            open: { type: "string", description: "24-hour HH:MM" },
            close: { type: "string", description: "24-hour HH:MM" },
          },
          required: ["days", "open", "close"],
          additionalProperties: false,
        },
      };

    case FIELD_TYPES.CHOICE: {
      const values = optionsForNeed(trade, need).map((o) => o.value);
      return need.multiple
        ? { type: "array", items: { type: "string", enum: values } }
        : { type: "string", enum: values };
    }

    default:
      return { type: "string" };
  }
}

/** Converts the model's hours array into the wizard's per-day object. */
export function hoursToObject(windows) {
  if (!Array.isArray(windows)) return null;
  const out = {};
  for (const w of windows) {
    if (!w?.open || !w?.close || !Array.isArray(w.days)) continue;
    for (const day of w.days) {
      if (DAY_ENUM.includes(day)) out[day] = { open: w.open, close: w.close };
    }
  }
  return Object.keys(out).length ? out : null;
}

/*
  The extraction envelope, shared by the single-page scraper and whole-corpus
  synthesis.

  Note the shape: `found` plus a possibly-empty `values` array, rather than a
  nullable `value`. That is deliberate. An earlier version used
  `anyOf: [<value>, {type: "null"}]` and the API returned a 500 on every request
  while the array-shaped synthesis schema went through fine — nullable unions over
  enum-and-array types don't survive schema compilation. Keep both extractors on
  this shape.

  It also gives conflicts for free: two entries means two sources disagree.
*/
export function buildFieldsSchema(trade, { sourceNoun = "corpus" } = {}) {
  const properties = {};

  for (const need of trade.needs) {
    properties[need.key] = {
      type: "object",
      description: need.extract,
      properties: {
        found: {
          type: "boolean",
          description: `false when the ${sourceNoun} does not state this. Never guess.`,
        },
        values: {
          type: "array",
          description:
            "One entry per distinct answer that is supported. Empty when found is false. Two entries means two sources disagree — return both rather than choosing.",
          items: {
            type: "object",
            properties: {
              value: valueSchema(trade, need),
              confidence: { type: "number", description: "0 to 1" },
              source: {
                type: "string",
                description: `The verbatim sentence from the ${sourceNoun} this came from.`,
              },
              document: {
                type: "string",
                description:
                  "Where the sentence came from. The document name, or the page URL.",
              },
            },
            required: ["value", "confidence", "source", "document"],
            additionalProperties: false,
          },
        },
      },
      required: ["found", "values"],
      additionalProperties: false,
    };
  }

  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

/** Normalises a model-supplied value, or null when there is nothing usable. */
export function coerceValue(need, value) {
  const coerced = need.type === FIELD_TYPES.HOURS ? hoursToObject(value) : value;

  if (coerced === null || coerced === undefined || coerced === "") return null;
  if (Array.isArray(coerced) && coerced.length === 0) return null;
  return coerced;
}
