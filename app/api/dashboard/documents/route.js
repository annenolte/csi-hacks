import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/auth/require";
import { getTrade } from "@/lib/trades";
import { addDocument, removeDocument } from "@/lib/data/business";
import { runSynthesis } from "@/lib/synthesis/run";

export const runtime = "nodejs";
/* Adding a document re-reads the whole corpus; that's two model calls. */
export const maxDuration = 300;

const MAX_CHARS = 2_000_000;

/*
  POST { documents: [{ name, text }] } -> stored, then everything is re-read.
  DELETE ?id=... -> removed, then everything is re-read.

  Both re-run synthesis over the whole corpus rather than diffing. A removed
  document has to take its facts with it, and a new one can contradict an old one
  — neither is expressible as an incremental update, and a stale fact here is one
  the agent will state on a phone call.
*/

async function reread(business) {
  const trade = getTrade(business.industry_id);
  if (!trade) return { skipped: "No trade is set for this business." };

  const { promoted, report, failure } = await runSynthesis({ business, trade });

  return {
    learned: promoted.length,
    prices: report?.prices?.length ?? 0,
    conflicts: report?.conflicts?.length ?? 0,
    failure,
  };
}

export async function POST(request) {
  const { business, response } = await requireBusiness();
  if (response) return response;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 });
  }

  const documents = Array.isArray(body?.documents) ? body.documents : [];
  if (documents.length === 0) {
    return NextResponse.json({ error: "No documents in that request." }, { status: 400 });
  }

  try {
    for (const doc of documents) {
      if (typeof doc?.text !== "string" || !doc.text.trim()) continue;
      if (doc.text.length > MAX_CHARS) {
        return NextResponse.json(
          { error: `${doc.name} is too large to read in one go.` },
          { status: 413 },
        );
      }

      await addDocument(business.id, {
        kind: "file",
        name: doc.name,
        source: doc.name,
        text: doc.text,
      });
    }

    return NextResponse.json({ ok: true, ...(await reread(business)) });
  } catch (err) {
    console.error("Couldn't add that document:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { business, response } = await requireBusiness();
  if (response) return response;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Which document?" }, { status: 400 });
  }

  try {
    await removeDocument(business.id, id);
    return NextResponse.json({ ok: true, ...(await reread(business)) });
  } catch (err) {
    console.error("Couldn't remove that document:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
