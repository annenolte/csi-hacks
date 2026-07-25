import { describe, expect, it } from "vitest";
import { PLUMBING } from "@/lib/trades";
import { extractWithHeuristics, formatPhone, to24Hour } from "@/lib/scrape/heuristics";
import { htmlToText } from "@/lib/scrape/fetch";

const PAGE = `<!doctype html>
<html>
  <head>
    <title>Nolte &amp; Sons Plumbing | Portland OR Plumbers</title>
    <meta name="description" content="Family plumbers since 1994.">
  </head>
  <body>
    <h1>Drain cleaning &amp; leak repair</h1>
    <p>Call us on <a href="tel:+1 503-555-0142">(503) 555-0142</a> today.</p>
    <p>Proudly serving Portland, Gresham and Lake Oswego.</p>
    <p>Hours: Monday - Friday: 8:00am - 5:00pm. Saturday: 9am - 1pm.</p>
    <p>We offer 24/7 emergency call-outs for burst pipes.</p>
    <p>We also handle water heater replacement and sewer line work.</p>
  </body>
</html>`;

function run(html = PAGE) {
  const { ...page } = htmlToText(html);
  return extractWithHeuristics({ trade: PLUMBING, page, html });
}

describe("heuristic extraction", () => {
  it("takes the business name from the title, before the separator", () => {
    expect(run().business_name.value).toBe("Nolte & Sons Plumbing");
  });

  it("prefers a tel: link over body text for the phone", () => {
    const phone = run().phone;
    expect(phone.value).toBe("(503) 555-0142");
    expect(phone.confidence).toBeGreaterThan(0.8);
  });

  it("reads the service area off the 'serving' sentence", () => {
    expect(run().service_area.value).toEqual([
      "Portland",
      "Gresham",
      "Lake Oswego",
    ]);
  });

  it("expands a weekday range and keeps Saturday separate", () => {
    expect(run().hours.value).toEqual({
      mon: { open: "08:00", close: "17:00" },
      tue: { open: "08:00", close: "17:00" },
      wed: { open: "08:00", close: "17:00" },
      thu: { open: "08:00", close: "17:00" },
      fri: { open: "08:00", close: "17:00" },
      sat: { open: "09:00", close: "13:00" },
    });
  });

  it("reads 24/7 as always open", () => {
    expect(run().emergency_policy.value).toBe("24_7");
  });

  it("matches services through their aliases", () => {
    const services = run().services_offered.value;
    expect(services).toContain("drain_clear");
    expect(services).toContain("leak_repair");
    expect(services).toContain("water_heater");
    expect(services).toContain("sewer_line");
    expect(services).not.toContain("repipe");
  });

  it("takes the self-description from the meta description", () => {
    expect(run().business_notes.value).toBe("Family plumbers since 1994.");
  });

  it("falls back to the first substantial paragraph for the description", () => {
    const fields = run(
      `<html><body><p>Hi.</p><p>We are a family-run plumbing outfit working across the
       east side, and we have been doing it for thirty years.</p></body></html>`,
    );
    expect(fields.business_notes.value).toContain("family-run plumbing outfit");
    /* Body copy is a weaker signal than a meta description, and says so. */
    expect(fields.business_notes.confidence).toBeLessThan(0.5);
  });

  it("quotes a source sentence for everything it finds", () => {
    for (const [key, field] of Object.entries(run())) {
      expect(field.source, `${key} source`).toBeTruthy();
    }
  });

  it("reports nothing rather than guessing on a bare page", () => {
    const fields = run("<html><head><title>x</title></head><body><p>Hello.</p></body></html>");
    expect(fields.phone).toBeUndefined();
    expect(fields.hours).toBeUndefined();
    expect(fields.service_area).toBeUndefined();
    expect(fields.emergency_policy).toBeUndefined();
  });

  it("downgrades a page that only mentions emergencies to on-call", () => {
    const fields = run(
      "<html><body><p>We offer emergency plumbing when you need it.</p></body></html>",
    );
    expect(fields.emergency_policy.value).toBe("on_call");
    expect(fields.emergency_policy.confidence).toBeLessThan(PLUMBING.confidenceFloor);
  });
});

describe("helpers", () => {
  it("normalises phone shapes", () => {
    expect(formatPhone("+1 503-555-0142")).toBe("(503) 555-0142");
    expect(formatPhone("5035550142")).toBe("(503) 555-0142");
    expect(formatPhone("503.555.0142")).toBe("(503) 555-0142");
  });

  it("reads closing hours without a meridiem as afternoon", () => {
    expect(to24Hour("5", null, null)).toBe("17:00");
    expect(to24Hour("8", null, "am")).toBe("08:00");
    expect(to24Hour("12", "30", "pm")).toBe("12:30");
    expect(to24Hour("12", null, "am")).toBe("00:00");
  });
});

describe("htmlToText", () => {
  it("joins hard-wrapped source lines inside a block", () => {
    /* Plenty of sites wrap their markup. Treating those newlines as line breaks
       used to split sentences in half and wreck every sentence-based extractor. */
    const { text } = htmlToText(
      "<p>We serve Portland,\n   Gresham and\n   Lake Oswego.</p><p>Second.</p>",
    );
    expect(text).toContain("We serve Portland, Gresham and Lake Oswego.");
    /* Real block boundaries still are boundaries. */
    expect(text.split("\n")).toHaveLength(2);
  });

  it("still finds the service area when the markup is wrapped", () => {
    const fields = run(
      "<html><body><p>Proudly serving Portland,\n  Gresham\n  and Lake Oswego.</p></body></html>",
    );
    expect(fields.service_area.value).toEqual([
      "Portland",
      "Gresham",
      "Lake Oswego",
    ]);
  });

  it("drops scripts and styles and decodes entities", () => {
    const { text } = htmlToText(
      "<style>p{color:red}</style><script>alert('x')</script><p>Bath &amp; Kitchen</p>",
    );
    expect(text).toContain("Bath & Kitchen");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
  });
});
