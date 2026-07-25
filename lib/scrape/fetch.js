import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/*
  Fetches one page and reduces it to text. Runs server-side only.

  The URL comes from whoever is filling in the form, so this is an SSRF sink:
  without a guard, "http://169.254.169.254/" or "http://localhost:5432" would let
  a visitor use our server to reach things only our server can see. Every host is
  resolved first and checked against private ranges before a request goes out.
*/

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;

export class ScrapeError extends Error {
  constructor(message, { status = 400 } = {}) {
    super(message);
    this.name = "ScrapeError";
    this.status = status;
  }
}

/** Accepts "noltesons.com/services" as readily as a full URL. */
export function normaliseUrl(input) {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) throw new ScrapeError("Enter a web address first.");

  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new ScrapeError("That doesn't look like a web address.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ScrapeError("Only http and https addresses can be read.");
  }
  if (!url.hostname.includes(".")) {
    throw new ScrapeError("That doesn't look like a public web address.");
  }
  return url;
}

function ipv4IsPrivate(ip) {
  const [a, b] = ip.split(".").map(Number);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function ipv6IsPrivate(ip) {
  const addr = ip.toLowerCase().split("%")[0];
  if (addr === "::1" || addr === "::") return true;
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique local
  if (addr.startsWith("fe80")) return true; // link-local
  // IPv4-mapped, e.g. ::ffff:127.0.0.1
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsPrivate(mapped[1]);
  return false;
}

export function addressIsPrivate(ip) {
  const family = isIP(ip);
  if (family === 4) return ipv4IsPrivate(ip);
  if (family === 6) return ipv6IsPrivate(ip);
  return true; // unparseable — refuse rather than guess
}

async function assertPublicHost(hostname) {
  const literal = isIP(hostname);
  if (literal) {
    if (addressIsPrivate(hostname)) {
      throw new ScrapeError("That address is on a private network.");
    }
    return;
  }

  let records;
  try {
    records = await lookup(hostname, { all: true });
  } catch {
    throw new ScrapeError("We couldn't find that domain.");
  }
  if (records.length === 0 || records.some((r) => addressIsPrivate(r.address))) {
    throw new ScrapeError("That address resolves to a private network.");
  }
}

/** Fetch one page and return its text. Never follows a redirect blindly. */
export async function fetchPageText(rawUrl) {
  let url = normaliseUrl(rawUrl);

  /* Manual redirect handling so each hop gets the same private-network check. */
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicHost(url.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "CallSlipBot/0.1 (+onboarding form autofill)",
          accept: "text/html,application/xhtml+xml",
        },
      });
    } catch {
      throw new ScrapeError("We couldn't reach that page.", { status: 502 });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new ScrapeError("That page redirected nowhere.");
      url = new URL(location, url);
      continue;
    }

    if (!res.ok) {
      throw new ScrapeError(`That page returned a ${res.status}.`, { status: 502 });
    }

    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) {
      throw new ScrapeError("That address isn't a web page we can read.");
    }

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) {
      throw new ScrapeError("That page is too big to read.");
    }

    const html = (await res.text()).slice(0, MAX_BYTES);
    return { url: url.href, html, ...htmlToText(html) };
  }

  throw new ScrapeError("That page redirected too many times.");
}

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
};

export function decodeEntities(str) {
  return str
    .replace(/&([a-z]+|#\d+);/gi, (match, name) => {
      const key = name.toLowerCase();
      if (ENTITIES[key] !== undefined) return ENTITIES[key];
      if (key.startsWith("#")) {
        const code = Number(key.slice(1));
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return match;
    })
    .replace(/&#x([0-9a-f]+);/gi, (m, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

/*
  Deliberately not a DOM parse. We want the text a caller would read, plus a few
  signals (title, headings) that carry more weight than body copy.
*/
export function htmlToText(html) {
  const stripped = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const pick = (re) => {
    const m = stripped.match(re);
    return m ? decodeEntities(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : null;
  };

  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = pick(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
  );
  const siteName = pick(
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i,
  );

  const headings = [
    ...stripped.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi),
  ]
    .map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 40);

  /*
    Only block boundaries become newlines. Newlines already in the source become
    spaces — plenty of sites hard-wrap their paragraph text, and treating those as
    line breaks chops sentences in half, which wrecks both the quoted sources and
    every extractor that reads a sentence at a time. The sentinel survives the
    whitespace collapse so the real boundaries can be restored afterwards.
  */
  const BREAK = "";
  const text = decodeEntities(
    stripped
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/td)[^>]*>/gi, BREAK)
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .replace(new RegExp(`\\s*${BREAK}\\s*`, "g"), "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

  return { title, description, siteName, headings, text };
}
