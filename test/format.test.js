import { describe, expect, it } from "vitest";
import { formatNeedValue } from "@/lib/format";
import { PLUMBING } from "@/lib/trades";

const need = (key) => PLUMBING.needs.find((n) => n.key === key);

describe("formatNeedValue", () => {
  it("collapses consecutive days that share a window", () => {
    const same = { open: "08:00", close: "17:00" };
    expect(
      formatNeedValue(PLUMBING, need("hours"), {
        mon: same,
        tue: same,
        wed: same,
        thu: same,
        fri: same,
        sat: { open: "09:00", close: "13:00" },
      }),
    ).toBe("Mon–Fri 8am–5pm, Sat 9am–1pm");
  });

  it("does not collapse across a closed day", () => {
    const same = { open: "08:00", close: "17:00" };
    expect(
      formatNeedValue(PLUMBING, need("hours"), { mon: same, wed: same }),
    ).toBe("Mon 8am–5pm, Wed 8am–5pm");
  });

  it("reports a fully closed week", () => {
    expect(formatNeedValue(PLUMBING, need("hours"), { mon: null })).toBe(
      "Closed all week",
    );
  });

  it("keeps minutes when they are not on the hour", () => {
    expect(
      formatNeedValue(PLUMBING, need("hours"), {
        mon: { open: "07:30", close: "16:45" },
      }),
    ).toBe("Mon 7:30am–4:45pm");
  });

  it("resolves single-choice labels", () => {
    expect(formatNeedValue(PLUMBING, need("emergency_policy"), "on_call")).toBe(
      "Yes, but on-call only",
    );
  });

  it("resolves multi-choice labels through optionsFrom", () => {
    expect(
      formatNeedValue(PLUMBING, need("services_offered"), [
        "drain_clear",
        "sewer_line",
      ]),
    ).toBe("Drain clearing, Sewer line");
  });

  it("joins chips", () => {
    expect(
      formatNeedValue(PLUMBING, need("service_area"), ["Portland", "Gresham"]),
    ).toBe("Portland, Gresham");
  });

  it("treats empty values as nothing to show", () => {
    expect(formatNeedValue(PLUMBING, need("business_name"), "")).toBeNull();
    expect(formatNeedValue(PLUMBING, need("service_area"), [])).toBeNull();
    expect(formatNeedValue(PLUMBING, need("business_name"), undefined)).toBeNull();
  });
});
