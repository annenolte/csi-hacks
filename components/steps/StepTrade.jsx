"use client";

import { TRADES } from "@/lib/trades";
import { ScriptNote } from "../ui";

export default function StepTrade({ trade, chooseTrade }) {
  return (
    <div>
      <StepHeading
        lead="What do you do?"
        rest="We only ask for the things a caller actually asks about, and that depends on the trade."
      />

      <div className="mt-3 mb-8">
        <ScriptNote>Plumbing is ready first</ScriptNote>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {TRADES.map((t) => {
          const selected = trade?.id === t.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                disabled={!t.available}
                aria-pressed={selected}
                onClick={() => chooseTrade(t.id)}
                className={`group flex w-full items-start gap-3.5 rounded-[var(--radius-card)] border p-4 text-left transition-all ${
                  selected
                    ? "border-ink bg-paper shadow-pop"
                    : t.available
                      ? "border-line bg-paper hover:-translate-y-px hover:border-line-strong hover:shadow-lift"
                      : "cursor-not-allowed border-line bg-paper/50 opacity-55"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-canvas text-[19px]"
                >
                  {t.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[15.5px] font-medium tracking-[-0.01em] text-ink">
                      {t.label}
                    </span>
                    {!t.available && (
                      <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
                        Soon
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">
                    {t.blurb}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* Two-tone headline from the reference: black lead clause, grey continuation. */
export function StepHeading({ lead, rest }) {
  return (
    <h1 className="display max-w-[34ch] text-[30px] sm:text-[38px]">
      <span className="text-ink">{lead}</span>{" "}
      <span className="text-muted">{rest}</span>
    </h1>
  );
}
