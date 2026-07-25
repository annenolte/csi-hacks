import "server-only";

import { db, unwrap } from "../supabase";

/*
  The only file that knows how the app's shapes map onto rows. Route handlers call
  these; nothing else touches Supabase directly.

  Every query is scoped by business_id, and business_id is always derived from the
  session on the server — it is never accepted from the client. That is what makes
  it safe to have one shared service-role connection: there is no request in which
  a caller can name a business that isn't theirs.
*/

/* Confidence is 0–1 in the app and an integer 0–100 in the column. */
const toStored = (c) =>
  typeof c === "number" && Number.isFinite(c)
    ? Math.max(0, Math.min(100, Math.round(c * 100)))
    : null;

const fromStored = (c) => (typeof c === "number" ? c / 100 : null);

const now = () => new Date().toISOString();

/* ---------------------------------------------------------------- businesses */

export async function getBusiness(businessId) {
  const rows = unwrap(
    await db().from("businesses").select("*").eq("id", businessId).limit(1),
    "Couldn't load the business",
  );
  return rows[0] ?? null;
}

export async function getBusinessForAccount(accountId) {
  const rows = unwrap(
    await db()
      .from("businesses")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: true })
      .limit(1),
    "Couldn't load the business",
  );
  return rows[0] ?? null;
}

export async function updateBusiness(businessId, patch) {
  const rows = unwrap(
    await db()
      .from("businesses")
      .update({ ...patch, updated_at: now() })
      .eq("id", businessId)
      .select(),
    "Couldn't save the business",
  );
  return rows[0] ?? null;
}

/* ------------------------------------------------------------ business_fields */

/**
 * Everything the agent knows, keyed by need. Values are already parsed — jsonb
 * comes back as real JavaScript, so there is no JSON.parse anywhere downstream.
 */
export async function getFields(businessId) {
  const rows = unwrap(
    await db().from("business_fields").select("*").eq("business_id", businessId),
    "Couldn't load what the agent knows",
  );

  const answers = {};
  const meta = {};

  for (const row of rows) {
    answers[row.key] = row.value;
    meta[row.key] = {
      source: row.source,
      confidence: fromStored(row.confidence),
      sentence: row.source_sentence,
      document: row.source_document,
      updatedAt: row.updated_at,
    };
  }

  return { answers, meta };
}

/**
 * Write one field. An emptied value is a deletion, not a stored empty string —
 * otherwise "the owner cleared this" and "nobody has answered this" become
 * indistinguishable, and the gap calculation stops working.
 */
export async function setField(businessId, key, value, provenance = {}) {
  const empty =
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0);

  if (empty) {
    unwrap(
      await db()
        .from("business_fields")
        .delete()
        .eq("business_id", businessId)
        .eq("key", key),
      "Couldn't clear that field",
    );
    return;
  }

  unwrap(
    await db()
      .from("business_fields")
      .upsert(
        {
          business_id: businessId,
          key,
          value,
          source: provenance.source ?? "operator",
          confidence: toStored(provenance.confidence),
          source_sentence: provenance.sentence ?? null,
          source_document: provenance.document ?? null,
          updated_at: now(),
        },
        { onConflict: "business_id,key" },
      ),
    "Couldn't save that field",
  );
}

export async function setFields(businessId, entries) {
  for (const entry of entries) {
    await setField(businessId, entry.key, entry.value, entry);
  }
}

/* ----------------------------------------------------------------- documents */

export async function getDocuments(businessId) {
  const rows = unwrap(
    await db()
      .from("documents")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    "Couldn't load the documents",
  );

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    source: row.source,
    text: row.text,
    chars: row.chars,
    createdAt: row.created_at,
  }));
}

export async function addDocument(businessId, doc) {
  const rows = unwrap(
    await db()
      .from("documents")
      .insert({
        business_id: businessId,
        kind: doc.kind ?? "file",
        name: doc.name,
        source: doc.source ?? doc.name,
        text: doc.text ?? null,
        chars: doc.chars ?? (doc.text ? doc.text.length : null),
      })
      .select(),
    "Couldn't store that document",
  );
  return rows[0] ?? null;
}

export async function removeDocument(businessId, documentId) {
  unwrap(
    await db()
      .from("documents")
      .delete()
      .eq("business_id", businessId)
      .eq("id", documentId),
    "Couldn't remove that document",
  );
}

/* ------------------------------------------------------------ facts + prices */

/*
  A synthesis run replaces its results wholesale rather than merging. If a document
  was removed, the fact it supported has to disappear with it — a merge would leave
  the agent citing a sentence that no longer exists in any document it has.
*/
export async function saveSynthesis(businessId, { facts = [], prices = [] }) {
  unwrap(
    await db().from("facts").delete().eq("business_id", businessId),
    "Couldn't clear previous findings",
  );
  unwrap(
    await db().from("prices").delete().eq("business_id", businessId),
    "Couldn't clear previous prices",
  );

  if (facts.length > 0) {
    unwrap(
      await db()
        .from("facts")
        .insert(
          facts.map((fact) => ({
            business_id: businessId,
            key: fact.need.key,
            value: fact.value,
            confidence: toStored(fact.confidence),
            source_sentence: fact.source ?? null,
            document_name: fact.document ?? null,
            conflicted: Boolean(fact.conflicted),
          })),
        ),
      "Couldn't store what we found",
    );
  }

  if (prices.length > 0) {
    unwrap(
      await db()
        .from("prices")
        .insert(
          prices.map((price) => ({
            business_id: businessId,
            service_key: price.serviceKey,
            raw_text: price.rawText,
            amount: price.amount ?? null,
            tier: price.tier,
            reason: price.reason ?? null,
            confidence: toStored(price.confidence),
            source_sentence: price.source ?? null,
            document_name: price.document ?? null,
          })),
        ),
      "Couldn't store the prices",
    );
  }
}

export async function getSynthesis(businessId) {
  const factRows = unwrap(
    await db().from("facts").select("*").eq("business_id", businessId),
    "Couldn't load what we found",
  );
  const priceRows = unwrap(
    await db().from("prices").select("*").eq("business_id", businessId),
    "Couldn't load the prices",
  );

  return {
    facts: factRows.map((row) => ({
      key: row.key,
      value: row.value,
      confidence: fromStored(row.confidence),
      source: row.source_sentence,
      document: row.document_name,
      conflicted: row.conflicted,
    })),
    prices: priceRows.map((row) => ({
      serviceKey: row.service_key,
      rawText: row.raw_text,
      amount: row.amount === null ? null : Number(row.amount),
      tier: row.tier,
      reason: row.reason,
      confidence: fromStored(row.confidence),
      source: row.source_sentence,
      document: row.document_name,
    })),
  };
}

/* ------------------------------------------------------ calendar connections */

export async function getCalendarConnection(businessId) {
  const rows = unwrap(
    await db()
      .from("calendar_connections")
      .select("*")
      .eq("business_id", businessId)
      .limit(1),
    "Couldn't load the calendar connection",
  );
  return rows[0] ?? null;
}

export async function saveCalendarConnection(businessId, connection) {
  unwrap(
    await db()
      .from("calendar_connections")
      .upsert(
        {
          business_id: businessId,
          provider: "google",
          google_email: connection.email ?? null,
          calendar_id: connection.calendarId ?? "primary",
          access_token: connection.accessToken ?? null,
          refresh_token: connection.refreshToken,
          expires_at: connection.expiresAt ?? null,
          scope: connection.scope ?? null,
          updated_at: now(),
        },
        { onConflict: "business_id" },
      ),
    "Couldn't save the calendar connection",
  );
}

export async function updateCalendarTokens(businessId, { accessToken, expiresAt }) {
  unwrap(
    await db()
      .from("calendar_connections")
      .update({ access_token: accessToken, expires_at: expiresAt, updated_at: now() })
      .eq("business_id", businessId),
    "Couldn't refresh the calendar connection",
  );
}

export async function removeCalendarConnection(businessId) {
  unwrap(
    await db().from("calendar_connections").delete().eq("business_id", businessId),
    "Couldn't disconnect the calendar",
  );
}
