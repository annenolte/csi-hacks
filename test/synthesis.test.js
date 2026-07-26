import { describe, expect, it } from "vitest";
import { PLUMBING, PRICE_TIERS } from "@/lib/trades";
import { buildCorpus } from "@/lib/synthesis/corpus";
import { buildReport } from "@/lib/synthesis/report";
import { isMultiValue, mergeMultiValues, sanitiseAnswer } from "@/lib/fieldSchema";

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

/*
  Telling someone their documents say two different things, and then showing them
  the same answer twice, makes the extraction look broken and costs them a
  question they had no reason to be asked. Agreement is the common case — a price
  list and an FAQ that both name the business — so it has to survive the round
  trip through two documents without turning into an argument.
*/
describe("a restated answer is not a disagreement", () => {
  const stated = (value, confidence, document) => ({
    value,
    confidence,
    source: `stated in ${document}`,
    document,
  });

  const reportFor = (values) =>
    buildReport({ trade: PLUMBING, fields: { business_name: values }, prices: [] });

  it("collapses two documents that say the same thing", () => {
    const report = reportFor([
      stated("Nolte & Sons", 0.8, "faq.md"),
      stated("Nolte & Sons", 0.95, "prices.txt"),
    ]);

    expect(report.conflicts).toEqual([]);
    expect(report.facts).toHaveLength(1);
    expect(report.facts[0].conflicted).toBe(false);
    /* The better-supported statement is the one worth quoting. */
    expect(report.facts[0].document).toBe("prices.txt");
  });

  it("ignores the differences documents are allowed to have", () => {
    for (const [a, b] of [
      ["Nolte & Sons", "  Nolte & Sons  "],
      ["Nolte & Sons", "nolte & sons"],
      ["Nolte & Sons", "Nolte & Sons."],
      ["Nolte  &   Sons", "Nolte & Sons"],
    ]) {
      const report = reportFor([stated(a, 0.9, "a.md"), stated(b, 0.8, "b.md")]);
      expect(report.conflicts, `${a} vs ${b}`).toEqual([]);
    }
  });

  it("still keeps a real difference in wording", () => {
    /* The qualifier is the whole answer here — these are not the same hours. */
    const report = reportFor([
      stated("Nolte & Sons", 0.9, "a.md"),
      stated("Nolte & Sons Plumbing", 0.9, "b.md"),
    ]);

    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].values).toHaveLength(2);
  });

  /*
    The mirror of "list fields can't conflict". A handbook that describes the
    business over a page and a price list that describes it in a line have not
    contradicted each other — one said more, and "which of these is right?" is a
    question with no answer.
  */
  it("keeps the fuller description rather than calling prose a disagreement", () => {
    const report = buildReport({
      trade: PLUMBING,
      prices: [],
      fields: {
        business_notes: [
          stated("Family-run residential plumbing business.", 0.9, "prices.md"),
          stated(
            "Family-run residential plumbing business since 1994. No gas fitting; commercial goes to Dave.",
            0.88,
            "handbook.txt",
          ),
        ],
      },
    });

    expect(report.conflicts).toEqual([]);
    expect(report.facts).toHaveLength(1);
    expect(report.facts[0].value).toContain("No gas fitting");
    /* Both sentences still stand behind it. */
    expect(report.facts[0].sources).toHaveLength(2);
  });

  it("still prefers a clearly better-supported description", () => {
    const report = buildReport({
      trade: PLUMBING,
      prices: [],
      fields: {
        business_notes: [
          stated("Residential plumbing, no gas work.", 0.95, "handbook.txt"),
          stated("A much longer but barely-supported ramble about the business.", 0.4, "old.txt"),
        ],
      },
    });

    expect(report.facts[0].value).toBe("Residential plumbing, no gas work.");
  });

  it("reads a list as a set, and an object by its parts", () => {
    const area = (value, doc) => ({ value, confidence: 0.9, source: "s", document: doc });
    const sameList = buildReport({
      trade: PLUMBING,
      prices: [],
      fields: {
        service_area: [
          area(["Portland", "Beaverton"], "a.md"),
          area(["beaverton", "portland"], "b.md"),
        ],
      },
    });
    expect(sameList.conflicts).toEqual([]);

    const sameHours = buildReport({
      trade: PLUMBING,
      prices: [],
      fields: {
        hours: [
          area({ mon: { open: "08:00", close: "17:00" } }, "a.md"),
          area({ mon: { close: "17:00", open: "08:00" } }, "b.md"),
        ],
      },
    });
    expect(sameHours.conflicts).toEqual([]);

    const differentHours = buildReport({
      trade: PLUMBING,
      prices: [],
      fields: {
        hours: [
          area({ mon: { open: "08:00", close: "17:00" } }, "a.md"),
          area({ mon: { open: "07:00", close: "18:00" } }, "b.md"),
        ],
      },
    });
    expect(differentHours.conflicts).toHaveLength(1);
  });
});

/*
  Answers arrive as JSON over HTTP. The UI can't produce a bad one — a choice
  renders as buttons — but "the client wouldn't send that" is not a check, and
  everything downstream (the dashboard, the next turn's prompt, the brief a voice
  agent reads aloud) trusts whatever gets stored.
*/
describe("sanitiseAnswer", () => {
  const needFor = (key) => PLUMBING.needs.find((n) => n.key === key);

  it("rejects a value that isn't one of a choice's options", () => {
    const need = needFor("emergency_policy");
    expect(sanitiseAnswer(PLUMBING, need, "(503) 555-0199")).toBeNull();
    expect(sanitiseAnswer(PLUMBING, need, "yes please")).toBeNull();
    expect(sanitiseAnswer(PLUMBING, need, "24_7")).toBe("24_7");
  });

  it("drops unknown entries from a multi-choice rather than storing them", () => {
    const need = needFor("services_offered");
    expect(
      sanitiseAnswer(PLUMBING, need, ["drain_clear", "time_travel", "repipe"]),
    ).toEqual(["drain_clear", "repipe"]);
    expect(sanitiseAnswer(PLUMBING, need, ["time_travel"])).toBeNull();
    expect(sanitiseAnswer(PLUMBING, need, "drain_clear")).toBeNull();
  });

  it("keeps only real days and well-formed times in hours", () => {
    const need = needFor("hours");
    expect(
      sanitiseAnswer(PLUMBING, need, {
        mon: { open: "08:00", close: "17:00" },
        funday: { open: "08:00", close: "17:00" },
        tue: { open: "25:00", close: "17:00" },
        wed: { open: "8am", close: "5pm" },
      }),
    ).toEqual({ mon: { open: "08:00", close: "17:00" } });

    expect(sanitiseAnswer(PLUMBING, need, { tue: { open: "25:00", close: "9" } })).toBeNull();
    expect(sanitiseAnswer(PLUMBING, need, "Mon to Fri")).toBeNull();
  });

  it("cleans a chip list and refuses a bare string", () => {
    const need = needFor("service_area");
    expect(sanitiseAnswer(PLUMBING, need, [" Portland ", "portland", "", 7, "Tigard"])).toEqual(
      ["Portland", "Tigard"],
    );
    expect(sanitiseAnswer(PLUMBING, need, "Portland")).toBeNull();
    expect(sanitiseAnswer(PLUMBING, need, [])).toBeNull();
  });

  it("trims text and treats whitespace-only as unanswered", () => {
    const need = needFor("business_name");
    expect(sanitiseAnswer(PLUMBING, need, "  Savior Plumbing  ")).toBe("Savior Plumbing");
    expect(sanitiseAnswer(PLUMBING, need, "   ")).toBeNull();
    expect(sanitiseAnswer(PLUMBING, need, { evil: true })).toBeNull();
    expect(sanitiseAnswer(PLUMBING, need, null)).toBeNull();
  });
});
