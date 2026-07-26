import "server-only";

import { isAnswered } from "../answered";
import { formatNeedValue } from "../format";
import { getDocuments, getFields, saveSynthesis, setField } from "../data/business";
import { cached } from "../cache/store";
import { corpusKey } from "../cache/keys";
import { isDemoSite } from "../demo/site";
import { buildCorpus } from "./corpus";
import { extractFields, extractPrices } from "./extract";
import { buildReport } from "./report";

/*
  Reads everything a business has given us and turns it into what the agent knows.

  Shared by two callers that must not drift apart: the onboarding conversation
  runs this once, and the dashboard runs it again whenever a document is added or
  removed. If they each had their own copy, the second run would eventually start
  producing a different answer from the first.

  The whole corpus goes in one prompt — no chunking, no embeddings, no vector
  search. A small trade business's entire document set fits in one context, and
  putting all of it in one call buys better extraction and exact verbatim
  citations for free. Retrieval would trade both away to solve a size problem this
  domain doesn't have.
*/

/** Below this, a fact becomes a question instead of an answer. */
export const PROMOTE_FLOOR = 0.7;

export async function runSynthesis({ business, trade }) {
  const documents = await getDocuments(business.id);
  const { answers } = await getFields(business.id);

  const corpus = buildCorpus(documents);

  if (corpus.isEmpty) {
    return {
      corpus,
      report: null,
      promoted: [],
      unresolved: unresolvedNeeds({ trade, answers, conflicts: [] }),
      conflicts: {},
      failure: null,
    };
  }

  let report;
  try {
    const [fields, prices] = await readCorpus({
      trade,
      corpus,
      documents,
      demo: isDemoSite(business.website_url),
    });
    report = buildReport({ trade, fields, prices, answers });
  } catch (err) {
    console.error("Synthesis failed:", err);
    return {
      corpus,
      report: null,
      promoted: [],
      unresolved: unresolvedNeeds({ trade, answers, conflicts: [] }),
      conflicts: {},
      failure: err.message,
    };
  }

  await saveSynthesis(business.id, report);

  /*
    Promote what the documents actually settled: a single, well-supported answer
    to something nobody has answered yet. Anything conflicting, or below the
    confidence floor, stays a question. Asking costs one turn; a wrong fact gets
    repeated to real callers as though the business had promised it.
  */
  const promoted = [];

  for (const fact of report.facts) {
    if (fact.conflicted) continue;
    if ((fact.confidence ?? 0) < PROMOTE_FLOOR) continue;
    if (isAnswered(answers[fact.need.key])) continue;

    await setField(business.id, fact.need.key, fact.value, {
      source: "documents",
      confidence: fact.confidence,
      sentence: fact.source,
      document: fact.document,
    });

    answers[fact.need.key] = fact.value;
    promoted.push({
      key: fact.need.key,
      label: fact.need.label,
      display: formatNeedValue(trade, fact.need, fact.value),
    });
  }

  return {
    corpus,
    report,
    promoted,
    unresolved: unresolvedNeeds({
      trade,
      answers,
      conflicts: report.conflicts.map((c) => c.need.key),
    }),
    /*
      Both sides of every disagreement, keyed by need. The interview asks the
      owner to pick, and it can only do that usefully if it can show them what
      the two documents actually said.
    */
    conflicts: Object.fromEntries(
      report.conflicts.map((conflict) => [
        conflict.need.key,
        conflict.values.map((entry) => ({
          value: entry.value,
          display: formatNeedValue(trade, conflict.need, entry.value),
          document: entry.document ?? null,
        })),
      ]),
    ),
    failure: null,
  };
}

/*
  The two extraction calls, replayed rather than repeated on the demo site.

  This is the slowest thing the product does — two whole-corpus reads, and a
  minute of them is not unusual — and a demo runs it against the same website and
  the same folder of files every time. What comes back on a hit is the extractor's
  own output from the run that filled the cache, conflicts and quoted sentences
  and all. It is stale only in the sense that a document read yesterday is stale:
  the input hasn't changed, or the key wouldn't have matched.
*/
function readCorpus({ trade, corpus, documents, demo }) {
  const read = () =>
    /* Independent calls over the same corpus — no reason to run them in series. */
    Promise.all([extractFields({ trade, corpus }), extractPrices({ trade, corpus })]);

  if (!demo) return read();

  return cached("synthesis", corpusKey({ tradeId: trade.id, documents }), read);
}

/**
 * What still needs a human: things nothing answered, plus things two documents
 * answered differently. A disagreement is a real question, and the owner is the
 * only one who can settle it — picking a winner quietly would be the worst option
 * available, because the losing value is often the current one.
 */
function unresolvedNeeds({ trade, answers, conflicts }) {
  const missing = trade.needs
    .filter((need) => !isAnswered(answers[need.key]))
    .map((need) => need.key);

  return [...new Set([...conflicts, ...missing])];
}
