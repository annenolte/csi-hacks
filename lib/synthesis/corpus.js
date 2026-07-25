/*
  Assembles every document for a business into one prompt.

  No chunking, no embeddings, no vector search — PLAN.md is explicit about this
  and the reasoning is worth keeping in view: a small trade business's entire
  corpus fits in one context window, and putting all of it in one prompt buys
  better extraction and exact quoted citations for free. Retrieval would trade
  both away to solve a size problem this domain does not have.

  If a corpus ever genuinely does not fit, the right answer is to say so out loud
  (see `truncated`) rather than to silently drop the tail.
*/

/* Well inside Opus 5's 1M window; the cap is about cost and latency, not capacity. */
const DEFAULT_MAX_CHARS = 400_000;

export function buildCorpus(documents, { maxChars = DEFAULT_MAX_CHARS } = {}) {
  const usable = (documents ?? []).filter(
    (doc) => typeof doc.text === "string" && doc.text.trim() !== "",
  );

  const parts = [];
  const included = [];
  const skipped = [];
  let chars = 0;
  let truncated = false;

  for (const doc of usable) {
    /* The label is what the model cites, so it has to be stable and human-readable. */
    const header = `<document name="${doc.name}">`;
    const body = doc.text.trim();
    const block = `${header}\n${body}\n</document>`;

    if (chars + block.length > maxChars) {
      truncated = true;
      skipped.push(doc.name);
      continue;
    }

    parts.push(block);
    included.push({ id: doc.id, name: doc.name });
    chars += block.length;
  }

  return {
    text: parts.join("\n\n"),
    documents: included,
    skipped,
    chars,
    truncated,
    isEmpty: parts.length === 0,
  };
}
