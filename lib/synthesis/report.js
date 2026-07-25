import { isAnswered } from "../answered";
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

    /* Two supported answers is a disagreement to surface, never one to resolve here. */
    if (values.length > 1) {
      conflicts.push({ need, values });
    }
    for (const entry of values) {
      facts.push({ need, ...entry, conflicted: values.length > 1 });
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
