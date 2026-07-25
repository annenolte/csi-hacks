import "server-only";

import { and, eq } from "drizzle-orm";
import { db as defaultDb, BUSINESS_ID } from "./index";
import { businessFields, businesses, documents } from "./schema";

/*
  The only place that knows how the wizard's shape maps onto rows. Routes call
  these; nothing else touches drizzle.

  Everything is scoped by business_id even though Phase 2 has exactly one
  business — so adding accounts is a change of where the id comes from, not a
  rewrite of every query.
*/

function parseJson(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/* Confidence is 0–1 in the app and an integer 0–100 in the column. */
const toStoredConfidence = (c) =>
  typeof c === "number" && Number.isFinite(c)
    ? Math.max(0, Math.min(100, Math.round(c * 100)))
    : null;

const fromStoredConfidence = (c) => (typeof c === "number" ? c / 100 : null);

export async function loadOnboarding(db = defaultDb, businessId = BUSINESS_ID) {
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId));

  const fieldRows = await db
    .select()
    .from(businessFields)
    .where(eq(businessFields.businessId, businessId));

  const docRows = await db
    .select()
    .from(documents)
    .where(eq(documents.businessId, businessId));

  const answers = {};
  const fieldSource = {};
  const suggestions = {};

  for (const row of fieldRows) {
    answers[row.key] = parseJson(row.value);
    fieldSource[row.key] = row.source;

    if (row.suggestedValue !== null && row.suggestedValue !== undefined) {
      suggestions[row.key] = {
        value: parseJson(row.suggestedValue),
        confidence: fromStoredConfidence(row.confidence),
        source: row.sourceSentence,
      };
    }
  }

  return {
    tradeId: business?.tradeId ?? null,
    answers,
    fieldSource,
    suggestions,
    websiteUrl: business?.websiteUrl ?? null,
    calendar: {
      provider: business?.calendarProvider ?? null,
      connected: Boolean(business?.calendarConnected),
      touched: Boolean(business?.calendarProvider) || Boolean(business?.calendarConnected),
    },
    documents: docRows.map((d) => ({
      id: d.id,
      kind: d.kind,
      name: d.name,
      source: d.source,
      text: d.text,
      chars: d.chars,
    })),
  };
}

/**
 * Partial save. Only the keys present in `patch` are written, so the wizard can
 * post after each step without having to send the whole world every time.
 */
export async function saveOnboarding(patch, db = defaultDb, businessId = BUSINESS_ID) {
  const businessPatch = {};
  if ("tradeId" in patch) businessPatch.tradeId = patch.tradeId;
  if ("websiteUrl" in patch) businessPatch.websiteUrl = patch.websiteUrl;
  if (patch.calendar) {
    businessPatch.calendarProvider = patch.calendar.provider ?? null;
    businessPatch.calendarConnected = Boolean(patch.calendar.connected);
  }

  if (Object.keys(businessPatch).length > 0) {
    businessPatch.updatedAt = new Date().toISOString();
    await db
      .update(businesses)
      .set(businessPatch)
      .where(eq(businesses.id, businessId));
  }

  /*
    Changing trade discards the answers rather than trying to map them across —
    a different trade has a different needs list, so nothing carries over. The
    wizard does the same thing client-side.
  */
  if (patch.clearFields) {
    await db.delete(businessFields).where(eq(businessFields.businessId, businessId));
  }

  if (patch.answers) {
    const now = new Date().toISOString();

    for (const [key, value] of Object.entries(patch.answers)) {
      /* An emptied field is a deletion, not a stored empty string. */
      if (value === null || value === undefined || value === "") {
        await db
          .delete(businessFields)
          .where(
            and(
              eq(businessFields.businessId, businessId),
              eq(businessFields.key, key),
            ),
          );
        continue;
      }

      const suggestion = patch.suggestions?.[key] ?? null;
      const row = {
        businessId,
        key,
        value: JSON.stringify(value),
        source: patch.fieldSource?.[key] ?? "manual",
        suggestedValue: suggestion ? JSON.stringify(suggestion.value) : null,
        confidence: suggestion ? toStoredConfidence(suggestion.confidence) : null,
        sourceSentence: suggestion?.source ?? null,
        updatedAt: now,
      };

      await db
        .insert(businessFields)
        .values(row)
        .onConflictDoUpdate({
          target: [businessFields.businessId, businessFields.key],
          set: {
            value: row.value,
            source: row.source,
            suggestedValue: row.suggestedValue,
            confidence: row.confidence,
            sourceSentence: row.sourceSentence,
            updatedAt: row.updatedAt,
          },
        });
    }
  }

  return loadOnboarding(db, businessId);
}

export async function addDocument(doc, db = defaultDb, businessId = BUSINESS_ID) {
  await db
    .insert(documents)
    .values({
      id: doc.id,
      businessId,
      kind: doc.kind ?? "file",
      name: doc.name,
      source: doc.source ?? doc.name,
      text: doc.text ?? null,
      chars: doc.chars ?? (doc.text ? doc.text.length : null),
    })
    .onConflictDoNothing();

  return loadOnboarding(db, businessId);
}

export async function removeDocument(id, db = defaultDb, businessId = BUSINESS_ID) {
  await db
    .delete(documents)
    .where(and(eq(documents.businessId, businessId), eq(documents.id, id)));

  return loadOnboarding(db, businessId);
}

/** Used by tests, and by anyone who wants to start the wizard over. */
export async function resetOnboarding(db = defaultDb, businessId = BUSINESS_ID) {
  await db.delete(businessFields).where(eq(businessFields.businessId, businessId));
  await db.delete(documents).where(eq(documents.businessId, businessId));
  await db
    .update(businesses)
    .set({
      tradeId: null,
      websiteUrl: null,
      calendarProvider: null,
      calendarConnected: false,
    })
    .where(eq(businesses.id, businessId));

  return loadOnboarding(db, businessId);
}
