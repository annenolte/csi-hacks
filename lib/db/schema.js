import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/*
  Phase 2: one SQLite file, no auth, one hardcoded business.

  `business_id` is on every table anyway. Adding real accounts later then means a
  migration rather than a rewrite — that is the whole reason it's here while there
  is only ever one row in `businesses`.
*/

export const businesses = sqliteTable("businesses", {
  id: text("id").primaryKey(),
  tradeId: text("trade_id"),

  /* Calendar is a stub until Phase 4; recording intent is enough for now. */
  calendarProvider: text("calendar_provider"),
  calendarConnected: integer("calendar_connected", { mode: "boolean" })
    .notNull()
    .default(false),

  /* The last page we read, so the review screen can say where things came from. */
  websiteUrl: text("website_url"),

  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/*
  One row per answered need, not a JSON blob on `businesses`.

  This is the one place Phase 2 adds a table PLAN.md doesn't name, and the reason
  is provenance: every value carries where it came from, how confident we were,
  and the sentence it was read from. Phase 3 returns exactly this shape per field
  (and may return two conflicting values for one key rather than picking), so a
  row-per-field table is what it lands in. A JSON column would have to be torn out
  again in one phase's time.

  `key` is a need key from lib/trades.js. Deliberately not a foreign key or an
  enum — the schema there is the source of truth, and the database should not need
  a migration every time a need is added.
*/
export const businessFields = sqliteTable(
  "business_fields",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),

    key: text("key").notNull(),
    /* JSON, because a value may be a string, a list of towns, or an hours object. */
    value: text("value").notNull(),

    /* "manual" or "website" — what drives the precedence rule in useOnboarding. */
    source: text("source").notNull().default("manual"),

    /*
      What the website proposed, kept even after the owner types over it — that is
      what lets the form still offer "use that instead" after a refresh. Equal to
      `value` while source is "website". confidence and the quoted sentence describe
      this, not the typed value.
    */
    suggestedValue: text("suggested_value"),
    confidence: integer("confidence"), // 0-100, null when typed by hand
    sourceSentence: text("source_sentence"),

    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("business_fields_business_key").on(table.businessId, table.key),
  ],
);

/*
  Phase 3 output. Separate from `business_fields` on purpose: that table is what
  the owner has confirmed, this one is what the documents claim. A fact stays a
  proposal until the owner accepts it, and two rows may share a key when two
  documents disagree — which is why there is no unique index here.
*/
export const facts = sqliteTable(
  "facts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),

    key: text("key").notNull(),
    value: text("value").notNull(), // JSON
    confidence: integer("confidence"), // 0-100
    sourceSentence: text("source_sentence"),
    documentName: text("document_name"),
    conflicted: integer("conflicted", { mode: "boolean" }).notNull().default(false),

    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("facts_business_key").on(table.businessId, table.key)],
);

/*
  `tier` is written by lib/synthesis/classify.js, never by the model. `rawText`
  keeps the qualifying words ("starting at", "per hour") because those are what
  the classifier reads — normalising them away here would silently promote a rate
  into a flat quote.
*/
export const prices = sqliteTable(
  "prices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),

    serviceKey: text("service_key").notNull(),
    rawText: text("raw_text").notNull(),
    amount: real("amount"), // only set when the tier is quotable
    tier: text("tier").notNull(), // quotable | range_only | human_required
    reason: text("reason"),
    confidence: integer("confidence"),
    sourceSentence: text("source_sentence"),
    documentName: text("document_name"),

    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("prices_business").on(table.businessId)],
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),

    kind: text("kind").notNull(), // "file" | "url"
    name: text("name").notNull(),
    source: text("source").notNull(),
    text: text("text"),
    chars: integer("chars"),

    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("documents_business").on(table.businessId)],
);
