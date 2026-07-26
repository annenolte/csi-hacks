import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/auth/require";
import { cached } from "@/lib/cache/store";
import { documentKey } from "@/lib/cache/keys";
import { convertDocument, DocumentError } from "@/lib/documents/convert";
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENTS_PER_UPLOAD } from "@/lib/documents/formats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* A long PDF is a slow read, and a batch of them is slower. */
export const maxDuration = 120;

/*
  POST multipart/form-data with `files` -> { documents: [{ name, text }], errors }

  Turning a file into text and storing it are deliberately two steps. Onboarding
  and the dashboard save documents through different routes, and neither should
  have to know how to read an .xlsx; both post the files here first and carry on
  with the same `{ name, text }` they always handled.

  Nothing is stored here. The route reads bytes, returns text, and forgets the
  file — which also means a rejected format costs the owner a message rather than
  a half-written row they later have to find and delete.

  It still requires a session. Parsing is the expensive part of an upload, and an
  endpoint that will parse a 2 MB PDF for anyone who asks is a free amplifier.
*/
export async function POST(request) {
  const { response } = await requireBusiness();
  if (response) return response;

  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the files as form data." }, { status: 400 });
  }

  const files = form.getAll("files").filter((entry) => typeof entry?.arrayBuffer === "function");
  if (files.length === 0) {
    return NextResponse.json({ error: "No files in that request." }, { status: 400 });
  }
  if (files.length > MAX_DOCUMENTS_PER_UPLOAD) {
    return NextResponse.json(
      { error: `That's more than ${MAX_DOCUMENTS_PER_UPLOAD} files at once. Send them in batches.` },
      { status: 413 },
    );
  }

  /*
    Read them together rather than one after another. Every reader spends most
    of its time in the parser, and a workbook queued behind a long PDF is a
    person watching a spinner for the sum of both.
  */
  const outcomes = await Promise.all(files.map((file) => read(file)));

  const documents = [];
  const errors = [];

  for (const outcome of outcomes) {
    if (outcome.document) documents.push(outcome.document);
    else errors.push(outcome.error);
  }

  return NextResponse.json({ documents, errors });
}

/** One file to `{ document }` or `{ error }`. Never rejects. */
async function read(file) {
  const name = String(file.name || "document").split(/[/\\]/).pop();

  /*
    Checked here as well as in the browser. The client-side check is there to
    fail fast for the person dropping the file; this one is there because the
    endpoint accepts whatever is posted to it.
  */
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { error: { name, error: `${name} is bigger than 2 MB.` } };
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());

    /*
      Reading a file is the slowest part of an upload and a pure function of its
      bytes: the same PDF read twice produces the same text, because pdf.js is
      pulling the same characters out of the same file. So it is read once and
      remembered — see lib/cache/keys.js for what "the same file" means here.
    */
    const { text } = await cached("documents", documentKey({ name, bytes }), () =>
      convertDocument({ name, bytes }),
    );

    return { document: { name, text } };
  } catch (err) {
    if (err instanceof DocumentError) {
      return { error: { name, error: err.message } };
    }
    console.error(`Reading ${name} failed:`, err);
    return { error: { name, error: `${name} couldn't be read.` } };
  }
}
