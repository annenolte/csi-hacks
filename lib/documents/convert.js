import "server-only";

import { formatFor, describeUnsupported } from "./formats";
import { decodeXmlEntities, tidy, toMarkdownTable, unwrapLines } from "./text";
import { htmlToText } from "../scrape/fetch";

/*
  One file's bytes in, the text we will quote back out.

  Everything downstream — the corpus, the extractors, the source sentence shown
  under every fact on the dashboard — reads only what this file returns. That is
  the whole reason the readers are conservative: a fact is presented to the owner
  as something their document says, so the text has to be something their
  document actually says.

  Two rules follow from that, and both are enforced here rather than left to the
  caller:

  - We never guess at glyphs. There is no OCR. A scan with no text layer is
    refused by name instead of being turned into a plausible-looking transcript,
    because a misread digit in a price is a number a real caller gets quoted.
  - We keep structure where structure carries meaning. A price table read as a
    list of loose cells has lost which number belongs to which service, so
    spreadsheets and Word tables come back as markdown tables.

  Parsing happens on the server, never in the browser. The heavy readers stay
  out of the client bundle, and each is imported only when a file of that kind
  actually arrives — a business that only ever uploads CSVs never loads pdf.js.
*/

/** A file we could not read, carrying a sentence meant for the person who sent it. */
export class DocumentError extends Error {
  constructor(message) {
    super(message);
    this.name = "DocumentError";
  }
}

/**
 * Read one uploaded file.
 *
 * Returns `{ name, text, format }`. Throws `DocumentError` with a message safe
 * to show, for anything from an unreadable format to a scan with nothing in it.
 */
export async function convertDocument({ name, bytes }) {
  const format = formatFor(name);
  if (!format) throw new DocumentError(describeUnsupported(name));

  const data = toUint8(bytes);
  if (!data.length) throw new DocumentError(`${name} is empty.`);

  const read = READERS[format.kind];
  let text;
  try {
    text = tidy(await read({ name, data }));
  } catch (err) {
    if (err instanceof DocumentError) throw err;
    /*
      Parser failures are almost always a file that isn't what its extension
      says, or one written by something that bends the format. Neither is worth
      showing a stack trace over, but both are worth logging.
    */
    console.error(`Couldn't read ${name}:`, err);
    throw new DocumentError(
      `${name} couldn't be read. It may be damaged, password-protected, or not really a .${format.ext} file.`,
    );
  }

  if (!text) throw new DocumentError(emptyMessage(name, format.kind));

  return { name, text, format: format.kind };
}

/* --------------------------------------------------------------- the readers */

const READERS = {
  text: readPlainText,
  html: readHtml,
  docx: readDocx,
  xlsx: readXlsx,
  pptx: readPptx,
  pdf: readPdf,
};

/*
  UTF-8 first, then Windows-1252. A price list exported from a spreadsheet on a
  Windows machine is routinely cp1252, and decoded as UTF-8 its pound signs and
  curly apostrophes come out as replacement characters — inside a sentence we
  will quote back verbatim.
*/
function readPlainText({ name, data }) {
  if (data.includes(0)) {
    throw new DocumentError(
      `${name} looks like a binary file rather than text, whatever its name says.`,
    );
  }

  const strict = tryDecode(data, "utf-8", true);
  if (strict !== null) return strict;

  const fallback = tryDecode(data, "windows-1252", false);
  if (fallback !== null) return fallback;

  return new TextDecoder("utf-8").decode(data);
}

function tryDecode(data, encoding, fatal) {
  try {
    return new TextDecoder(encoding, { fatal }).decode(data);
  } catch {
    return null;
  }
}

/*
  The same reader the website scraper uses, so a saved page and a scraped one
  land in the corpus in the same shape. Its own comments explain why block
  boundaries — and only block boundaries — become newlines.
*/
function readHtml({ data }) {
  const { title, text } = htmlToText(new TextDecoder("utf-8").decode(data));
  return title ? `# ${title}\n\n${text}` : text;
}

/*
  mammoth reads the document's own styles, so headings stay headings and lists
  stay lists; turndown with the GFM table rules then keeps a table a table. The
  pair matters more than either half — a service-and-price table read as prose
  is the exact failure the whole conversion layer exists to avoid.
*/
async function readDocx({ data }) {
  const [{ default: mammoth }, { default: TurndownService }, { tables }] =
    await Promise.all([
      import("mammoth"),
      import("turndown"),
      import("turndown-plugin-gfm"),
    ]);

  const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(data) });

  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });
  turndown.use(tables);

  return turndown.turndown(html ?? "");
}

/*
  Every sheet, in order, under its own heading. Sheet names carry real meaning in
  a small business's workbook — "Callout rates", "After hours" — and dropping
  them would strip the only label some of those numbers have.
*/
async function readXlsx({ data }) {
  const { default: ExcelJS } = await import("exceljs");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(data));

  const sheets = [];
  for (const sheet of workbook.worksheets) {
    if (sheet.state === "veryHidden" || sheet.state === "hidden") continue;

    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        cells[column - 1] = cellText(cell);
      });
      rows.push(Array.from(cells, (cell) => cell ?? ""));
    });

    const table = toMarkdownTable(rows);
    if (table) sheets.push(`## ${sheet.name}\n\n${table}`);
  }

  return sheets.join("\n\n");
}

/**
 * One cell as text.
 *
 * Dates go to ISO rather than to a locale string: a workbook read on a machine
 * set to one locale and quoted back on another must not change what day it says.
 * Formulas contribute their cached result, because the result is the number the
 * owner sees and would recognise being read back.
 */
function cellText(cell) {
  const value = cell?.value;
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return value.richText.map((run) => run.text ?? "").join("");
    }
    if ("text" in value) return String(value.text ?? "");
    if ("result" in value) {
      const { result } = value;
      if (result instanceof Date) return result.toISOString().slice(0, 10);
      /* An #N/A or #REF! is a broken cell, not a value worth repeating. */
      if (result && typeof result === "object" && "error" in result) return "";
      return result === null || result === undefined ? "" : String(result);
    }
    if ("error" in value) return "";
    if ("formula" in value || "sharedFormula" in value) return "";
  }

  return String(value);
}

/*
  Slides are read straight from the package XML rather than through a renderer.
  Every run of text in a PowerPoint slide sits in an <a:t> element, which is the
  literal string the author typed — exactly what a verbatim quote needs, and with
  no layout engine in between to invent one.

  Speaker notes come too. On a training deck they are usually where the actual
  instruction lives, with the slide itself carrying three words and a photo.
*/
async function readPptx({ data }) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(Buffer.from(data));

  const slides = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort(bySlideNumber);

  const out = [];
  for (const path of slides) {
    const number = slideNumber(path);
    const body = slideText(await zip.file(path).async("string"));

    const notesFile = zip.file(`ppt/notesSlides/notesSlide${number}.xml`);
    const notes = notesFile ? slideText(await notesFile.async("string")) : "";

    if (!body && !notes) continue;

    out.push(
      [`## Slide ${number}`, body, notes && `Speaker notes: ${notes}`]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  return out.join("\n\n");
}

const slideNumber = (path) => Number(/(\d+)\.xml$/.exec(path)[1]);
const bySlideNumber = (a, b) => slideNumber(a) - slideNumber(b);

/** The text of one slide part: a line per paragraph, wrapped lines rejoined. */
function slideText(xml) {
  const paragraphs = String(xml)
    .split(/<\/a:p>/)
    .map((paragraph) =>
      [...paragraph.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
        .map((match) => decodeXmlEntities(match[1]))
        .join("")
        .trim(),
    )
    .filter(Boolean);

  return unwrapLines(paragraphs).join("\n");
}

/*
  pdf.js gives us the text layer and nothing else, which is the point. If a PDF
  has no text layer it is a photograph of a document, and the only way to get
  words out of a photograph is to guess at them.
*/
async function readPdf({ name, data }) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const task = pdfjs.getDocument({
    data,
    /* Nothing in a customer's price list needs to run code to be read. */
    isEvalSupported: false,
    useSystemFonts: false,
    /* No network fetches for fonts or maps; the file is all we read. */
    disableFontFace: true,
  });

  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    if (err?.name === "PasswordException") {
      throw new DocumentError(
        `${name} is password-protected. Save an unlocked copy and try again.`,
      );
    }
    throw err;
  }

  try {
    const pages = [];
    for (let number = 1; number <= doc.numPages; number += 1) {
      const page = await doc.getPage(number);
      const content = await page.getTextContent();

      const lines = [];
      let line = [];
      for (const item of content.items) {
        if (typeof item.str === "string") line.push(item.str);
        if (item.hasEOL) {
          lines.push(line.join("").trim());
          line = [];
        }
      }
      if (line.length) lines.push(line.join("").trim());

      pages.push(unwrapLines(lines).join("\n").trim());
      page.cleanup();
    }


    const text = pages.filter(Boolean).join("\n\n");

    /*
      A scan usually yields a handful of stray characters from a stamp or a page
      number rather than nothing at all, so "did we get anything" is too weak a
      test. Refusing by name is the honest failure: the owner can send the
      document it was scanned from, or type the answer, and either beats a
      transcript nobody can vouch for.
    */
    if (text.replace(/\s/g, "").length < 24) {
      throw new DocumentError(
        `${name} has no readable text — it looks like a scan or a set of images. Send the original document, or the text on its own.`,
      );
    }

    return text;
  } finally {
    /*
      The loading task owns the worker, not the document proxy. Leaving it open
      holds a worker per upload, and a handful of concurrent uploads is enough
      for that to matter.
    */
    await task.destroy();
  }
}

/* ---------------------------------------------------------------- odds & ends */

function toUint8(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  return new Uint8Array(bytes ?? []);
}

function emptyMessage(name, kind) {
  if (kind === "xlsx") return `${name} has no filled-in cells.`;
  if (kind === "pptx") return `${name} has no text on any slide.`;
  return `${name} has no text in it.`;
}
