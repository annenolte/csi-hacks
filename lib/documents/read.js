import {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS_PER_UPLOAD,
  describeUnsupported,
  formatFor,
} from "./formats";

/*
  What the browser does with a dropped file: check the name and the size, hand
  the bytes to the server, and get text back.

  The browser never parses anything itself. Onboarding and the dashboard both
  take documents, and one reader on the server is one set of rules about what a
  document says — two readers would eventually disagree, and the disagreement
  would surface as a quote the owner doesn't recognise. It also keeps pdf.js and
  the Office readers out of a bundle that a phone has to download before someone
  can answer the first question.

  One request per file, on purpose. A batch is only as fast as its slowest PDF,
  and a single request means five files all land at once after the worst of them
  finishes. Sending them separately lets each card settle the moment its own file
  is read, and lets the server read them in parallel rather than in a queue.

  Errors come back as sentences, one per file, because a batch drop can be part
  right: four price lists read and a scanned invoice refused is a useful outcome,
  not a failed upload.
*/

/** Why we won't send this file, or null if we will. Checked before any upload. */
export function rejectionFor(file) {
  if (!formatFor(file.name)) return describeUnsupported(file.name);
  if (file.size > MAX_DOCUMENT_BYTES) return `${file.name} is too big — 2 MB is the limit.`;
  return null;
}

/**
 * Reads one file. Resolves to `{ document }` or `{ error }` — never throws, so a
 * caller reading several at once doesn't lose the good ones to the bad one.
 */
export async function readFile(file) {
  const rejection = rejectionFor(file);
  if (rejection) return { error: rejection };

  const body = new FormData();
  body.append("files", file, file.name);

  try {
    const response = await fetch("/api/documents/extract", { method: "POST", body });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { error: payload.error ?? `${file.name} couldn't be read.` };
    }

    const document = payload.documents?.[0];
    if (!document) {
      return { error: payload.errors?.[0]?.error ?? `${file.name} couldn't be read.` };
    }

    return { document };
  } catch {
    return { error: "Couldn't reach the server." };
  }
}

/** Reads a whole drop at once, in parallel. Partial success is the normal case. */
export async function readFiles(fileList) {
  const files = Array.from(fileList ?? []);
  const errors = [];

  const taking = files.slice(0, MAX_DOCUMENTS_PER_UPLOAD);
  for (const extra of files.slice(MAX_DOCUMENTS_PER_UPLOAD)) {
    errors.push(`${extra.name} didn't fit — ${MAX_DOCUMENTS_PER_UPLOAD} files at a time.`);
  }

  const results = await Promise.all(taking.map((file) => readFile(file)));

  const documents = [];
  for (const result of results) {
    if (result.document) documents.push(result.document);
    else if (result.error) errors.push(result.error);
  }

  return { documents, errors };
}
