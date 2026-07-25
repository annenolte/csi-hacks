import { NextResponse } from "next/server";
import { getTrade } from "@/lib/trades";
import { ScrapeError, fetchPageText } from "@/lib/scrape/fetch";
import { extractWithHeuristics } from "@/lib/scrape/heuristics";
import { claudeIsConfigured, extractWithClaude } from "@/lib/scrape/claude";

export const runtime = "nodejs"; // needs node:dns for the private-network guard

/*
  POST { url, tradeId } -> { url, extractor, fields }

  `fields` is { [needKey]: { value, confidence, source } } and only contains what
  the page actually stated. A field that isn't there is a gap, not a blank to fill.

  Claude does the extraction when ANTHROPIC_API_KEY is set; otherwise the
  hand-written heuristics do. Both return the same shape, and if Claude fails at
  runtime we fall back rather than failing the request.
*/
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 });
  }

  const trade = getTrade(body?.tradeId);
  if (!trade) {
    return NextResponse.json({ error: "Pick a trade first." }, { status: 400 });
  }

  let page;
  try {
    page = await fetchPageText(body?.url);
  } catch (err) {
    if (err instanceof ScrapeError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "We couldn't read that page." }, { status: 502 });
  }

  const { html, url, ...rest } = page;

  if (claudeIsConfigured()) {
    try {
      const fields = await extractWithClaude({ trade, page: rest, url });
      return NextResponse.json({ url, extractor: "claude", fields });
    } catch (err) {
      console.error("Claude extraction failed, falling back to heuristics:", err);
    }
  }

  const fields = extractWithHeuristics({ trade, page: rest, html });
  return NextResponse.json({ url, extractor: "heuristics", fields });
}
