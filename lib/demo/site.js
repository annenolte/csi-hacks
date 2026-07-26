/*
  The one business whose setup runs from cache.

  Demos re-run the same onboarding over and over: a new account, the same
  website, the same folder of files. Every run of that pays for the same website
  fetch, the same single-page extraction and the same whole-corpus read, and the
  third one is no more informative than the first.

  So for this one site, those calls go through lib/cache/store.js. What is cached
  is the real work's own output — the page we really fetched, the fields the
  extractor really returned — recorded on the first run and replayed after that.
  Nothing is invented and nothing is written by hand here; a demo shows what the
  product actually did, just without paying for it twice.

  It is gated on the website rather than on an environment variable on purpose. A
  flag left on would quietly serve a real customer someone else's reading of
  their documents. A hostname can only ever match the business whose site it is.
*/

/** The site the demo is run against. */
export const DEMO_WEBSITE = "saviorplumbing.com";

/**
 * True when this address is the demo site.
 *
 * Matched on the host, so `saviorplumbing.com`, `www.saviorplumbing.com` and
 * `https://saviorplumbing.com/contact` are all the same business. The leading
 * dot on the suffix check is what keeps `saviorplumbing.com.example.net` — a
 * domain anyone can register — from being treated as ours.
 */
export function isDemoSite(url) {
  const host = hostOf(url);
  if (!host) return false;
  return host === DEMO_WEBSITE || host.endsWith(`.${DEMO_WEBSITE}`);
}

function hostOf(url) {
  const trimmed = String(url ?? "").trim().toLowerCase();
  if (!trimmed) return null;

  try {
    /* The onboarding field takes "saviorplumbing.com" as readily as a full URL. */
    const parsed = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
