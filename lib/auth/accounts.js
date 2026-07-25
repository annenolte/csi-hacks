import "server-only";

import { db, unwrap } from "../supabase";
import { hashPassword, verifyPassword } from "./password";

/*
  Signing up creates two rows, always together: an account and its business.
  Everything downstream hangs off business_id, so a business that doesn't exist
  yet would mean every other module needing a "not set up yet" branch.
*/

export function validateSignup({ firstName, lastName, company, email, password }) {
  const errors = {};

  if (!firstName?.trim()) errors.firstName = "We need a first name.";
  if (!lastName?.trim()) errors.lastName = "We need a last name.";
  if (!company?.trim()) errors.company = "What's the business called?";

  /*
    Deliberately loose. Anything stricter rejects real addresses — plus signs,
    new TLDs, unicode domains — and the only thing that actually proves an address
    works is sending mail to it.
  */
  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = "That doesn't look like an email address.";
  }

  if (!password || password.length < 8) {
    errors.password = "At least 8 characters.";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export async function createAccount({ firstName, lastName, company, email, password }) {
  const normalisedEmail = email.trim().toLowerCase();

  const existing = unwrap(
    await db().from("accounts").select("id").eq("email", normalisedEmail).limit(1),
    "Couldn't check that email",
  );

  if (existing.length > 0) {
    return { ok: false, errors: { email: "There's already an account with that email." } };
  }

  const accounts = unwrap(
    await db()
      .from("accounts")
      .insert({
        email: normalisedEmail,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        password_hash: await hashPassword(password),
      })
      .select(),
    "Couldn't create the account",
  );

  const account = accounts[0];

  const businesses = unwrap(
    await db()
      .from("businesses")
      .insert({ account_id: account.id, name: company.trim() })
      .select(),
    "Couldn't create the business",
  );

  return { ok: true, account, business: businesses[0] };
}

export async function authenticate(email, password) {
  const rows = unwrap(
    await db()
      .from("accounts")
      .select("*")
      .eq("email", (email ?? "").trim().toLowerCase())
      .limit(1),
    "Couldn't check those details",
  );

  const account = rows[0];

  /*
    Same message whether the email is unknown or the password is wrong. Saying
    "no account with that email" turns the sign-in form into a way to find out
    who has an account here.
  */
  const failure = { ok: false, error: "That email and password don't match." };

  if (!account) {
    /*
      Hash anyway. Returning instantly for an unknown email while a known one
      takes ~100ms is the same disclosure by another route.
    */
    await hashPassword(password ?? "");
    return failure;
  }

  if (!(await verifyPassword(password ?? "", account.password_hash))) {
    return failure;
  }

  return { ok: true, account };
}
