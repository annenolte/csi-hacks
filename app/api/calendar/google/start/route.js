import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/auth/require";
import { authorizeUrl, googleIsConfigured } from "@/lib/calendar/google";

export const runtime = "nodejs";

const STATE_COOKIE = "fd_oauth_state";

/*
  Kicks off the Google consent flow.

  The `state` parameter is a one-time random value echoed back by Google and
  compared against an httpOnly cookie. Without it, an attacker can send a signed-in
  user to a callback URL carrying the attacker's own authorization code, and the
  victim's business ends up connected to the attacker's calendar — every job the
  agent books would land in a stranger's diary.
*/
export async function GET() {
  const { response } = await requireBusiness();
  if (response) return response;

  if (!googleIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Google Calendar isn't configured on this server. See docs/SETUP.md section 3.",
      },
      { status: 503 },
    );
  }

  const state = randomBytes(24).toString("hex");

  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(authorizeUrl(state));
}
