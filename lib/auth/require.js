import "server-only";

import { NextResponse } from "next/server";
import { currentAccount } from "./session";
import { getBusinessForAccount } from "../data/business";

/*
  Every route handler that touches business data starts here.

  This is the single place business_id is decided, and it is decided from the
  session cookie — never from the request body or a query parameter. A client that
  sends a business id is ignored, because there is nothing to send: no handler
  reads one. That is what keeps "one shared service-role connection" safe.
*/

/**
 * Resolves the caller's account and business.
 * Returns `{ account, business }` or `{ response }` — the 401 to return as-is.
 */
export async function requireBusiness() {
  const account = await currentAccount();

  if (!account) {
    return {
      response: NextResponse.json({ error: "You need to sign in." }, { status: 401 }),
    };
  }

  const business = await getBusinessForAccount(account.id);

  if (!business) {
    /*
      Signup creates both rows together, so this means the business row was
      deleted out from under a live session. Nothing the caller can fix by
      retrying; say so rather than 500ing on a null further down.
    */
    return {
      response: NextResponse.json(
        { error: "This account has no business set up. Sign out and create a new account." },
        { status: 409 },
      ),
    };
  }

  return { account, business };
}
