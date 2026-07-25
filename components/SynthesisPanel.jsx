"use client";

import { PRICE_TIERS } from "@/lib/trades";
import { Button, Card } from "./ui";

/*
  What reading the documents turned up: facts with the sentence they came from,
  disagreements left unresolved, and prices sorted by what the agent is allowed
  to do with them.

  The tier on each price is decided in lib/synthesis/classify.js, in code — never
  by the model. That is why a document claiming a flat price for sewer work still
  shows up here as needing a person.
*/

const TIER_COPY = {
  [PRICE_TIERS.QUOTABLE]: {
    label: "Can quote",
    blurb: "The agent may say this figure out loud.",
    tone: "border-line bg-paper",
    dot: "bg-script-green",
  },
  [PRICE_TIERS.RANGE_ONLY]: {
    label: "Ballpark only",
    blurb: "It can mention this, but not commit you to it.",
    tone: "border-line bg-cream",
    dot: "bg-accent",
  },
  [PRICE_TIERS.HUMAN_REQUIRED]: {
    label: "You quote it",
    blurb: "The agent takes a message instead of naming a price.",
    tone: "border-line bg-cream",
    dot: "bg-flag",
  },
};

export default function SynthesisPanel({ synthesis, documents, onRun }) {
  const busy = synthesis.status === "running";
  const hasDocuments = documents.length > 0;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[15.5px] font-medium tracking-[-0.01em] text-ink">
          Read my documents
        </h2>
        {synthesis.counts && (
          <span className="text-[13px] text-muted">
            {synthesis.counts.facts} found · {synthesis.counts.gaps} still missing
          </span>
        )}
      </div>

      <p className="mt-1 max-w-[60ch] text-[13.5px] leading-relaxed text-muted">
        {hasDocuments
          ? "We read everything you uploaded in one pass and pull out what it actually says — with the sentence each fact came from, so you can check our working."
          : "Nothing to read yet. Add a price list or an FAQ on the previous step and we'll pull what we can out of it."}
      </p>

      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        <Button onClick={onRun} disabled={busy || !hasDocuments}>
          {busy ? "Reading…" : synthesis.status === "done" ? "Read them again" : "Read them"}
        </Button>
        {busy && (
          <span className="text-[13px] text-muted" aria-live="polite">
            This takes a moment — it reads the whole lot at once.
          </span>
        )}
      </div>

      {synthesis.status === "error" && (
        <p role="alert" className="mt-3 text-[13.5px] leading-snug text-flag">
          {synthesis.error}
        </p>
      )}

      {synthesis.status === "done" && <Results synthesis={synthesis} />}
    </Card>
  );
}

function Results({ synthesis }) {
  const { facts = [], prices = [], conflicts = [], corpus } = synthesis;

  return (
    <div className="mt-5 space-y-6 border-t border-line pt-5">
      {corpus?.truncated && (
        <p role="alert" className="text-[13px] leading-snug text-flag">
          Too much to read at once — we skipped {corpus.skipped.join(", ")}. What&apos;s
          below doesn&apos;t cover {corpus.skipped.length === 1 ? "it" : "them"}.
        </p>
      )}

      {conflicts.length > 0 && (
        <section>
          <Label>Your documents disagree</Label>
          <p className="mt-1.5 max-w-[58ch] text-[13px] leading-relaxed text-muted">
            We&apos;ve kept both rather than picking one — guessing which is current is
            exactly how an agent ends up quoting a number you retired last year.
          </p>
        </section>
      )}

      {facts.length > 0 && (
        <section>
          <Label>What they say</Label>
          <ul className="mt-2.5 space-y-2">
            {facts.map((fact, i) => (
              <li
                key={`${fact.key}-${i}`}
                className={`rounded-[var(--radius-inner)] border px-4 py-3 ${
                  fact.conflicted ? "border-flag/40 bg-cream" : "border-line bg-paper"
                }`}
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[12px] uppercase tracking-[0.06em] text-faint">
                    {fact.label}
                  </span>
                  {fact.conflicted && (
                    <span className="text-[11.5px] font-medium text-flag">
                      conflicting
                    </span>
                  )}
                </div>
                <p className="mt-0.5 break-words text-[14.5px] leading-snug text-ink">
                  {renderValue(fact.value)}
                </p>
                {fact.source && (
                  <p className="mt-1.5 text-[12.5px] leading-snug text-muted">
                    <span className="italic">&ldquo;{fact.source}&rdquo;</span>
                    {fact.document && <span className="text-faint"> — {fact.document}</span>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {prices.length > 0 && (
        <section>
          <Label>Prices</Label>
          <p className="mt-1.5 max-w-[58ch] text-[13px] leading-relaxed text-muted">
            What the agent may do with each one is decided here, not by the document.
            Sewer and repipe work always goes to you, whatever a price list says.
          </p>
          <ul className="mt-2.5 space-y-2">
            {prices.map((price, i) => {
              const copy = TIER_COPY[price.tier] ?? TIER_COPY[PRICE_TIERS.HUMAN_REQUIRED];
              return (
                <li
                  key={`${price.serviceKey}-${i}`}
                  className={`rounded-[var(--radius-inner)] border px-4 py-3 ${copy.tone}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-[14px] font-medium text-ink">
                      {price.rawText}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-soft">
                      <span className={`h-1.5 w-1.5 rounded-full ${copy.dot}`} />
                      {copy.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {copy.blurb}
                    {price.reason && <span className="text-faint"> ({price.reason})</span>}
                  </p>
                  {price.source && (
                    <p className="mt-1.5 text-[12.5px] italic leading-snug text-muted">
                      &ldquo;{price.source}&rdquo;
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {facts.length === 0 && prices.length === 0 && (
        <p className="text-[14px] leading-relaxed text-muted">
          We read them and they didn&apos;t state any of this directly. That&apos;s a
          real answer — better than us inventing one. Fill in what&apos;s missing below.
        </p>
      )}
    </div>
  );
}

function Label({ children }) {
  return (
    <h3 className="text-[12px] font-medium uppercase tracking-[0.07em] text-faint">
      {children}
    </h3>
  );
}

function renderValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([day, w]) => `${day} ${w?.open}–${w?.close}`)
      .join(", ");
  }
  return String(value);
}
