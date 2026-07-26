/*
  The text-shaping helpers every reader in convert.js ends with.

  They live apart from the readers because they carry the judgement calls, and a
  judgement call that isn't tested is a guess. Everything here is pure: bytes in
  from a parser, the sentences we will later quote back to the owner out.
*/

/** Whitespace and control characters normalised, so two readers agree on a blank line. */
export function tidy(text) {
  return String(text ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    /*
      Control characters, soft hyphens and zero-width marks are artefacts of the
      source format. Left in, they reach the owner inside a quoted sentence as
      mojibake, or stop a quote matching the document it came from.
    */
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u200B-\u200D\u2060]/g, "")
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * PDF and slide text arrives hard-wrapped at whatever width the page was laid
 * out to. Every line break is a layout accident, not a sentence boundary.
 *
 * Left alone, a wrapped paragraph reaches the extractor as a stack of fragments
 * and comes back as a citation that stops mid-sentence. Joined too eagerly, a
 * price list collapses into one line and "Drain clear" stops being attached to
 * "$189" — which is worse, because it is wrong rather than ugly.
 *
 * So the rule is deliberately timid: only join when the break is unambiguously
 * mid-clause — the line before ends in a lowercase letter or a comma, and the
 * line after starts in lowercase. A row of a table never looks like that.
 */
export function unwrapLines(lines) {
  const out = [];

  for (const raw of lines) {
    const line = String(raw ?? "").replace(/[ \t]+$/, "");
    const prev = out.length ? out[out.length - 1] : null;

    if (prev && line) {
      /* A word split across a line break: "plumb-" + "ing". Rejoin it whole. */
      if (/[a-z]-$/.test(prev) && /^[a-z]/.test(line)) {
        out[out.length - 1] = prev.slice(0, -1) + line;
        continue;
      }
      if (/[a-z,;]$/.test(prev) && /^[a-z(]/.test(line)) {
        out[out.length - 1] = `${prev} ${line}`;
        continue;
      }
    }

    out.push(line);
  }

  return out;
}

/**
 * A grid of cells as a markdown table.
 *
 * Tables are the reason spreadsheets and Word documents are worth reading at
 * all: a price list is a service in one column and a number in the next, and
 * flattening it to a line per cell throws away which number belongs to which
 * service. Markdown keeps the pairing in a form the model reads reliably.
 */
export function toMarkdownTable(rows) {
  const grid = (rows ?? [])
    .map((row) => (row ?? []).map(cellToMarkdown))
    .filter((row) => row.some((cell) => cell !== ""));

  if (grid.length === 0) return "";

  /* Trailing empty columns are formatting habits, not data. */
  let width = Math.max(...grid.map((row) => row.length));
  while (width > 1 && grid.every((row) => (row[width - 1] ?? "") === "")) width -= 1;

  const padded = grid.map((row) =>
    Array.from({ length: width }, (_, i) => row[i] ?? ""),
  );

  /* One column isn't a table; a table with no body renders as a header alone. */
  if (width === 1) return padded.map((row) => row[0]).join("\n");

  const [header, ...body] = padded;
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

/** A cell's text, made safe to sit between two pipes. */
function cellToMarkdown(value) {
  return String(value ?? "")
    .replace(/\r\n?|\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

/** The five XML entities plus numeric escapes, for the readers that walk raw XML. */
export function decodeXmlEntities(xml) {
  return String(xml ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function safeCodePoint(code) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}
