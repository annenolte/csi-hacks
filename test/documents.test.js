import { describe, expect, it, vi } from "vitest";
import {
  ACCEPT,
  MAX_DOCUMENT_BYTES,
  describeUnsupported,
  extensionOf,
  formatFor,
} from "@/lib/documents/formats";
import { decodeXmlEntities, tidy, toMarkdownTable, unwrapLines } from "@/lib/documents/text";
import { convertDocument, DocumentError } from "@/lib/documents/convert";
import { documentsField } from "@/lib/onboarding/components";

/*
  The conversion layer decides what a document "says", and every fact the agent
  later states on a phone call is quoted from that text. These tests guard the
  two ways it can lie: turning a table into loose cells so a price stops being
  attached to a service, and accepting a file it can only guess at.
*/

describe("the format table", () => {
  it("routes each extension to a reader, case-insensitively", () => {
    expect(formatFor("prices.pdf").kind).toBe("pdf");
    expect(formatFor("Prices.PDF").kind).toBe("pdf");
    expect(formatFor("handbook.docx").kind).toBe("docx");
    expect(formatFor("rates.xlsx").kind).toBe("xlsx");
    expect(formatFor("induction.pptx").kind).toBe("pptx");
    expect(formatFor("notes.md").kind).toBe("text");
    expect(formatFor("saved page.html").kind).toBe("html");
  });

  it("refuses what it can't read", () => {
    expect(formatFor("photo.jpg")).toBeNull();
    expect(formatFor("archive.zip")).toBeNull();
    expect(formatFor("README")).toBeNull();
  });

  it("names the export that would work for a format we recognise", () => {
    expect(describeUnsupported("rates.xls")).toMatch(/\.xlsx/);
    expect(describeUnsupported("handbook.doc")).toMatch(/\.docx/);
    expect(describeUnsupported("quote.pages")).toMatch(/\.docx or PDF/);
  });

  it("says something useful about a file with no extension at all", () => {
    expect(extensionOf("README")).toBe("");
    expect(describeUnsupported("README")).toMatch(/no file extension/);
  });

  /*
    A stored component is replayed on the next page load. If it carried the
    format list, someone who reached the documents step before a reader was added
    would keep being offered the old formats — the picker greys out the file they
    can plainly see in the folder, and nothing on screen explains why.
  */
  it("stays out of the conversation row, so a stored turn can't pin an old list", () => {
    expect(Object.keys(documentsField()).sort()).toEqual(["kind", "skipLabel"]);
  });

  it("offers every readable format in the picker, and nothing else", () => {
    for (const ext of ["pdf", "docx", "xlsx", "pptx", "txt", "csv", "html"]) {
      expect(ACCEPT.split(",")).toContain(`.${ext}`);
    }
    for (const ext of ["doc", "xls", "jpg"]) {
      expect(ACCEPT.split(",")).not.toContain(`.${ext}`);
    }
  });
});

describe("toMarkdownTable", () => {
  it("keeps a price beside the service it belongs to", () => {
    const table = toMarkdownTable([
      ["Service", "Flat rate"],
      ["Drain clear", "$189"],
      ["Water heater swap", "$1,200 - $1,800"],
    ]);

    expect(table.split("\n")).toEqual([
      "| Service | Flat rate |",
      "| --- | --- |",
      "| Drain clear | $189 |",
      "| Water heater swap | $1,200 - $1,800 |",
    ]);
  });

  it("pads ragged rows so the columns still line up", () => {
    const table = toMarkdownTable([
      ["Service", "Rate", "Notes"],
      ["Sewer line", "", "Always quoted on site"],
      ["Callout"],
    ]);

    expect(table).toContain("| Sewer line |  | Always quoted on site |");
    expect(table).toContain("| Callout |  |  |");
  });

  it("escapes a pipe inside a cell rather than splitting the row on it", () => {
    expect(toMarkdownTable([["a|b", "c"]])).toBe("| a\\|b | c |\n| --- | --- |");
  });

  it("drops empty rows and trailing empty columns", () => {
    expect(toMarkdownTable([["Service", "Rate", ""], [], ["Callout", "$95", ""]])).toBe(
      ["| Service | Rate |", "| --- | --- |", "| Callout | $95 |"].join("\n"),
    );
  });

  it("writes a single column as lines, not as a one-column table", () => {
    expect(toMarkdownTable([["Mon"], ["Tue"]])).toBe("Mon\nTue");
  });

  it("has nothing to say about an empty sheet", () => {
    expect(toMarkdownTable([])).toBe("");
    expect(toMarkdownTable([["", ""], []])).toBe("");
  });
});

describe("unwrapLines", () => {
  it("rejoins a sentence broken across two lines", () => {
    expect(unwrapLines(["We service the whole of the", "east side, seven days a week."])).toEqual([
      "We service the whole of the east side, seven days a week.",
    ]);
  });

  it("rejoins a word hyphenated across a line break", () => {
    expect(unwrapLines(["We handle repip-", "ing and sewer work."])).toEqual([
      "We handle repiping and sewer work.",
    ]);
  });

  /*
    The failure that matters. A price list read out of a PDF is one row per line,
    and joining two of those rows silently reassigns a number to a service.
  */
  it("never merges the rows of a price list", () => {
    expect(unwrapLines(["Drain clear", "$189", "Water heater swap", "$1,200"])).toEqual([
      "Drain clear",
      "$189",
      "Water heater swap",
      "$1,200",
    ]);
  });

  it("leaves a finished sentence alone", () => {
    expect(unwrapLines(["We answer every call.", "we also book jobs."])).toEqual([
      "We answer every call.",
      "we also book jobs.",
    ]);
  });

  it("treats a blank line as a paragraph break", () => {
    expect(unwrapLines(["our rates are", "", "flat for most jobs"])).toEqual([
      "our rates are",
      "",
      "flat for most jobs",
    ]);
  });
});

describe("tidy", () => {
  it("normalises line endings and strips a byte order mark", () => {
    expect(tidy("﻿one\r\ntwo\rthree")).toBe("one\ntwo\nthree");
  });

  it("removes the invisible characters parsers leave behind", () => {
    expect(tidy("re­pipe​ done")).toBe("repipe done");
    expect(tidy("$95 per hour")).toBe("$95 per hour");
  });

  it("collapses runs of blank lines but keeps paragraph breaks", () => {
    expect(tidy("one\n\n\n\ntwo")).toBe("one\n\ntwo");
  });
});

describe("decodeXmlEntities", () => {
  it("decodes the five named entities and numeric escapes", () => {
    expect(decodeXmlEntities("Rates &amp; hours &lt;here&gt;")).toBe("Rates & hours <here>");
    expect(decodeXmlEntities("&quot;flat&apos;")).toBe("\"flat'");
    expect(decodeXmlEntities("caf&#233; &#x2014; open")).toBe("café — open");
  });

  it("decodes an escaped ampersand last, so &amp;lt; stays literal", () => {
    expect(decodeXmlEntities("&amp;lt;")).toBe("&lt;");
  });
});

describe("convertDocument", () => {
  const bytes = (text) => new TextEncoder().encode(text);

  it("reads a plain text file as itself", async () => {
    const doc = await convertDocument({ name: "notes.txt", bytes: bytes("Callout is $95.\n") });
    expect(doc).toEqual({ name: "notes.txt", text: "Callout is $95.", format: "text" });
  });

  it("refuses a format it can't read, with advice rather than a rule", async () => {
    await expect(
      convertDocument({ name: "rates.xls", bytes: bytes("anything") }),
    ).rejects.toThrow(DocumentError);
    await expect(
      convertDocument({ name: "rates.xls", bytes: bytes("anything") }),
    ).rejects.toThrow(/\.xlsx/);
  });

  it("refuses binary content wearing a .txt name", async () => {
    await expect(
      convertDocument({ name: "sneaky.txt", bytes: new Uint8Array([0x50, 0x4b, 0x00, 0x03]) }),
    ).rejects.toThrow(/binary/);
  });

  it("refuses an empty file instead of storing a document that says nothing", async () => {
    await expect(convertDocument({ name: "blank.txt", bytes: bytes("") })).rejects.toThrow(
      /empty/,
    );
    await expect(convertDocument({ name: "blank.md", bytes: bytes("   \n\n ") })).rejects.toThrow(
      /no text/,
    );
  });

  it("keeps a spreadsheet's sheets and its rows together", async () => {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();

    const prices = workbook.addWorksheet("Callout rates");
    prices.addRow(["Service", "Flat rate"]);
    prices.addRow(["Drain clear", "$189"]);
    prices.addRow(["Sewer line", "Quoted on site"]);

    const hours = workbook.addWorksheet("Hours");
    hours.addRow(["Day", "Open"]);
    hours.addRow(["Mon-Fri", "7:00"]);

    const doc = await convertDocument({
      name: "rates.xlsx",
      bytes: new Uint8Array(await workbook.xlsx.writeBuffer()),
    });

    expect(doc.format).toBe("xlsx");
    expect(doc.text).toContain("## Callout rates");
    expect(doc.text).toContain("| Drain clear | $189 |");
    expect(doc.text).toContain("## Hours");
    expect(doc.text).toContain("| Mon-Fri | 7:00 |");
  });

  it("reads a saved web page through the same reader the scraper uses", async () => {
    const doc = await convertDocument({
      name: "services.html",
      bytes: bytes(
        "<html><head><title>Nolte & Sons</title></head><body>" +
          "<script>var secret = 1;</script><h1>Services</h1><p>Drain clearing, $189.</p>" +
          "</body></html>",
      ),
    });

    expect(doc.text).toContain("# Nolte & Sons");
    expect(doc.text).toContain("Drain clearing, $189.");
    expect(doc.text).not.toContain("secret");
  });

  /*
    A one-page PDF with no text operators at all — the shape a scan or a photo of
    a price list arrives in. There is no OCR behind this, so the only honest
    outcome is a refusal that says what to send instead.
  */
  it("refuses a PDF with no text layer rather than guessing at it", async () => {
    const blank = [
      "%PDF-1.4",
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj",
      "trailer<</Root 1 0 R/Size 4>>",
      "%%EOF",
    ].join("\n");

    await expect(
      convertDocument({ name: "scan.pdf", bytes: bytes(blank) }),
    ).rejects.toThrow(/no readable text/);
  });

  it("caps documents well below anything that would stall a request", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(2 * 1024 * 1024);
  });
});

/*
  The seam between the browser and the readers. `lib/documents/read.js` posts a
  multipart body and expects text back per file plus a sentence per failure; a
  change on either side that silently drops one of those turns a refused upload
  into an upload that looks like it worked.
*/
describe("POST /api/documents/extract", () => {
  it("reads what it can and names what it can't, in one response", async () => {
    vi.doMock("@/lib/auth/require", () => ({
      requireBusiness: async () => ({ business: { id: "b1" }, response: null }),
    }));
    const { POST } = await import("@/app/api/documents/extract/route");

    const body = new FormData();
    body.append("files", new File(["Callout is $95."], "notes.txt"));
    body.append("files", new File(["anything"], "old.xls"));
    body.append("files", new File(["nope"], "logo.png"));

    const response = await POST(new Request("http://x/api/documents/extract", {
      method: "POST",
      body,
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.documents).toEqual([{ name: "notes.txt", text: "Callout is $95." }]);
    expect(data.errors.map((e) => e.name)).toEqual(["old.xls", "logo.png"]);
    expect(data.errors[0].error).toMatch(/\.xlsx/);
  });

  it("strips any path a client puts in a filename", async () => {
    vi.doMock("@/lib/auth/require", () => ({
      requireBusiness: async () => ({ business: { id: "b1" }, response: null }),
    }));
    const { POST } = await import("@/app/api/documents/extract/route");

    const body = new FormData();
    body.append("files", new File(["Rates."], "../../etc/rates.txt"));

    const data = await (
      await POST(new Request("http://x/api/documents/extract", { method: "POST", body }))
    ).json();

    expect(data.documents[0].name).toBe("rates.txt");
  });

  it("turns nobody away without saying why", async () => {
    vi.doMock("@/lib/auth/require", () => ({
      requireBusiness: async () => ({ business: { id: "b1" }, response: null }),
    }));
    const { POST } = await import("@/app/api/documents/extract/route");

    const response = await POST(
      new Request("http://x/api/documents/extract", { method: "POST", body: new FormData() }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/No files/);
  });
});
