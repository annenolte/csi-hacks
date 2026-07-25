import "server-only";

import { db, unwrap } from "../supabase";

/*
  The number the owner gives out to customers.

  Nothing is provisioned with a carrier — this is a prototype, and the seam where
  a real number gets bought is the one place that matters when it stops being one.
  So the number is generated here, stored on the business, and unique, which means
  swapping in a carrier API later is a change to this file and nothing else.

  The local part is drawn from 555-0100 to 555-0199: the block reserved by the
  North American Numbering Plan for fiction, and the only range guaranteed never
  to ring a real person. Picking a "realistic-looking" number instead would mean
  printing a stranger's phone number on a dashboard and telling a business to hand
  it to its customers.
*/

/* Real area codes, so the number reads like a local line rather than a test. */
const AREA_CODES = [
  "212", "213", "312", "404", "415", "480", "503", "512", "602", "617",
  "702", "713", "720", "737", "804", "813", "857", "919", "971", "984",
];

const format = (area, line) => `(${area}) 555-01${String(line).padStart(2, "0")}`;

/**
 * Assigns a number to a business, or returns the one it already has.
 * Idempotent: running onboarding twice doesn't change the number on the
 * dashboard, which someone may already have written on a van.
 */
export async function assignPhoneNumber(businessId, existing) {
  if (existing) return existing;

  /*
    2000 possible numbers, so collisions are rare but not impossible. The unique
    index is the real guard — this loop just retries past it rather than failing
    someone's setup on a coin flip.
  */
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = format(
      AREA_CODES[Math.floor(Math.random() * AREA_CODES.length)],
      Math.floor(Math.random() * 100),
    );

    const { data, error } = await db()
      .from("businesses")
      .update({ agent_phone_number: candidate, updated_at: new Date().toISOString() })
      .eq("id", businessId)
      .select();

    /* 23505 is Postgres' unique violation — that number is taken, try another. */
    if (error?.code === "23505") continue;
    if (error) throw new Error(`Couldn't assign a phone number: ${error.message}`);

    return data[0]?.agent_phone_number ?? candidate;
  }

  throw new Error("Couldn't find a free phone number. Try finishing setup again.");
}

/** E.164 for the voice agent, which matches inbound calls on the dialled number. */
export function toE164(display) {
  const digits = String(display ?? "").replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return `+1${digits}`;
}

export { AREA_CODES as _AREA_CODES };
