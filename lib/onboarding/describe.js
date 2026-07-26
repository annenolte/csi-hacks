import { formatNeedValue } from "../format";
import { COMPONENT } from "./components";

/*
  What the person just answered, in words.

  This lives apart from engine.js — which is server-only — because both sides
  need it. The server writes it into the transcript; the browser renders it the
  instant someone clicks, without waiting for the round trip. Two copies of this
  rule would eventually disagree, and the disagreement would show up as a chat
  bubble that changes its wording a second after it appears.
*/

/** A human-readable version of an answer, or null when there's nothing to show. */
export function describeAnswer({ trade, component, answer }) {
  if (!component) return null;

  switch (component.kind) {
    case COMPONENT.CARDS:
      return component.options.find((o) => o.value === answer?.value)?.label ?? null;

    case COMPONENT.URL:
      return answer?.skip ? "We don't have a website" : (answer?.url ?? null);

    /*
      Files get no sentence. The transcript shows the documents themselves — see
      `attachmentsIn` — and a bubble reading "prices.pdf, hours.docx, induction.docx"
      above the cards for those same three files says the same thing twice, badly:
      a comma-separated list is the one form in which a filename is hardest to
      read. Nothing to add is still a sentence, because there is nothing to show.
    */
    case COMPONENT.DOCUMENTS:
      return (answer?.documents ?? []).length ? null : "Nothing to add";

    case COMPONENT.NEED: {
      const need = trade?.needs.find((n) => n.key === component.needKey);
      if (!need) return null;
      return formatNeedValue(trade, need, answer?.value) ?? "Skipped";
    }

    case COMPONENT.FOLLOWUP: {
      const question = component.question;
      if (question?.kind === "choice") {
        return (
          question.options.find((o) => o.value === answer?.value)?.label ??
          answer?.value ??
          null
        );
      }
      return answer?.value ?? null;
    }

    case COMPONENT.CALENDAR:
      return answer?.connected ? "Connected my Google Calendar" : "Not right now";

    default:
      return null;
  }
}

/**
 * The files an answer carried, as the transcript draws them.
 *
 * Read from the answer rather than from the component, because the transcript
 * has to survive a reload: a saved message keeps what was answered but not what
 * it was answered to. Only the documents step produces `answer.documents`, so
 * the shape is enough to recognise on its own.
 *
 * Same rule as `describeAnswer` — the browser calls this the instant someone
 * clicks and the server calls it when it writes the message, so the cards that
 * appear on click are the cards that are still there after a refresh.
 */
export function attachmentsIn(answer) {
  if (!Array.isArray(answer?.documents)) return [];

  return answer.documents
    .filter((doc) => doc?.name)
    .map((doc) => ({
      name: String(doc.name),
      /* Absent for anything saved before sizes were recorded. */
      bytes: Number.isFinite(doc.bytes) ? doc.bytes : null,
    }));
}
