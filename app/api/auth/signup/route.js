import { NextResponse } from "next/server";
import { createAccount, validateSignup } from "@/lib/auth/accounts";
import { assertSessionsConfigured, createSession } from "@/lib/auth/session";

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

  /*
    Before the first write, not after. Everything past this point creates rows,
    and a config error discovered halfway through leaves an account nobody can
    sign in to and an email address that can never be used again.
  */
  try {
    assertSessionsConfigured();
  } catch (err) {
    console.error("Signup blocked:", err);
    return NextResponse.json({ error: err.message }, { status: 503 });
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

  try {
    await createSession(result.account.id);
  } catch (err) {
    /*
      The account exists and is usable — only the cookie failed. Say so, and send
      them to sign in rather than reporting a failure that would make them try to
      register the same address again.
    */
    console.error("Couldn't start a session after signup:", err);
    return NextResponse.json(
      {
        error: `Your account was created, but signing you in failed: ${err.message} Try signing in.`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, next: "/onboarding" });
}
