import { beforeEach, describe, expect, it, vi } from "vitest";

/* The repository imports "server-only", which throws outside a server bundle. */
vi.mock("server-only", () => ({}));

const { createDb, BUSINESS_ID } = await import("@/lib/db/index");
const {
  loadOnboarding,
  saveOnboarding,
  addDocument,
  removeDocument,
  resetOnboarding,
} = await import("@/lib/db/onboarding");

/*
  Runs against a real SQLite database in memory, not a mock — the point of this
  phase is that the round trip actually works, and a mock would pass whether the
  schema was right or not.
*/

let db;
beforeEach(() => {
  db = createDb(":memory:");
});

const HOURS = {
  mon: { open: "08:00", close: "17:00" },
  sat: { open: "09:00", close: "13:00" },
};

describe("onboarding round trip", () => {
  it("starts empty", async () => {
    const state = await loadOnboarding(db);
    expect(state.tradeId).toBeNull();
    expect(state.answers).toEqual({});
    expect(state.documents).toEqual([]);
    expect(state.calendar.connected).toBe(false);
  });

  it("survives a reload with every value type intact", async () => {
    await saveOnboarding(
      {
        tradeId: "plumbing",
        answers: {
          business_name: "Nolte & Sons",
          service_area: ["Portland", "Gresham"],
          hours: HOURS,
          services_offered: ["drain_clear", "sewer_line"],
        },
      },
      db,
    );

    /* A fresh read, as a restarted server would do. */
    const state = await loadOnboarding(db);
    expect(state.tradeId).toBe("plumbing");
    expect(state.answers.business_name).toBe("Nolte & Sons");
    expect(state.answers.service_area).toEqual(["Portland", "Gresham"]);
    expect(state.answers.hours).toEqual(HOURS);
    expect(state.answers.services_offered).toEqual(["drain_clear", "sewer_line"]);
  });

  it("keeps provenance so the website badge survives a refresh", async () => {
    await saveOnboarding(
      {
        answers: { phone: "(503) 555-0142" },
        fieldSource: { phone: "website" },
        suggestions: {
          phone: {
            value: "(503) 555-0142",
            confidence: 0.9,
            source: "Call us on (503) 555-0142 today.",
          },
        },
      },
      db,
    );

    const state = await loadOnboarding(db);
    expect(state.fieldSource.phone).toBe("website");
    expect(state.suggestions.phone.confidence).toBeCloseTo(0.9, 5);
    expect(state.suggestions.phone.source).toContain("555-0142");
  });

  it("keeps the website's version after the owner types over it", async () => {
    await saveOnboarding(
      {
        answers: { business_name: "Nolte Plumbing Ltd" },
        fieldSource: { business_name: "manual" },
        suggestions: {
          business_name: {
            value: "Nolte & Sons",
            confidence: 0.6,
            source: "Page title: Nolte & Sons",
          },
        },
      },
      db,
    );

    const state = await loadOnboarding(db);
    /* What they typed is the answer... */
    expect(state.answers.business_name).toBe("Nolte Plumbing Ltd");
    expect(state.fieldSource.business_name).toBe("manual");
    /* ...but the site's version is still offerable. */
    expect(state.suggestions.business_name.value).toBe("Nolte & Sons");
  });

  it("updates a field in place rather than duplicating it", async () => {
    await saveOnboarding({ answers: { business_name: "First" } }, db);
    await saveOnboarding({ answers: { business_name: "Second" } }, db);

    const state = await loadOnboarding(db);
    expect(state.answers.business_name).toBe("Second");
    expect(Object.keys(state.answers)).toHaveLength(1);
  });

  it("treats an emptied field as removed, not as an empty string", async () => {
    await saveOnboarding({ answers: { business_name: "Nolte" } }, db);
    await saveOnboarding({ answers: { business_name: "" } }, db);

    const state = await loadOnboarding(db);
    expect(state.answers.business_name).toBeUndefined();
  });

  it("only writes the keys present in the patch", async () => {
    await saveOnboarding({ tradeId: "plumbing", answers: { phone: "1" } }, db);
    await saveOnboarding({ calendar: { provider: "Google Calendar", connected: true } }, db);

    const state = await loadOnboarding(db);
    expect(state.tradeId).toBe("plumbing");
    expect(state.answers.phone).toBe("1");
    expect(state.calendar).toMatchObject({ provider: "Google Calendar", connected: true });
  });

  it("drops the answers when the trade changes", async () => {
    await saveOnboarding({ tradeId: "plumbing", answers: { phone: "1" } }, db);
    const state = await saveOnboarding({ tradeId: "electrical", clearFields: true }, db);

    expect(state.tradeId).toBe("electrical");
    expect(state.answers).toEqual({});
  });
});

describe("documents", () => {
  it("stores and reloads file text", async () => {
    await addDocument(
      { id: "doc1", kind: "file", name: "prices.txt", source: "prices.txt", text: "Drain $149", chars: 10 },
      db,
    );

    const state = await loadOnboarding(db);
    expect(state.documents).toHaveLength(1);
    expect(state.documents[0]).toMatchObject({ name: "prices.txt", text: "Drain $149" });
  });

  it("ignores a re-added document rather than duplicating it", async () => {
    const doc = { id: "doc1", kind: "file", name: "a.txt", source: "a.txt", text: "x" };
    await addDocument(doc, db);
    const state = await addDocument(doc, db);
    expect(state.documents).toHaveLength(1);
  });

  it("removes by id", async () => {
    await addDocument({ id: "a", kind: "file", name: "a.txt", source: "a.txt", text: "1" }, db);
    await addDocument({ id: "b", kind: "file", name: "b.txt", source: "b.txt", text: "2" }, db);

    const state = await removeDocument("a", db);
    expect(state.documents.map((d) => d.id)).toEqual(["b"]);
  });

  it("derives chars when the caller omits them", async () => {
    await addDocument({ id: "a", kind: "file", name: "a.txt", source: "a.txt", text: "12345" }, db);
    const state = await loadOnboarding(db);
    expect(state.documents[0].chars).toBe(5);
  });
});

describe("scoping", () => {
  it("scopes everything by business id, so accounts are a migration not a rewrite", async () => {
    await saveOnboarding({ tradeId: "plumbing", answers: { phone: "1" } }, db);
    await addDocument({ id: "d", kind: "file", name: "a.txt", source: "a.txt", text: "x" }, db);

    /* A second business sees none of it. */
    const other = await loadOnboarding(db, "biz_other");
    expect(other.tradeId).toBeNull();
    expect(other.answers).toEqual({});
    expect(other.documents).toEqual([]);

    const ours = await loadOnboarding(db, BUSINESS_ID);
    expect(ours.answers.phone).toBe("1");
  });
});

describe("reset", () => {
  it("clears fields, documents and the trade", async () => {
    await saveOnboarding(
      { tradeId: "plumbing", answers: { phone: "1" }, calendar: { provider: "Google Calendar", connected: true } },
      db,
    );
    await addDocument({ id: "d", kind: "file", name: "a.txt", source: "a.txt", text: "x" }, db);

    const state = await resetOnboarding(db);
    expect(state.tradeId).toBeNull();
    expect(state.answers).toEqual({});
    expect(state.documents).toEqual([]);
    expect(state.calendar.connected).toBe(false);
  });
});
