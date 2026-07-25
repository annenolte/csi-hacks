import { describe, expect, it } from "vitest";
import { PLUMBING, PRICE_TIERS } from "@/lib/trades";
import { buildCorpus } from "@/lib/synthesis/corpus";
import { buildReport } from "@/lib/synthesis/report";
import { isMultiValue, mergeMultiValues } from "@/lib/fieldSchema";

const need = (key) => PLUMBING.needs.find((n) => n.key === key);

const doc = (name, text) => ({ id: name, name, text });

describe("buildCorpus", () => {
  it("puts every document in one prompt, labelled for citation", () => {
    const corpus = buildCorpus([
      doc("prices.txt", "Drain clearing $149."),
      doc("faq.md", "We are open Monday to Friday."),
    ]);

    expect(corpus.isEmpty).toBe(false);
    expect(corpus.documents).toHaveLength(2);
    expect(corpus.text).toContain('<document name="prices.txt">');
    expect(corpus.text).toContain('<document name="faq.md">');
    expect(corpus.text).toContain("Drain clearing $149.");
    expect(corpus.truncated).toBe(false);
  });

  it("skips documents with no text rather than emitting empty blocks", () => {
    const corpus = buildCorpus([
      doc("empty.txt", ""),
      doc("blank.txt", "   "),
      { id: "url", name: "site", text: null },
      doc("real.txt", "Something."),
    ]);

    expect(corpus.documents.map((d) => d.name)).toEqual(["real.txt"]);
  });

  it("reports an empty corpus rather than pretending it read something", () => {
    expect(buildCorpus([]).isEmpty).toBe(true);
    expect(buildCorpus(undefined).isEmpty).toBe(true);
  });

  it("says so out loud when it has to drop a document", () => {
    /* Silently truncating would read as "we checked everything" when we didn't. */
    const corpus = buildCorpus([doc("a.txt", "x".repeat(300)), doc("b.txt", "y".repeat(300))], {
      maxChars: 400,
    });

    expect(corpus.truncated).toBe(true);
    expect(corpus.skipped).toEqual(["b.txt"]);
    expect(corpus.documents.map((d) => d.name)).toEqual(["a.txt"]);
  });
});

describe("list fields are not disagreements", () => {
  /*
    A corpus that names each service in its own sentence has stated one list, not
    five competing answers. Before this was folded, extracting a price list made
    every service look like a conflict for the owner to resolve.
  */
  it("knows which needs hold a list", () => {
    expect(isMultiValue(need("services_offered"))).toBe(true);
    expect(isMultiValue(need("service_area"))).toBe(true);
    expect(isMultiValue(need("business_name"))).toBe(false);
    expect(isMultiValue(need("emergency_policy"))).toBe(false);
    expect(isMultiValue(need("hours"))).toBe(false);
  });

  it("folds partial lists into one, without duplicates", () => {
    const merged = mergeMultiValues([
      { value: ["drain_clear"], confidence: 0.9, source: "Drain clearing $149.", document: "a" },
      { value: ["repipe"], confidence: 0.7, source: "Repipe from $8,500.", document: "a" },
      { value: ["drain_clear", "sewer_line"], confidence: 0.8, source: "Also sewer.", document: "b" },
    ]);

    expect(merged.value).toEqual(["drain_clear", "repipe", "sewer_line"]);
  });

  it("takes the weakest confidence — a list is only as good as its worst member", () => {
    const merged = mergeMultiValues([
      { value: ["a"], confidence: 0.9, source: "s1", document: "d" },
      { value: ["b"], confidence: 0.4, source: "s2", document: "d" },
    ]);
    expect(merged.confidence).toBe(0.4);
  });

  it("keeps every contributing sentence, not just one", () => {
    const merged = mergeMultiValues([
      { value: ["a"], confidence: 0.9, source: "s1", document: "d" },
      { value: ["b"], confidence: 0.4, source: "s2", document: "d" },
    ]);
    expect(merged.sources).toEqual(["s1", "s2"]);
    expect(merged.source).toBe("s1"); // the best-supported one leads
  });
});

describe("buildReport", () => {
  const fields = {
    business_name: [
      { value: "Nolte & Sons", confidence: 0.9, source: "Nolte & Sons Plumbing", document: "faq.md" },
    ],
    phone: [
      { value: "(503) 555-0142", confidence: 0.95, source: "Call (503) 555-0142.", document: "faq.md" },
      { value: "(503) 555-0199", confidence: 0.8, source: "Call (503) 555-0199.", document: "old.txt" },
    ],
  };

  it("keeps both sides of a disagreement instead of picking", () => {
    const report = buildReport({ trade: PLUMBING, fields, prices: [] });

    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].need.key).toBe("phone");
    /* Both values survive, and both are flagged. */
    const phones = report.facts.filter((f) => f.need.key === "phone");
    expect(phones).toHaveLength(2);
    expect(phones.every((f) => f.conflicted)).toBe(true);
  });

  it("does not flag a single answer as conflicted", () => {
    const report = buildReport({ trade: PLUMBING, fields, prices: [] });
    const name = report.facts.find((f) => f.need.key === "business_name");
    expect(name.conflicted).toBe(false);
  });

  it("carries the citation through to the fact", () => {
    const report = buildReport({ trade: PLUMBING, fields, prices: [] });
    const name = report.facts.find((f) => f.need.key === "business_name");
    expect(name.source).toBe("Nolte & Sons Plumbing");
    expect(name.document).toBe("faq.md");
  });

  it("makes a gap of every need nothing answered", () => {
    const report = buildReport({ trade: PLUMBING, fields, prices: [] });
    const gapKeys = report.gaps.map((n) => n.key);

    expect(gapKeys).not.toContain("business_name"); // the corpus stated it
    expect(gapKeys).not.toContain("phone");
    expect(gapKeys).toContain("hours"); // nothing did
    expect(gapKeys).toContain("service_area");
  });

  it("does not ask about something the owner already typed", () => {
    const report = buildReport({
      trade: PLUMBING,
      fields,
      prices: [],
      answers: { service_area: ["Portland"] },
    });

    expect(report.gaps.map((n) => n.key)).not.toContain("service_area");
  });

  it("treats an empty answer as still missing", () => {
    const report = buildReport({
      trade: PLUMBING,
      fields,
      prices: [],
      answers: { service_area: [], hours: {} },
    });

    const gapKeys = report.gaps.map((n) => n.key);
    expect(gapKeys).toContain("service_area");
    expect(gapKeys).toContain("hours");
  });

  it("gives every gap the question the interview will ask", () => {
    const report = buildReport({ trade: PLUMBING, fields, prices: [] });
    for (const need of report.gaps) {
      expect(need.question, need.key).toBeTruthy();
    }
  });

  it("classifies prices in code, including the sewer override", () => {
    const report = buildReport({
      trade: PLUMBING,
      fields: {},
      prices: [
        { serviceKey: "drain_clear", rawText: "$149", confidence: 0.9, source: "s", document: "d" },
        { serviceKey: "sewer_line", rawText: "flat $4,000", confidence: 0.99, source: "s", document: "d" },
        { serviceKey: "water_heater", rawText: "starting at $900", confidence: 0.9, source: "s", document: "d" },
      ],
    });

    expect(report.prices.map((p) => p.tier)).toEqual([
      PRICE_TIERS.QUOTABLE,
      PRICE_TIERS.HUMAN_REQUIRED,
      PRICE_TIERS.RANGE_ONLY,
    ]);
    /* The citation survives classification. */
    expect(report.prices[0].source).toBe("s");
  });

  it("counts what it found", () => {
    const report = buildReport({
      trade: PLUMBING,
      fields,
      prices: [{ serviceKey: "drain_clear", rawText: "$149", confidence: 0.9 }],
    });

    expect(report.counts.facts).toBe(3); // name + two conflicting phones
    expect(report.counts.conflicts).toBe(1);
    expect(report.counts.prices).toBe(1);
    expect(report.counts.gaps).toBe(report.gaps.length);
  });

  it("handles a corpus that stated nothing at all", () => {
    const report = buildReport({ trade: PLUMBING, fields: {}, prices: [] });
    expect(report.facts).toEqual([]);
    expect(report.conflicts).toEqual([]);
    expect(report.gaps).toHaveLength(PLUMBING.needs.length);
  });
});
