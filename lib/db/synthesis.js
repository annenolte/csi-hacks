import "server-only";

import { eq } from "drizzle-orm";
import { db as defaultDb, BUSINESS_ID } from "./index";
import { facts, prices } from "./schema";

/*
  Synthesis results are a snapshot of what the corpus said at the moment it was
  read. A re-run replaces them wholesale rather than merging: if a document was
  removed, the fact it supported has to disappear with it, and a merge would
  quietly keep citing a sentence that no longer exists anywhere.
*/

const toStored = (c) =>
  Number.isFinite(c) ? Math.max(0, Math.min(100, Math.round(c * 100))) : null;
const fromStored = (c) => (typeof c === "number" ? c / 100 : null);

function parseJson(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function saveSynthesis(
  { facts: factList = [], prices: priceList = [] },
  db = defaultDb,
  businessId = BUSINESS_ID,
) {
  await db.delete(facts).where(eq(facts.businessId, businessId));
  await db.delete(prices).where(eq(prices.businessId, businessId));

  if (factList.length > 0) {
    await db.insert(facts).values(
      factList.map((fact) => ({
        businessId,
        key: fact.need.key,
        value: JSON.stringify(fact.value),
        confidence: toStored(fact.confidence),
        sourceSentence: fact.source ?? null,
        documentName: fact.document ?? null,
        conflicted: Boolean(fact.conflicted),
      })),
    );
  }

  if (priceList.length > 0) {
    await db.insert(prices).values(
      priceList.map((price) => ({
        businessId,
        serviceKey: price.serviceKey,
        rawText: price.rawText,
        amount: price.amount ?? null,
        tier: price.tier,
        reason: price.reason ?? null,
        confidence: toStored(price.confidence),
        sourceSentence: price.source ?? null,
        documentName: price.document ?? null,
      })),
    );
  }

  return loadSynthesis(db, businessId);
}

export async function loadSynthesis(db = defaultDb, businessId = BUSINESS_ID) {
  const factRows = await db.select().from(facts).where(eq(facts.businessId, businessId));
  const priceRows = await db.select().from(prices).where(eq(prices.businessId, businessId));

  return {
    facts: factRows.map((row) => ({
      key: row.key,
      value: parseJson(row.value),
      confidence: fromStored(row.confidence),
      source: row.sourceSentence,
      document: row.documentName,
      conflicted: Boolean(row.conflicted),
    })),
    prices: priceRows.map((row) => ({
      serviceKey: row.serviceKey,
      rawText: row.rawText,
      amount: row.amount,
      tier: row.tier,
      reason: row.reason,
      confidence: fromStored(row.confidence),
      source: row.sourceSentence,
      document: row.documentName,
    })),
  };
}

export async function clearSynthesis(db = defaultDb, businessId = BUSINESS_ID) {
  await db.delete(facts).where(eq(facts.businessId, businessId));
  await db.delete(prices).where(eq(prices.businessId, businessId));
}
