"use client";

import { StepHeading } from "./StepTrade";

/*
  Phase 1 is a stub on purpose — real OAuth lands with the booking table in Phase 4.
  It records intent so the review screen and the call slip have something true to say.
*/

const PROVIDERS = [
  { id: "google", label: "Google Calendar", icon: "📅" },
  { id: "outlook", label: "Outlook", icon: "📆" },
  { id: "none", label: "Skip for now", icon: "⏭️", plain: true },
];

export default function StepCalendar({ calendar, setCalendar }) {
  return (
    <div>
      <StepHeading
        lead="Where do jobs land?"
        rest="The agent needs somewhere to put a booking, and something to check before it promises a time."
      />

      <ul className="mt-9 space-y-3">
        {PROVIDERS.map((p) => {
          const selected =
            p.id === "none"
              ? calendar.provider === null && calendar.touched
              : calendar.provider === p.label;
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  setCalendar(
                    p.id === "none"
                      ? { provider: null, connected: false, touched: true }
                      : { provider: p.label, connected: true, touched: true },
                  )
                }
                className={`flex w-full items-center gap-3.5 rounded-[var(--radius-card)] border p-4 text-left transition-all ${
                  selected
                    ? "border-ink bg-paper shadow-pop"
                    : "border-line bg-paper hover:-translate-y-px hover:border-line-strong hover:shadow-lift"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-canvas text-[18px]"
                >
                  {p.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15.5px] font-medium tracking-[-0.01em] text-ink">
                    {p.label}
                  </span>
                  <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">
                    {p.plain
                      ? "You'll get the call details and book it yourself."
                      : "We'll read your free slots and write bookings back."}
                  </span>
                </span>
                {selected && (
                  <span className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-[12px] font-medium text-white">
                    Chosen
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-[13.5px] leading-relaxed text-muted">
        Connecting is stubbed while we build — picking one here just records what you
        want. Nothing reaches your real calendar yet.
      </p>
    </div>
  );
}
