import Anthropic from "@anthropic-ai/sdk";
import {
  buildFieldsSchema,
  coerceValue,
  isMultiValue,
  mergeMultiValues,
} from "../fieldSchema";

/*
  Phase 3 synthesis: two calls over the whole corpus.

    1. Fields  — the trade's `needs` list, one answer set per need.
    2. Prices  — every price the corpus states, with the sentence it came from.

  Both return verbatim sources. Neither is asked to classify a price: that happens
  in lib/synthesis/classify.js, in code, where a document cannot argue with it.

  The contract that matters most is `found: false`. A missing answer is a gap the
  owner fills in the interview; a guessed one is repeated to real callers by a
  phone agent that has no way to know it was invented.
*/

const MODEL = "claude-opus-5";

export function claudeIsConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/* ---------- call 1: the needs list ---------- */

const FIELDS_SYSTEM = `You read the complete set of documents belonging to one trade business and extract only what they actually state.

Rules, in order of importance:
1. If the documents do not state a field, set found to false and return an empty values array. A missing answer is correct and useful. A guessed one is worse than useless: a phone agent will repeat it to real callers as if the business had promised it.
2. Every entry must quote, in "source", a sentence that appears verbatim in the documents. If you cannot quote it, you did not find it — do not paraphrase into the source field.
3. When two documents disagree, return BOTH as separate entries. Do not pick, average, or prefer the newer-sounding one. The owner resolves the conflict, not you.
4. Never infer from the trade, the region, or what is typical for a business like this. Only what these documents say.
5. confidence reflects how explicitly the documents state the field, not how plausible the value seems.
6. "document" must be the name attribute of the <document> element the sentence came from.
7. For a field whose value is a LIST (services offered, towns covered), return ONE entry containing the whole list, even when you assembled it from several sentences. Separate entries mean the sources disagree — a list built from many sentences is one answer, not a disagreement.`;

/* ---------- call 2: services and prices ---------- */

function pricesSchema(trade) {
  return {
    type: "object",
    properties: {
      prices: {
        type: "array",
        description: "Every price stated anywhere in the corpus.",
        items: {
          type: "object",
          properties: {
            serviceKey: {
              type: "string",
              enum: trade.services.map((s) => s.key),
              description: "Which of the trade's services this price is for.",
            },
            rawText: {
              type: "string",
              description:
                "The price exactly as written, including any qualifying words — 'starting at $149', '$95/hour', '$150-$300'. Do not normalise or strip qualifiers.",
            },
            confidence: { type: "number", description: "0 to 1" },
            source: {
              type: "string",
              description: "The verbatim sentence this price appears in.",
            },
            document: {
              type: "string",
              description: "The name attribute of the <document> it came from.",
            },
          },
          required: ["serviceKey", "rawText", "confidence", "source", "document"],
          additionalProperties: false,
        },
      },
    },
    required: ["prices"],
    additionalProperties: false,
  };
}

const PRICES_SYSTEM = `You read the complete set of documents belonging to one trade business and list every price they state.

Rules:
1. Only prices the documents actually state. Never estimate, never fill in a typical figure, never carry a price across from a similar service.
2. Copy the price into rawText EXACTLY as written, including qualifiers: "starting at $149", "$95 per hour", "$150-$300", "from $99". Do NOT strip the qualifying words and do NOT reduce a range to one number — those words decide how the price may be used, and something downstream depends on seeing them.
3. Quote the sentence the price appears in, verbatim, in "source".
4. Do not judge whether a price is safe to quote to a caller. That decision is made elsewhere, in code. Your job is to report what is written.
5. One entry per stated price. If the same service is priced differently in two documents, return both entries.`;

/* ---------- shared plumbing ---------- */

async function callModel({ system, schema, prompt }) {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system,
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The extractor declined to read these documents.");
  }

  const block = response.content.find((b) => b.type === "text");
  if (!block) throw new Error("The extractor returned nothing.");

  try {
    return JSON.parse(block.text);
  } catch {
    throw new Error("The extractor returned malformed output.");
  }
}

const corpusPrompt = (corpus, instruction) =>
  `${instruction}\n\n<corpus>\n${corpus.text}\n</corpus>`;

export async function extractFields({ trade, corpus }) {
  const parsed = await callModel({
    system: FIELDS_SYSTEM,
    schema: buildFieldsSchema(trade, { sourceNoun: "corpus" }),
    prompt: corpusPrompt(
      corpus,
      "Extract what these documents state about the business.",
    ),
  });

  const fields = {};

  for (const need of trade.needs) {
    const result = parsed[need.key];
    if (!result?.found || !Array.isArray(result.values)) continue;

    const values = result.values
      .map((entry) => {
        const value = coerceValue(need, entry.value);
        if (value === null) return null;
        return {
          value,
          confidence: Number.isFinite(entry.confidence) ? entry.confidence : 0.5,
          source: entry.source ?? null,
          document: entry.document ?? null,
        };
      })
      .filter(Boolean);

    if (values.length === 0) continue;

    /*
      A list field assembled from several sentences is one answer, not several
      competing ones. Folding them here means the conflict logic downstream only
      ever sees genuine disagreements.
    */
    fields[need.key] =
      isMultiValue(need) && values.length > 1 ? [mergeMultiValues(values)] : values;
  }

  return fields;
}

export async function extractPrices({ trade, corpus }) {
  const parsed = await callModel({
    system: PRICES_SYSTEM,
    schema: pricesSchema(trade),
    prompt: corpusPrompt(corpus, "List every price these documents state."),
  });

  const valid = new Set(trade.services.map((s) => s.key));

  return (parsed.prices ?? [])
    .filter((p) => p && valid.has(p.serviceKey) && typeof p.rawText === "string")
    .map((p) => ({
      serviceKey: p.serviceKey,
      rawText: p.rawText.trim(),
      confidence: Number.isFinite(p.confidence) ? p.confidence : 0.5,
      source: p.source ?? null,
      document: p.document ?? null,
    }));
}
