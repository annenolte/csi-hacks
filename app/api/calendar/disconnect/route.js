import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/auth/require";
import { removeCalendarConnection } from "@/lib/data/business";

export const runtime = "nodejs";

/*
  POST, not GET: a GET would let any page disconnect a signed-in user's calendar
  with an <img> tag.

  This deletes our stored tokens. It does not revoke the grant at Google — the
  user can do that at myaccount.google.com/permissions, and reconnecting here is
  the common case, which a revoke would make needlessly slow.
*/
export async function POST() {
  const { business, response } = await requireBusiness();
  if (response) return response;

  try {
    await removeCalendarConnection(business.id);
  } catch (err) {
    console.error("Couldn't disconnect the calendar:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
