"use client";

import { useState } from "react";
import { getTrade, PRICE_TIERS } from "@/lib/trades";
import NeedField from "../NeedField";
import { Button, Check } from "../ui";

/*
  Everything the agent knows, and the place to fix it.

  This is the tab that matters once setup is done: businesses change their hours,
  drop a service, put prices up. Every row shows where the value came from before
  it offers to change it, because "the agent thinks you close at 5" is only
  actionable once you can see it read that off a price list from two years ago.

  Rows are generated from the trade's `needs` array in its order — the same array
  that drives the interview and the extractor. Nothing here names a field.
*/
export default function Knowledge({ data, onRefresh }) {
  const trade = getTrade(data.business.tradeId);

  const unanswered = data.knowledge.filter((k) => !k.answered);
  const conflicted = data.knowledge.filter((k) => k.conflicts.length > 0);

  return (
    <div className="space-y-5">
      {(unanswered.length > 0 || conflicted.length > 0) && (
        <Banner unanswered={unanswered} conflicted={conflicted} />
      )}

      <section className="rounded-[var(--radius-card)] border border-line bg-paper shadow-lift">
        <header className="border-b border-line px-6 py-4">
          <h2 className="text-[16px] font-medium tracking-[-0.015em] text-ink">
            What your agent says
          </h2>
          <p className="mt-1 text-[13.5px] leading-snug text-muted">
            Change anything here and the agent uses it on the very next call.
          </p>
        </header>

        <ul className="divide-y divide-line">
          {data.knowledge.map((item) => (
            <KnowledgeRow
              key={item.key}
              trade={trade}
              item={item}
              onSaved={onRefresh}
            />
          ))}
        </ul>
      </section>

      {data.followups.length > 0 && <Followups followups={data.followups} />}

      <Prices prices={data.prices} />
    </div>
  );
}

function Banner({ unanswered, conflicted }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-cream px-5 py-4">
      <p className="text-[14px] leading-relaxed text-ink-soft">
        {conflicted.length > 0 && (
          <>
            <strong className="font-medium text-ink">
              {conflicted.length} thing{conflicted.length === 1 ? "" : "s"} your
              documents disagree about.
            </strong>{" "}
            The agent won&apos;t state any of them until you pick.{" "}
          </>
        )}
        {unanswered.length > 0 && (
          <>
            {unanswered.length} question{unanswered.length === 1 ? " has" : "s have"} no
            answer yet — the agent will hand those callers to a person rather than
            guess.
          </>
        )}
      </p>
    </div>
  );
}

const SOURCE_LABEL = {
  website: "Read off your website",
  documents: "Read from your documents",
  operator: "You set this",
};

function KnowledgeRow({ trade, item, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const need = trade?.needs.find((n) => n.key === item.key);
  if (!need) return null;

  async function save(value) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/dashboard/field", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: item.key, value }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save that.");
        return;
      }
      setEditing(false);
      onSaved();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-6 py-5">
      <div className="flex items-start gap-3">
        <span className="mt-1 shrink-0">
          <Check filled={item.answered} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="text-[14.5px] font-medium text-ink">{item.label}</h3>
            {!editing && (
              <button
                type="button"
                onClick={() => {
                  setDraft(item.value);
                  setEditing(true);
                }}
                className="text-[13px] font-medium text-accent hover:underline"
              >
                {item.answered ? "Change" : "Answer this"}
              </button>
            )}
          </div>

          {editing ? (
            <div className="mt-3">
              <NeedField trade={trade} need={need} value={draft} onChange={setDraft} />
              {error && (
                <p role="alert" className="mt-2 text-[13px] text-flag">
                  {error}
                </p>
              )}
              <div className="mt-4 flex items-center gap-3">
                <Button onClick={() => save(draft)} disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setError(null);
                  }}
                  className="text-[13.5px] font-medium text-muted hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p
                className={`mt-1 text-[14.5px] leading-relaxed ${
                  item.answered ? "text-ink-soft" : "text-faint"
                }`}
              >
                {item.display ?? "Nothing set — the agent will pass these callers to you."}
              </p>

              {item.provenance?.source && item.answered && (
                <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[12.5px] leading-snug text-muted">
                  <span>
                    {SOURCE_LABEL[item.provenance.source] ?? item.provenance.source}
                  </span>
                  {item.provenance.sentence && (
                    <span className="italic">
                      &ldquo;{truncate(item.provenance.sentence, 120)}&rdquo;
                    </span>
                  )}
                </p>
              )}
            </>
          )}

          {item.conflicts.length > 0 && !editing && (
            <div className="mt-3 rounded-[var(--radius-inner)] border border-line bg-cream p-3.5">
              <p className="text-[13px] font-medium text-ink">
                Your documents say two different things:
              </p>
              <ul className="mt-2 space-y-2">
                {item.conflicts.map((conflict, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <button
                      type="button"
                      onClick={() => save(conflict.value)}
                      disabled={busy}
                      className="rounded-full border border-line bg-paper px-3 py-1 text-[13px] font-medium text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white disabled:opacity-40"
                    >
                      {conflict.display}
                    </button>
                    <span className="text-[12px] text-muted">
                      {conflict.document ?? "unknown source"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/*
  The questions the agent composed during setup, kept as question-and-answer pairs.
  These aren't part of the trade's `needs` list — they're specific to this
  business — so they get their own block rather than being flattened into a row
  that pretends to be a standard field.
*/
function Followups({ followups }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-paper p-6 shadow-lift">
      <h2 className="text-[16px] font-medium tracking-[-0.015em] text-ink">
        Asked during setup
      </h2>
      <p className="mt-1 text-[13.5px] leading-snug text-muted">
        Things the agent thought to ask about your business specifically.
      </p>
      <dl className="mt-4 space-y-4">
        {followups.map((item) => (
          <div key={item.id}>
            <dt className="text-[13.5px] text-muted">{item.question}</dt>
            <dd className="mt-0.5 text-[14.5px] text-ink">{item.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const TIER_COPY = {
  [PRICE_TIERS.QUOTABLE]: {
    label: "Can quote",
    detail: "The agent will say this number.",
    className: "bg-accent-soft text-accent",
  },
  [PRICE_TIERS.RANGE_ONLY]: {
    label: "Rough only",
    detail: "The agent gives a range and won't commit to a total.",
    className: "bg-canvas text-ink-soft",
  },
  [PRICE_TIERS.HUMAN_REQUIRED]: {
    label: "You take it",
    detail: "The agent won't quote at all and hands the call to you.",
    className: "bg-flag/10 text-flag",
  },
};

function Prices({ prices }) {
  if (prices.length === 0) return null;

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-paper shadow-lift">
      <header className="border-b border-line px-6 py-4">
        <h2 className="text-[16px] font-medium tracking-[-0.015em] text-ink">Prices</h2>
        <p className="mt-1 max-w-[60ch] text-[13.5px] leading-snug text-muted">
          What the agent may say out loud about each one. Some jobs are always
          yours to quote no matter what a document claims — a sewer line quoted
          over the phone is how you lose money on it.
        </p>
      </header>

      <ul className="divide-y divide-line">
        {prices.map((price, i) => {
          const tier = TIER_COPY[price.tier] ?? TIER_COPY[PRICE_TIERS.HUMAN_REQUIRED];
          return (
            <li key={i} className="px-6 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[14.5px] font-medium text-ink">
                  {price.serviceLabel}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${tier.className}`}
                >
                  {tier.label}
                </span>
              </div>
              <p className="mt-1 text-[14px] text-ink-soft">{price.rawText}</p>
              <p className="mt-1 text-[12.5px] leading-snug text-muted">
                {tier.detail}
                {/* The classifier's reason is a lowercase fragment ("a rate, not
                    a job price"), so it reads as a because-clause, not a sentence. */}
                {price.reason ? ` It's ${price.reason}.` : ""}
              </p>
              {price.source && (
                <p className="mt-1 text-[12.5px] italic leading-snug text-muted">
                  &ldquo;{truncate(price.source, 130)}&rdquo;
                  {price.document ? ` — ${price.document}` : ""}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function truncate(text, max) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
