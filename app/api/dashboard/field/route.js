import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/auth/require";
import { getTrade } from "@/lib/trades";
import { setField } from "@/lib/data/business";

export const runtime = "nodejs";

/*
  PATCH { key, value } -> the operator correcting what the agent knows.

  Written with source "operator", which outranks anything read from a website or a
  document: a person who runs the business saying "we don't cover that town any
  more" is better evidence than a price list from 2019. The provenance columns are
  cleared with it, because the old sentence no longer explains the new value and
  leaving it there would attribute the operator's correction to a document that
  never said it.
*/
export async function PATCH(request) {
  const { business, response } = await requireBusiness();
  if (response) return response;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 });
  }

  const trade = getTrade(business.industry_id);
  const need = trade?.needs.find((n) => n.key === body?.key);

  /*
    Only keys that exist in the trade definition. Without this an arbitrary key
    could be written into the record and then read straight back out into the
    brief the voice agent reads aloud.
  */
  if (!need) {
    return NextResponse.json({ error: "There's no such field." }, { status: 400 });
  }

  try {
    await setField(business.id, need.key, body.value, { source: "operator" });
  } catch (err) {
    console.error("Couldn't save that field:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
