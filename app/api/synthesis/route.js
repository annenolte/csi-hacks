import { NextResponse } from "next/server";
import { getTrade } from "@/lib/trades";
import { loadOnboarding } from "@/lib/db/onboarding";
import { loadSynthesis, saveSynthesis } from "@/lib/db/synthesis";
import { buildCorpus } from "@/lib/synthesis/corpus";
import { claudeIsConfigured, extractFields, extractPrices } from "@/lib/synthesis/extract";
import { buildReport } from "@/lib/synthesis/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* Two model calls over a whole corpus; the default 15s would cut it off. */
export const maxDuration = 300;

/*
  GET  -> the last synthesis, if there is one
  POST -> read every document for the business and synthesise

  Prices are classified in lib/synthesis/classify.js after the model returns, not
  by the model. The model is never asked which prices are safe to quote.
*/

export async function GET() {
  try {
    return NextResponse.json(await loadSynthesis());
  } catch (err) {
    console.error("Failed to load synthesis:", err);
    return NextResponse.json({ error: "Couldn't load what we read." }, { status: 500 });
  }
}

export async function POST() {
  const state = await loadOnboarding();
  const trade = getTrade(state.tradeId);

  if (!trade) {
    return NextResponse.json({ error: "Pick a trade first." }, { status: 400 });
  }

  const corpus = buildCorpus(state.documents);
  if (corpus.isEmpty) {
    return NextResponse.json(
      {
        error:
          "There's nothing to read yet — add a price list or a document with some text in it.",
      },
      { status: 400 },
    );
  }

  if (!claudeIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Reading documents needs an ANTHROPIC_API_KEY. Add one to .env.local and restart the server.",
      },
      { status: 503 },
    );
  }

  let fields;
  let prices;
  try {
    /* Independent calls over the same corpus — no reason to run them in series. */
    [fields, prices] = await Promise.all([
      extractFields({ trade, corpus }),
      extractPrices({ trade, corpus }),
    ]);
  } catch (err) {
    console.error("Synthesis failed:", err);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  const report = buildReport({ trade, fields, prices, answers: state.answers });

  try {
    await saveSynthesis(report);
  } catch (err) {
    /* The read succeeded; losing the cache is not worth failing the request over. */
    console.error("Couldn't store synthesis results:", err);
  }

  return NextResponse.json({
    corpus: {
      documents: corpus.documents,
      chars: corpus.chars,
      truncated: corpus.truncated,
      skipped: corpus.skipped,
    },
    facts: report.facts.map((f) => ({
      key: f.need.key,
      label: f.need.label,
      value: f.value,
      confidence: f.confidence,
      source: f.source,
      document: f.document,
      conflicted: f.conflicted,
    })),
    conflicts: report.conflicts.map((c) => ({ key: c.need.key, label: c.need.label })),
    gaps: report.gaps.map((need) => ({ key: need.key, question: need.question })),
    prices: report.prices,
    counts: report.counts,
  });
}
