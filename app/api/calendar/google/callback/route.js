import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/auth/require";
import { completeConnection } from "@/lib/calendar/google";
import { RETURN_COOKIE, returnPath } from "@/lib/calendar/return-to";

export const runtime = "nodejs";

const STATE_COOKIE = "fd_oauth_state";

/**
 * Back to whichever page started this, with a message it can show.
 *
 * Onboarding starts the flow mid-conversation, so it has to be able to pick the
 * conversation back up where it left off rather than dumping someone on the
 * dashboard three questions from the end.
 */
function back(request, destination, params) {
  const url = new URL(destination, request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request) {
  const { business, response } = await requireBusiness();
  if (response) return response;

  const params = request.nextUrl.searchParams;
  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  const destination = returnPath(store.get(RETURN_COOKIE)?.value);
  store.delete(STATE_COOKIE);
  store.delete(RETURN_COOKIE);

  /* The user pressed Cancel, or Google refused (unverified app, not a test user). */
  if (params.get("error")) {
    return back(request, destination, {
      calendar: "error",
      reason:
        params.get("error") === "access_denied"
          ? "Google didn't allow that. If the app is still in Testing, your address has to be on the test users list."
          : "Google returned an error. Check the OAuth setup in docs/SETUP.md.",
    });
  }

  const state = params.get("state");

  /*
    Compare in constant time and only after confirming equal length. A plain
    `!==` here is a smaller hole than most, but the whole point of the check is
    that nothing about the expected value leaks — including its length.
  */
  const ok =
    typeof state === "string" &&
    typeof expected === "string" &&
    state.length === expected.length &&
    timingSafeEqual(Buffer.from(state), Buffer.from(expected));

  if (!ok) {
    return back(request, destination, {
      calendar: "error",
      reason: "That sign-in didn't match the one we started. Try connecting again.",
    });
  }

  const code = params.get("code");
  if (!code) {
    return back(request, destination, {
      calendar: "error",
      reason: "Google didn't send back an authorization code.",
    });
  }

  try {
    const { email } = await completeConnection(business.id, code);
    return back(request, destination, { calendar: "connected", account: email ?? "" });
  } catch (err) {
    console.error("Google Calendar connection failed:", err);
    return back(request, destination, { calendar: "error", reason: err.message });
  }
}
