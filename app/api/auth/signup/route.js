import { NextResponse } from "next/server";
import { createAccount, validateSignup } from "@/lib/auth/accounts";
import { createSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const check = validateSignup(body);
  if (!check.ok) {
    return NextResponse.json({ errors: check.errors }, { status: 400 });
  }

  let result;
  try {
    result = await createAccount(body);
  } catch (err) {
    console.error("Signup failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 409 });
  }

  await createSession(result.account.id);

  return NextResponse.json({ ok: true, next: "/onboarding" });
}
