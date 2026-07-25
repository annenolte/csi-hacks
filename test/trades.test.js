import { describe, expect, it } from "vitest";
import { FIELD_TYPES, PLUMBING, SCRAPE, TRADES, optionsForNeed } from "@/lib/trades";

/*
  These guard the invariant the whole product rests on: the wizard, the call slip,
  Phase 3 extraction and the gap interview all read `needs` generically. A need that
  is missing a piece would fail silently in the UI, so it fails loudly here instead.
*/

const KNOWN_TYPES = new Set(Object.values(FIELD_TYPES));

describe("trade definitions", () => {
  it("gives every need what all four consumers require", () => {
    for (const need of PLUMBING.needs) {
      expect(KNOWN_TYPES, `${need.key} type`).toContain(need.type);
      // label for the form, slipLabel for the rail, question for the gap interview,
      // extract for Phase 3 synthesis.
      expect(need.label, `${need.key} label`).toBeTruthy();
      expect(need.question, `${need.key} question`).toBeTruthy();
      expect(need.extract, `${need.key} extract hint`).toBeTruthy();
      expect(typeof need.required, `${need.key} required`).toBe("boolean");
    }
  });

  it("names a scrape strategy the heuristics actually implement", () => {
    const known = new Set(Object.values(SCRAPE));
    for (const need of PLUMBING.needs) {
      expect(known, `${need.key} scrape strategy`).toContain(need.scrape);
    }
  });

  it("gives every service aliases for the scraper to match on", () => {
    for (const service of PLUMBING.services) {
      expect(service.aliases?.length, `${service.key} aliases`).toBeGreaterThan(0);
    }
  });

  it("uses unique keys", () => {
    const keys = PLUMBING.needs.map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("resolves options for every choice need", () => {
    const choices = PLUMBING.needs.filter(
      (n) => n.type === FIELD_TYPES.CHOICE,
    );
    expect(choices.length).toBeGreaterThan(0);
    for (const need of choices) {
      const options = optionsForNeed(PLUMBING, need);
      expect(options.length, `${need.key} options`).toBeGreaterThan(0);
      for (const opt of options) {
        expect(opt.value).toBeTruthy();
        expect(opt.label).toBeTruthy();
      }
    }
  });

  it("names always-human services that actually exist", () => {
    const serviceKeys = new Set(PLUMBING.services.map((s) => s.key));
    for (const key of PLUMBING.alwaysHuman) {
      expect(serviceKeys, `alwaysHuman: ${key}`).toContain(key);
    }
    // Phase 3 depends on these two specifically.
    expect(PLUMBING.alwaysHuman).toContain("sewer_line");
    expect(PLUMBING.alwaysHuman).toContain("repipe");
  });

  it("keeps the confidence floor where Phase 3 expects it", () => {
    expect(PLUMBING.confidenceFloor).toBe(0.7);
  });

  it("has a unique id per trade in the picker", () => {
    const ids = TRADES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
