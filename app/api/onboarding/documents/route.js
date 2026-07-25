import { NextResponse } from "next/server";
import { addDocument, removeDocument } from "@/lib/db/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Documents are discrete actions, so they save the moment they happen. */

const MAX_TEXT_CHARS = 400_000;

export async function POST(request) {
  let doc;
  try {
    doc = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 });
  }

  if (!doc?.id || !doc?.name) {
    return NextResponse.json({ error: "A document needs an id and a name." }, { status: 400 });
  }
  if (typeof doc.text === "string" && doc.text.length > MAX_TEXT_CHARS) {
    return NextResponse.json({ error: "That file is too big to store." }, { status: 413 });
  }

  try {
    return NextResponse.json(await addDocument(doc));
  } catch (err) {
    console.error("Failed to store document:", err);
    return NextResponse.json({ error: "Couldn't save that file." }, { status: 500 });
  }
}

export async function DELETE(request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Which document?" }, { status: 400 });
  }

  try {
    return NextResponse.json(await removeDocument(id));
  } catch (err) {
    console.error("Failed to remove document:", err);
    return NextResponse.json({ error: "Couldn't remove that file." }, { status: 500 });
  }
}
