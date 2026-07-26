import { createHash } from "node:crypto";

/* Extension spelled out: scripts/record-demo-cache.mjs imports this under plain
   Node, which doesn't do the bundler's extensionless resolution. */
import { extensionOf } from "../documents/formats.js";

/*
  Every cache key in the product, built in one place.

  A key is a promise: "this input produced this output". Two callers computing
  the same key slightly differently is how a cache starts serving one input's
  answer for another, and the only way to be sure they don't is for there to be
  one of each key. The recorder in scripts/record-demo-cache.mjs looks entries up
  by the same functions the app writes them with, so a recording can't miss by a
  version tag or a separator.

  Nothing here is server-only: these are hashes of inputs, they hold no secret,
  and the recorder is a plain Node script rather than a request.

  The `.vN` tags are how a recording is retired. Change what goes into a prompt,
  or what a reader returns, and bump the tag — every old entry becomes
  unreachable at once, which is what you want, because the alternative is a cache
  that answers with the output of code that no longer exists.
*/

/**
 * A stable hex key for a list of parts.
 *
 * Each part carries its own length, so ("ab", "c") and ("a", "bc") can't collide
 * — which they would under a plain join, and a collision here means one
 * business's extraction served to another.
 */
export function fingerprint(...parts) {
  const hash = createHash("sha256");
  for (const part of parts) {
    const value =
      typeof part === "string" || part instanceof Uint8Array ? part : String(part);
    hash.update(String(value.length ?? 0));
    hash.update(" ");
    hash.update(value);
    hash.update(" ");
  }
  return hash.digest("hex");
}

/*
  A file turned into text.

  Keyed on the bytes and the extension, and deliberately not on the name: the
  extension picks the reader, the bytes are what it reads, and the same price
  list dropped into two accounts under two names is one parse whose output says
  nothing about who uploaded it.
*/
export const documentKey = ({ name, bytes }) =>
  fingerprint("convert.v1", extensionOf(name), bytes);

/** One fetched page. The address is the whole of the input. */
export const websitePageKey = (url) => fingerprint("page.v1", url);

/** What the single-page extractor made of that page. */
export const websiteFieldsKey = ({ tradeId, url, text }) =>
  fingerprint("fields.v1", tradeId, url, text);

/**
 * The whole-corpus read.
 *
 * Built from the documents rather than from the assembled corpus text, sorted by
 * name, so the same files dropped in a different order are the same corpus.
 * Nothing about the order they arrived in changes what they say.
 */
export const corpusKey = ({ tradeId, documents }) =>
  fingerprint(
    "corpus.v1",
    tradeId,
    ...[...(documents ?? [])]
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .flatMap((doc) => [String(doc.name ?? ""), String(doc.text ?? "")]),
  );

/** The follow-up questions. Same prompt, same questions. */
export const followupsKey = (prompt) => fingerprint("followups.v1", prompt);
