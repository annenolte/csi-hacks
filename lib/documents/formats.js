/*
  The one table of file formats we accept, and what to say about the ones we
  don't.

  Both sides read this: the browser uses it for the file picker's `accept` list
  and for rejecting a file before it is uploaded, and `convert.js` uses `kind` to
  pick a reader. Adding a format means adding a row here and a reader there, and
  nowhere else — the same discipline `needs` gets in lib/trades.js.

  There is no MIME sniffing. Browsers disagree about the type they attach to an
  .xlsx, and a file picker that silently greys out a document the owner can see
  in the folder reads as broken. The extension decides which reader runs; the
  reader itself fails loudly if the bytes aren't what the name claimed.
*/

/** Big enough for any price list or handbook; small enough to parse in a request. */
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

/** One drop can carry a folder's worth, but not a hard drive's. */
export const MAX_DOCUMENTS_PER_UPLOAD = 25;

const FORMATS = [
  { ext: "txt", kind: "text" },
  { ext: "md", kind: "text" },
  { ext: "markdown", kind: "text" },
  { ext: "csv", kind: "text" },
  { ext: "tsv", kind: "text" },
  { ext: "log", kind: "text" },
  { ext: "html", kind: "html" },
  { ext: "htm", kind: "html" },
  { ext: "docx", kind: "docx" },
  { ext: "xlsx", kind: "xlsx" },
  { ext: "xlsm", kind: "xlsx" },
  { ext: "pptx", kind: "pptx" },
  { ext: "pdf", kind: "pdf" },
];

/*
  Formats we recognise and deliberately don't read, each with the one thing the
  owner can do about it. The old binary Office formats and the Apple iWork ones
  all have a lossless export to something in the table above, so the honest
  answer is to name it rather than to half-read the file.
*/
const CONVERT_FIRST = {
  doc: "Word 97–2003 files can't be read directly. Open it and save as .docx.",
  xls: "Old Excel workbooks can't be read directly. Open it and save as .xlsx.",
  ppt: "Old PowerPoint files can't be read directly. Open it and save as .pptx.",
  rtf: "Rich text can't be read directly. Save it as .docx or plain text.",
  pages: "Pages files can't be read directly. Export as .docx or PDF.",
  numbers: "Numbers files can't be read directly. Export as .xlsx or CSV.",
  key: "Keynote files can't be read directly. Export as .pptx or PDF.",
  odt: "OpenDocument text can't be read directly. Export as .docx or PDF.",
  ods: "OpenDocument sheets can't be read directly. Export as .xlsx or CSV.",
  odp: "OpenDocument slides can't be read directly. Export as .pptx or PDF.",
};

/** The `accept` attribute for a file input, straight from the table. */
export const ACCEPT = FORMATS.map((f) => `.${f.ext}`).join(",");

/** What the drop zone tells someone it takes. Kept short on purpose. */
export const ACCEPT_SUMMARY =
  "PDF, Word, Excel, PowerPoint, text, markdown, CSV or HTML. Up to 2 MB each.";

/** The extension, lowercased, with no dot. "" when the name has none. */
export function extensionOf(name) {
  const match = /\.([a-z0-9]+)$/i.exec(String(name ?? "").trim());
  return match ? match[1].toLowerCase() : "";
}

/**
 * A file's size, the way a file manager writes it.
 *
 * Rounded up to 1 KB rather than shown as bytes: the number is there to say
 * roughly how much document this is, and "412 B" invites someone to wonder
 * whether their file arrived empty.
 */
export function byteSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return null;
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** The format row for a filename, or null if we don't read that kind. */
export function formatFor(name) {
  const ext = extensionOf(name);
  return FORMATS.find((f) => f.ext === ext) ?? null;
}

/**
 * Why we won't take this file, phrased for the person who dropped it.
 *
 * A rejection is the last thing someone reads before giving up on the step, so
 * a recognised format gets the export that would work rather than a restatement
 * of the rule.
 */
export function describeUnsupported(name) {
  const ext = extensionOf(name);
  const advice = CONVERT_FIRST[ext];
  if (advice) return `${name}: ${advice}`;
  if (!ext) return `${name} has no file extension, so there's no telling what it is.`;
  return `${name}: .${ext} isn't a format we can read. ${ACCEPT_SUMMARY}`;
}
