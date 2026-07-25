import Anthropic from "@anthropic-ai/sdk";
import { buildFieldsSchema, coerceValue } from "../fieldSchema";

/*
  The smarter single-page extractor. Same input and same output shape as the
  heuristics, so the route can swap between them and nothing downstream notices.

  Only runs when ANTHROPIC_API_KEY is set; otherwise the route falls back to
  lib/scrape/heuristics.js. Phase 3 (lib/synthesis/extract.js) does the same job
  over the whole corpus and returns conflicts; this one reads one page and picks.
*/

const MODEL = "claude-opus-5";
const MAX_PAGE_CHARS = 60_000;

export function claudeIsConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM = `You read one web page belonging to a trade business and extract only what it actually states.

Rules, in order of importance:
1. If the page does not state a field, set found to false. A missing answer is correct and useful; a guessed one poisons a phone agent that will repeat it to real callers.
2. Every value you return must be supported by a sentence you can quote verbatim in "source". If you cannot quote it, you did not find it.
3. Do not infer from the industry, the town, or what is typical. Only what this page says.
4. Prefer the business's own phrasing for names.
5. confidence reflects how explicitly the page states the field, not how plausible the value is.`;

export async function extractWithClaude({ trade, page, url }) {
  const client = new Anthropic();

  const pageText = [
    page.title && `Page title: ${page.title}`,
    page.siteName && `Site name: ${page.siteName}`,
    page.description && `Description: ${page.description}`,
    `URL: ${url}`,
    "",
    page.text.slice(0, MAX_PAGE_CHARS),
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: {
      format: {
        type: "json_schema",
        schema: buildFieldsSchema(trade, { sourceNoun: "page" }),
      },
    },
    messages: [
      {
        role: "user",
        content: `Extract what this page states about the business.\n\n<page>\n${pageText}\n</page>`,
      },
    ],
  });

  /* Claude Opus 5's classifiers can decline; content is empty when they do. */
  if (response.stop_reason === "refusal") {
    throw new Error("The extractor declined to read that page.");
  }

  const block = response.content.find((b) => b.type === "text");
  if (!block) throw new Error("The extractor returned nothing.");

  let parsed;
  try {
    parsed = JSON.parse(block.text);
  } catch {
    throw new Error("The extractor returned malformed output.");
  }

  const fields = {};
  for (const need of trade.needs) {
    const result = parsed[need.key];
    if (!result?.found || !Array.isArray(result.values)) continue;

    /*
      One page can't really disagree with itself, so take the best-supported entry
      rather than surfacing a conflict here. Phase 3 reads the whole corpus and
      does keep both — that is where disagreements actually live.
    */
    const best = result.values
      .map((entry) => ({ ...entry, value: coerceValue(need, entry.value) }))
      .filter((entry) => entry.value !== null)
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];

    if (!best) continue;

    fields[need.key] = {
      value: best.value,
      confidence: Number.isFinite(best.confidence) ? best.confidence : 0.5,
      source: best.source ?? null,
    };
  }

  return fields;
}
