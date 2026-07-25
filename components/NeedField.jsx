"use client";

import { useState } from "react";
import { FIELD_TYPES, optionsForNeed } from "@/lib/trades";
import { formatNeedValue } from "@/lib/format";
import { FieldShell, inputClass } from "./ui";

/*
  One renderer for every need, switching on `need.type` only. It never looks at
  `need.key`. That is the whole point — adding a need to the trade definition makes
  a field appear here with no edit to this file.
*/
export default function NeedField({
  trade,
  need,
  value,
  onChange,
  error,
  source,
  suggestion,
  onAcceptSuggestion,
}) {
  const id = `need-${need.key}`;
  const shared = { id, need, value, onChange };

  return (
    <FieldShell id={id} label={need.label} hint={need.hint} error={error}>
      {renderInput(trade, shared)}
      <Provenance
        trade={trade}
        need={need}
        source={source}
        suggestion={suggestion}
        onAccept={onAcceptSuggestion}
      />
    </FieldShell>
  );
}

/*
  Where this answer came from. Two cases worth showing:
    - it came off the website, so quote the sentence it came from
    - it came off the website but has since been overridden, so offer it back
*/
function Provenance({ trade, need, source, suggestion, onAccept }) {
  if (!suggestion) return null;

  if (source === "website") {
    return (
      <p className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] leading-snug text-muted">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">
          From your website
        </span>
        {suggestion.source && (
          <span className="italic">&ldquo;{truncate(suggestion.source, 110)}&rdquo;</span>
        )}
      </p>
    );
  }

  const theirs = formatNeedValue(trade, need, suggestion.value);
  if (!theirs) return null;

  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] leading-snug text-muted">
      <span>
        Your website says <span className="text-ink">{truncate(theirs, 70)}</span>
      </span>
      <button
        type="button"
        onClick={onAccept}
        className="font-medium text-accent hover:underline"
      >
        Use that instead
      </button>
    </p>
  );
}

function truncate(text, max) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function renderInput(trade, props) {
  switch (props.need.type) {
    case FIELD_TYPES.TEXTAREA:
      return <TextArea {...props} />;
    case FIELD_TYPES.CHIPS:
      return <Chips {...props} />;
    case FIELD_TYPES.MONEY:
      return <Money {...props} />;
    case FIELD_TYPES.CHOICE:
      return <Choice trade={trade} {...props} />;
    case FIELD_TYPES.HOURS:
      return <Hours {...props} />;
    case FIELD_TYPES.TEL:
      return <Text {...props} inputMode="tel" type="tel" />;
    default:
      return <Text {...props} />;
  }
}

function Text({ id, need, value, onChange, ...rest }) {
  return (
    <input
      id={id}
      className={inputClass}
      placeholder={need.placeholder}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

function TextArea({ id, need, value, onChange }) {
  return (
    <textarea
      id={id}
      rows={4}
      className={`${inputClass} resize-y leading-relaxed`}
      placeholder={need.placeholder}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Money({ id, need, value, onChange }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-muted">
        $
      </span>
      <input
        id={id}
        inputMode="decimal"
        className={`${inputClass} pl-8`}
        placeholder={need.placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
      />
    </div>
  );
}

function Chips({ id, need, value, onChange }) {
  const items = value ?? [];
  const [draft, setDraft] = useState("");

  const commit = () => {
    const trimmed = draft.trim().replace(/,$/, "");
    if (!trimmed) return;
    if (!items.some((i) => i.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...items, trimmed]);
    }
    setDraft("");
  };

  return (
    <div>
      <input
        id={id}
        className={inputClass}
        placeholder={need.placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Backspace" && !draft && items.length) {
            onChange(items.slice(0, -1));
          }
        }}
      />
      {items.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item}>
              <button
                type="button"
                onClick={() => onChange(items.filter((i) => i !== item))}
                className="group inline-flex items-center gap-1.5 rounded-full bg-canvas py-1.5 pl-3 pr-2.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-line"
              >
                {item}
                <span className="text-faint transition-colors group-hover:text-ink">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                    <path
                      d="M2 2l7 7M9 2l-7 7"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="sr-only">Remove {item}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Choice({ trade, need, value, onChange }) {
  const options = optionsForNeed(trade, need);

  if (need.multiple) {
    const selected = value ?? [];
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const on = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(
                  on
                    ? selected.filter((v) => v !== opt.value)
                    : [...selected, opt.value],
                )
              }
              className={`rounded-full border px-3.5 py-2 text-[14px] font-medium transition-all ${
                on
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-paper text-ink-soft hover:border-line-strong hover:bg-cream"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {options.map((opt) => {
        const on = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(opt.value)}
            className={`rounded-full border px-4 py-2.5 text-[14px] font-medium transition-all ${
              on
                ? "border-ink bg-ink text-white"
                : "border-line bg-paper text-ink-soft hover:border-line-strong hover:bg-cream"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const DEFAULT_DAY = { open: "08:00", close: "17:00" };

function Hours({ need, value, onChange }) {
  const hours = value ?? {};

  const setDay = (dayKey, patch) => {
    const current = hours[dayKey] ?? DEFAULT_DAY;
    onChange({ ...hours, [dayKey]: { ...current, ...patch } });
  };

  const toggleDay = (dayKey) => {
    const next = { ...hours };
    if (next[dayKey]) {
      delete next[dayKey];
    } else {
      next[dayKey] = DEFAULT_DAY;
    }
    onChange(next);
  };

  /* Copying Monday down is the shortcut every trade actually wants. */
  const copyMonToWeekdays = () => {
    const mon = hours.mon;
    if (!mon) return;
    const next = { ...hours };
    for (const d of ["tue", "wed", "thu", "fri"]) next[d] = { ...mon };
    onChange(next);
  };

  return (
    <div className="rounded-[var(--radius-inner)] border border-line bg-paper">
      <ul className="divide-y divide-line">
        {DAYS.map((day) => {
          const open = hours[day.key];
          return (
            <li
              key={day.key}
              className="flex items-center gap-3 px-3.5 py-2.5 sm:gap-4"
            >
              <label className="flex w-[86px] shrink-0 cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={Boolean(open)}
                  onChange={() => toggleDay(day.key)}
                  className="h-4 w-4 shrink-0 accent-[var(--color-ink)]"
                />
                <span className="text-[14px] font-medium text-ink">
                  {day.label}
                </span>
              </label>

              {open ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    type="time"
                    aria-label={`${day.label} opening time`}
                    value={open.open}
                    onChange={(e) => setDay(day.key, { open: e.target.value })}
                    className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[13.5px] text-ink focus:border-accent focus:outline-none"
                  />
                  <span className="text-[13px] text-faint">to</span>
                  <input
                    type="time"
                    aria-label={`${day.label} closing time`}
                    value={open.close}
                    onChange={(e) => setDay(day.key, { close: e.target.value })}
                    className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[13.5px] text-ink focus:border-accent focus:outline-none"
                  />
                </div>
              ) : (
                <span className="flex-1 text-[13.5px] text-faint">Closed</span>
              )}
            </li>
          );
        })}
      </ul>
      {hours.mon && (
        <div className="border-t border-line px-3.5 py-2.5">
          <button
            type="button"
            onClick={copyMonToWeekdays}
            className="text-[13px] font-medium text-accent hover:underline"
          >
            Copy Monday to the rest of the week
          </button>
        </div>
      )}
    </div>
  );
}
