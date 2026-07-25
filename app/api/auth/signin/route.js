import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth/accounts";
import { assertSessionsConfigured, createSession } from "@/lib/auth/session";
import { getBusinessForAccount } from "@/lib/data/business";

export const runtime = "nodejs";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  /* Fail on a missing secret before checking a password, not after. */
  try {
    assertSessionsConfigured();
  } catch (err) {
    console.error("Sign-in blocked:", err);
    return NextResponse.json({ error: err.message }, { status: 503 });
  }

  let result;
  try {
    result = await authenticate(body.email, body.password);
  } catch (err) {
    console.error("Sign-in failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  await createSession(result.account.id);

  /* Someone mid-onboarding lands back in the conversation, not on an empty dashboard. */
  const business = await getBusinessForAccount(result.account.id);
  const next =
    business?.onboarding_status === "complete" ? "/dashboard" : "/onboarding";

  return NextResponse.json({ ok: true, next });
}
