"use client";

import { formatNeedValue } from "@/lib/format";
import { Check } from "./ui";

/*
  The right rail. It renders straight off `slip`, which is built from the trade's
  `needs` — no field names appear here. Whatever the agent will know, this shows.
*/
export default function CallSlip({
  trade,
  slip,
  filledCount,
  fromWebsiteCount,
  documents,
  calendar,
}) {
  if (!trade) return null;

  const total = slip.length;
  const pct = total ? Math.round((filledCount / total) * 100) : 0;

  return (
    <aside className="lg:sticky lg:top-8">
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-cream shadow-lift">
        <header className="border-b border-line px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-medium tracking-[-0.01em] text-ink">
              The call slip
            </h2>
            <span className="text-[13px] tabular-nums text-muted">
              {filledCount}/{total}
            </span>
          </div>
          <p className="mt-1 text-[13px] leading-snug text-muted">
            {fromWebsiteCount > 0
              ? `${fromWebsiteCount} of these came off your website.`
              : "What your agent will know when it picks up."}
          </p>
          <div
            className="mt-3 h-1 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Call slip completeness"
          >
            <div
              className="h-full rounded-full bg-ink transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </header>

        <ul className="divide-y divide-line/70">
          {slip.map(({ need, value, filled, source }) => {
            const display = filled ? formatNeedValue(trade, need, value) : null;
            return (
              <li key={need.key} className="flex gap-3 px-5 py-3">
                <span className="mt-0.5 shrink-0">
                  <Check filled={filled} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[12px] uppercase tracking-[0.06em] text-faint">
                    {need.slipLabel ?? need.label}
                    {filled && source === "website" && (
                      <span
                        title="Read from your website"
                        aria-label="Read from your website"
                        className="h-1.5 w-1.5 rounded-full bg-accent"
                      />
                    )}
                  </p>
                  {display ? (
                    <p className="mt-0.5 break-words text-[14px] leading-snug text-ink">
                      {display}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[14px] leading-snug text-faint">
                      {need.required ? "Still needed" : "Not set"}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <footer className="space-y-1.5 border-t border-line bg-paper/60 px-5 py-4">
          <Line
            label="Documents"
            value={
              documents.length
                ? `${documents.length} ${documents.length === 1 ? "source" : "sources"}`
                : "None yet"
            }
            on={documents.length > 0}
          />
          <Line
            label="Calendar"
            value={calendar.connected ? calendar.provider : "Not connected"}
            on={calendar.connected}
          />
        </footer>
      </div>
    </aside>
  );
}

function Line({ label, value, on }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className={on ? "font-medium text-ink" : "text-faint"}>{value}</span>
    </div>
  );
}
