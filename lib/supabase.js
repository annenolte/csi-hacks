import "server-only";

import { createClient } from "@supabase/supabase-js";

/*
  The one Supabase client, and the only place the service role key is read.

  `server-only` at the top is load-bearing: importing this file from a client
  component is a build error rather than a key leak. The service role key bypasses
  Row Level Security entirely, and the schema enables RLS with no policies, so this
  client is the only thing in the system that can read or write anything.

  Nothing in the browser talks to Supabase. Every read and write goes through a
  route handler that has already resolved the session, which is what makes
  business_id trustworthy — the client never sends it.
*/

let client = null;

export function db() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  /*
    Fail loudly at first use rather than returning a client that 401s on every
    query — a misconfigured environment should say so in one sentence, not as a
    cascade of confusing empty results.
  */
  if (!url || !key) {
    throw new Error(
      "Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY in .env.local — see docs/SETUP.md — then " +
        "restart the dev server.",
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}

export function supabaseIsConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/** Throws the Supabase error if there is one, otherwise returns the data. */
export function unwrap({ data, error }, what) {
  if (error) {
    throw new Error(`${what}: ${error.message}`);
  }
  return data;
}
