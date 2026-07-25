import { describe, expect, it } from "vitest";
import { PLUMBING, PRICE_TIERS } from "@/lib/trades";
import {
  amountsIn,
  classifyPrice,
  classifyPrices,
  isBareAmount,
} from "@/lib/synthesis/classify";

const tier = (price) => classifyPrice(price, PLUMBING).tier;

const priced = (serviceKey, rawText, confidence = 0.95) => ({
  serviceKey,
  rawText,
  confidence,
});

describe("the sewer-line override", () => {
  /*
    This is the case PLAN.md calls out by name. A document that states a flat
    price for sewer work must not move it out of human_required — that is the
    whole reason classification lives in code rather than in the prompt.
  */
  it("ignores a document that claims a flat price for sewer work", () => {
    expect(tier(priced("sewer_line", "our sewer work is a flat $4,000"))).toBe(
      PRICE_TIERS.HUMAN_REQUIRED,
    );
  });

  it("ignores a bare, maximally confident number for sewer work", () => {
    expect(tier(priced("sewer_line", "$4000", 1))).toBe(PRICE_TIERS.HUMAN_REQUIRED);
  });

  it("applies the same override to repipes", () => {
    expect(tier(priced("repipe", "$8,500", 1))).toBe(PRICE_TIERS.HUMAN_REQUIRED);
  });

  it("says why, so the reason survives into the UI", () => {
    const { reason } = classifyPrice(priced("sewer_line", "$4,000"), PLUMBING);
    expect(reason).toMatch(/always quoted by a person/i);
  });

  it("covers every service the trade lists as always-human", () => {
    for (const key of PLUMBING.alwaysHuman) {
      expect(tier(priced(key, "$1,000", 1)), key).toBe(PRICE_TIERS.HUMAN_REQUIRED);
    }
  });
});

describe("quotable", () => {
  it("takes a single bare amount", () => {
    for (const text of ["$149", "149", "$1,499.00", "$149.50"]) {
      expect(tier(priced("drain_clear", text)), text).toBe(PRICE_TIERS.QUOTABLE);
    }
  });

  it("tolerates harmless words around the number", () => {
    for (const text of ["flat fee of $149", "$149 flat", "the price is $149"]) {
      expect(tier(priced("drain_clear", text)), text).toBe(PRICE_TIERS.QUOTABLE);
    }
  });

  it("returns the parsed amount", () => {
    const { amount } = classifyPrice(priced("drain_clear", "$1,499.00"), PLUMBING);
    expect(amount).toBe(1499);
  });
});

describe("range_only", () => {
  it("catches the wordings PLAN.md names", () => {
    for (const text of ["starting at $149", "depends on the job", "$149, depending on access"]) {
      expect(tier(priced("drain_clear", text)), text).toBe(PRICE_TIERS.RANGE_ONLY);
    }
  });

  it("catches other open-ended phrasings", () => {
    for (const text of [
      "from $149",
      "up to $400",
      "$149 and up",
      "around $200",
      "approx $200",
      "prices vary",
      "call for a quote",
      "minimum $99",
      "$149+",
    ]) {
      expect(tier(priced("drain_clear", text)), text).toBe(PRICE_TIERS.RANGE_ONLY);
    }
  });

  it("treats a numeric range as a range", () => {
    for (const text of ["$150-$300", "$150 to $300", "between $150 and $300"]) {
      expect(tier(priced("drain_clear", text)), text).toBe(PRICE_TIERS.RANGE_ONLY);
    }
  });

  it("treats a rate as a range, not a job price", () => {
    /* "$95/hour" read out as "$95" is an argument on the doorstep. */
    for (const text of ["$95 per hour", "$95/hr", "$95 hourly", "$12 per foot"]) {
      expect(tier(priced("drain_clear", text)), text).toBe(PRICE_TIERS.RANGE_ONLY);
    }
  });
});

describe("the confidence floor", () => {
  it("sends anything under the floor to human_required", () => {
    expect(tier(priced("drain_clear", "$149", 0.69))).toBe(PRICE_TIERS.HUMAN_REQUIRED);
  });

  it("allows exactly the floor", () => {
    expect(tier(priced("drain_clear", "$149", PLUMBING.confidenceFloor))).toBe(
      PRICE_TIERS.QUOTABLE,
    );
  });

  it("treats a missing or malformed confidence as untrusted", () => {
    for (const c of [undefined, null, NaN, "high"]) {
      expect(tier({ serviceKey: "drain_clear", rawText: "$149", confidence: c })).toBe(
        PRICE_TIERS.HUMAN_REQUIRED,
      );
    }
  });

  it("beats a bare number — low confidence is not overridden by good wording", () => {
    expect(tier(priced("drain_clear", "$149", 0.2))).toBe(PRICE_TIERS.HUMAN_REQUIRED);
  });
});

describe("defaulting", () => {
  it("fails towards a human on wording it doesn't recognise", () => {
    for (const text of ["two hundred quid", "see table 3", "TBC", ""]) {
      expect(tier(priced("drain_clear", text)), JSON.stringify(text)).toBe(
        PRICE_TIERS.HUMAN_REQUIRED,
      );
    }
  });

  it("survives junk input without throwing", () => {
    expect(() => classifyPrice(null, PLUMBING)).not.toThrow();
    expect(() => classifyPrice({}, PLUMBING)).not.toThrow();
    expect(tier({})).toBe(PRICE_TIERS.HUMAN_REQUIRED);
  });
});

describe("classifyPrices", () => {
  it("classifies a batch and keeps the original fields", () => {
    const out = classifyPrices(
      [
        priced("drain_clear", "$149"),
        priced("sewer_line", "flat $4,000"),
        priced("water_heater", "starting at $900"),
      ],
      PLUMBING,
    );

    expect(out.map((p) => p.tier)).toEqual([
      PRICE_TIERS.QUOTABLE,
      PRICE_TIERS.HUMAN_REQUIRED,
      PRICE_TIERS.RANGE_ONLY,
    ]);
    expect(out[0].serviceKey).toBe("drain_clear");
    expect(out[0].rawText).toBe("$149");
  });

  it("handles an empty extraction", () => {
    expect(classifyPrices(undefined, PLUMBING)).toEqual([]);
    expect(classifyPrices([], PLUMBING)).toEqual([]);
  });
});

describe("helpers", () => {
  it("pulls amounts out of text", () => {
    expect(amountsIn("$150-$300")).toEqual([150, 300]);
    expect(amountsIn("$1,499.00")).toEqual([1499]);
    expect(amountsIn("no numbers here")).toEqual([]);
  });

  it("knows a bare amount from a qualified one", () => {
    expect(isBareAmount("$149")).toBe(true);
    expect(isBareAmount("from $149")).toBe(false);
    expect(isBareAmount("$149 per hour")).toBe(false);
    expect(isBareAmount("$150-$300")).toBe(false);
  });
});
