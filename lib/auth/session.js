import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db, unwrap } from "../supabase";

/*
  Sessions are a random opaque token stored in the database, handed to the browser
  in an httpOnly cookie, and signed so a forged cookie is rejected before it costs
  a database round trip.

  Why a database row rather than a self-contained signed cookie: sign-out and
  expiry should actually revoke access. A stateless token stays valid until it
  expires no matter what the server thinks, and there is no way to end a session
  early — which matters the moment a real person shares a laptop.
*/

const COOKIE = "fd_session";
const TTL_DAYS = 30;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error(
      "SESSION_SECRET isn't set. Generate one with " +
        `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" ` +
        "and add it to .env.local — see docs/SETUP.md.",
    );
  }
  return value;
}

const sign = (token) => createHmac("sha256", secret()).update(token).digest("hex");

/** `token.signature`, so a tampered cookie never reaches the database. */
function pack(token) {
  return `${token}.${sign(token)}`;
}

function unpack(cookieValue) {
  if (typeof cookieValue !== "string") return null;

  const dot = cookieValue.lastIndexOf(".");
  if (dot < 1) return null;

  const token = cookieValue.slice(0, dot);
  const provided = Buffer.from(cookieValue.slice(dot + 1), "hex");
  const expected = Buffer.from(sign(token), "hex");

  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  return token;
}

export async function createSession(accountId) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

  unwrap(
    await db()
      .from("sessions")
      .insert({ token, account_id: accountId, expires_at: expiresAt.toISOString() }),
    "Couldn't start a session",
  );

  const store = await cookies();
  store.set(COOKIE, pack(token), {
    httpOnly: true,
    sameSite: "lax",
    /* Secure in production only — localhost is http, and a Secure cookie there
       is silently dropped, which looks exactly like a broken login. */
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

/**
 * The signed-in account, or null. Expired rows are deleted on sight rather than
 * left to accumulate — there's no cron here, and the read path is the only thing
 * that reliably runs.
 */
export async function currentAccount() {
  const store = await cookies();
  const token = unpack(store.get(COOKIE)?.value);
  if (!token) return null;

  const rows = unwrap(
    await db()
      .from("sessions")
      .select("token, expires_at, accounts (id, email, first_name, last_name)")
      .eq("token", token)
      .limit(1),
    "Couldn't check your session",
  );

  const row = rows[0];
  if (!row?.accounts) return null;

  if (new Date(row.expires_at) < new Date()) {
    await db().from("sessions").delete().eq("token", token);
    return null;
  }

  return {
    id: row.accounts.id,
    email: row.accounts.email,
    firstName: row.accounts.first_name,
    lastName: row.accounts.last_name,
  };
}

export async function destroySession() {
  const store = await cookies();
  const token = unpack(store.get(COOKIE)?.value);

  if (token) {
    await db().from("sessions").delete().eq("token", token);
  }

  store.delete(COOKIE);
}
