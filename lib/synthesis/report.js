import { isAnswered } from "../answered";
import { isProse } from "../fieldSchema";
import { classifyPrices } from "./classify";

/*
  Turns the two raw extractions into the thing the UI and the database consume.

  Three outputs, and the third is as important as the other two:
    - facts     : what the corpus states, with citations
    - conflicts : where two documents disagree, both kept
    - gaps      : what nothing states, which becomes the interview
*/

export function buildReport({ trade, fields, prices, answers = {} }) {
  const facts = [];
  const conflicts = [];

  for (const need of trade.needs) {
    const values = fields[need.key];
    if (!values?.length) continue;

    /*
      Two entries are only a disagreement if they disagree. A price list and a
      FAQ that both say "Mon-Fri 8-5" have agreed, and telling the owner their
      documents say two different things — then showing them the same answer
      twice — makes the extraction look broken and costs them a question they
      had no reason to be asked.

      Prose is the other half of that: two descriptions of the same business
      differ in almost every word and contradict each other in none of them, so
      the fullest one wins rather than becoming a question.
    */
    const distinct = isProse(need)
      ? bestSupported(values)
      : distinctValues(values);

    if (distinct.length > 1) {
      conflicts.push({ need, values: distinct });
    }
    for (const entry of distinct) {
      facts.push({ need, ...entry, conflicted: distinct.length > 1 });
    }
  }

  /*
    A gap is a need that neither the corpus nor the owner has answered. These are
    what the interview asks about, using each need's `question` verbatim — the
    same `needs` array that drives the form, which is why the interview can reuse
    the form's field component rather than reimplementing it.
  */
  const gaps = trade.needs.filter(
    (need) => !fields[need.key]?.length && !isAnswered(answers[need.key]),
  );

  return {
    facts,
    conflicts,
    gaps,
    /* Classification is in code. The model is never asked for a tier. */
    prices: classifyPrices(prices, trade),
    counts: {
      facts: facts.length,
      conflicts: conflicts.length,
      gaps: gaps.length,
      prices: prices?.length ?? 0,
    },
  };
}

/**
 * The one prose answer to keep, as a list of one.
 *
 * Best-supported first, and where two documents describe the business about as
 * confidently as each other, the fuller description wins — it is the one that
 * carries the "we don't do gas fitting" the shorter one left out. Every sentence
 * that described the business is kept alongside it, so the citation doesn't
 * claim the winner was the only thing the corpus said.
 */
function bestSupported(values) {
  const ranked = [...values].sort((a, b) => {
    const gap = (b.confidence ?? 0) - (a.confidence ?? 0);
    /* Within a rounding error of each other, treat them as equally supported. */
    if (Math.abs(gap) > 0.05) return gap;
    return String(b.value ?? "").length - String(a.value ?? "").length;
  });

  const sources = values.map((entry) => entry.source).filter(Boolean);
  return [{ ...ranked[0], sources }];
}

/**
 * The entries that actually say different things, best-supported first.
 *
 * Restating one answer is not a conflict, so duplicates collapse into the entry
 * the corpus stated most confidently — which is also the one whose quoted
 * sentence is worth showing. Everything downstream reads a real disagreement
 * from a list longer than one: the conflict chips in the interview, the
 * conflicted flag on each fact, and the promotion rule in run.js that refuses to
 * settle a disagreement on the owner's behalf.
 */
function distinctValues(values) {
  const best = new Map();

  for (const entry of values) {
    const key = canonical(entry.value);
    const seen = best.get(key);
    if (!seen || (entry.confidence ?? 0) > (seen.confidence ?? 0)) {
      best.set(key, entry);
    }
  }

  return [...best.values()].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}

/**
 * A comparable form of any need's value, whatever its type.
 *
 * The comparison is deliberately forgiving about the things documents vary on
 * and nothing else: case, surrounding whitespace, trailing punctuation, and the
 * order of a list. "Portland, Beaverton" and "beaverton, portland" are one
 * service area. "$95" and "$95/hour" stay two different answers, because they
 * are.
 */
function canonical(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map(canonical).sort());
  }
  if (value && typeof value === "object") {
    return JSON.stringify(
      Object.keys(value)
        .sort()
        .map((key) => [key.toLowerCase(), canonical(value[key])]),
    );
  }
  if (typeof value === "string") {
    return value
      .toLowerCase()
      .replace(/[\s]+/g, " ")
      .replace(/[.,;:!]+$/, "")
      .trim();
  }
  return JSON.stringify(value ?? null);
}
