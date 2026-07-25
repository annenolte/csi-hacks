import "server-only";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

/*
  One file, opened once per process. Next's dev server reloads modules on every
  edit, so the handle is cached on globalThis — otherwise each reload opens
  another connection and they eventually collide on the write lock.
*/

const FILE = process.env.DATABASE_FILE ?? "call-slip.db";

/* Phase 2 has no auth. One business, one id, and a business_id column everywhere. */
export const BUSINESS_ID = "biz_local";

const DDL = `
CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  trade_id TEXT,
  calendar_provider TEXT,
  calendar_connected INTEGER NOT NULL DEFAULT 0,
  website_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS business_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  suggested_value TEXT,
  confidence INTEGER,
  source_sentence TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS business_fields_business_key
  ON business_fields (business_id, key);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  text TEXT,
  chars INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS documents_business ON documents (business_id);

CREATE TABLE IF NOT EXISTS facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence INTEGER,
  source_sentence TEXT,
  document_name TEXT,
  conflicted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS facts_business_key ON facts (business_id, key);

CREATE TABLE IF NOT EXISTS prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_key TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  amount REAL,
  tier TEXT NOT NULL,
  reason TEXT,
  confidence INTEGER,
  source_sentence TEXT,
  document_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS prices_business ON prices (business_id);
`;

/** Opens the file, applies the DDL, and guarantees the single business row exists. */
export function createDb(file = FILE) {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(DDL);
  sqlite
    .prepare("INSERT OR IGNORE INTO businesses (id) VALUES (?)")
    .run(BUSINESS_ID);

  return drizzle(sqlite, { schema });
}

const globalForDb = globalThis;

export const db = globalForDb.__callSlipDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__callSlipDb = db;

export { schema };
