"use client";

import { useState } from "react";
import { getTrade } from "@/lib/trades";
import NeedField from "../NeedField";
import { Button, inputClass } from "../ui";
import { COMPONENT } from "@/lib/onboarding/components";

/*
  Renders whatever structured input the agent put up, and hands the answer back.

  It switches on `component.kind` and nothing else — the same discipline
  NeedField applies to `need.type`. Adding a component kind means adding a case
  here and a builder in lib/onboarding/components.js, and nowhere else.
*/
export default function Composer({ component, tradeId, busy, onAnswer }) {
  if (!component || busy) return null;

  /*
    A key that changes with the question. React reconciles by position, so
    without it the gap interview — which renders a NeedField for question after
    question in the same slot — would keep the previous question's local state
    and show someone their service area prefilled into the hours field.
  */
  const key = `${component.kind}:${component.needKey ?? component.question?.id ?? ""}`;

  switch (component.kind) {
    case COMPONENT.CARDS:
      return <Cards key={key} component={component} onAnswer={onAnswer} />;
    case COMPONENT.URL:
      return <UrlInput key={key} component={component} onAnswer={onAnswer} />;
    case COMPONENT.DOCUMENTS:
      return <Documents key={key} component={component} onAnswer={onAnswer} />;
    case COMPONENT.NEED:
      return (
        <Need key={key} component={component} tradeId={tradeId} onAnswer={onAnswer} />
      );
    case COMPONENT.FOLLOWUP:
      return <Followup key={key} component={component} onAnswer={onAnswer} />;
    default:
      return null;
  }
}

/** Every input sits in the same card, so the eye knows where to go each turn. */
function Panel({ children, className = "" }) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-line bg-paper p-5 shadow-lift ${className}`}
    >
      {children}
    </div>
  );
}

function Cards({ component, onAnswer }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {component.options.map((option) => (
        <li key={option.value}>
          <button
            type="button"
            disabled={!option.available}
            onClick={() => onAnswer({ value: option.value })}
            className={`group flex w-full items-start gap-3.5 rounded-[var(--radius-card)] border p-4 text-left transition-all ${
              option.available
                ? "border-line bg-paper shadow-lift hover:-translate-y-px hover:border-line-strong hover:shadow-pop"
                : "cursor-not-allowed border-line bg-paper/50 opacity-55"
            }`}
          >
            <span
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-canvas text-[19px]"
            >
              {option.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[15.5px] font-medium tracking-[-0.01em] text-ink">
                  {option.label}
                </span>
                {!option.available && (
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
                    Soon
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">
                {option.blurb}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function UrlInput({ component, onAnswer }) {
  const [value, setValue] = useState("");

  return (
    <Panel>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onAnswer({ url: value.trim() });
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <input
          autoFocus
          className={`${inputClass} flex-1`}
          placeholder={component.placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Website address"
        />
        <Button type="submit" disabled={!value.trim()} chevron>
          Read it
        </Button>
      </form>

      <button
        type="button"
        onClick={() => onAnswer({ skip: true })}
        className="mt-3 text-[13.5px] font-medium text-muted hover:text-ink hover:underline"
      >
        {component.skipLabel}
      </button>
    </Panel>
  );
}

const MAX_DOC_BYTES = 2 * 1024 * 1024;

function Documents({ component, onAnswer }) {
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);

  async function take(fileList) {
    setError(null);
    const accepted = [];

    for (const file of Array.from(fileList ?? [])) {
      /*
        Text only, checked here and again on the server. We quote sentences back
        as the source of every fact, so a format we'd have to guess our way
        through would put unverifiable quotes in front of the owner.
      */
      if (!/\.(txt|md|markdown|csv)$/i.test(file.name)) {
        setError(`${file.name} isn't a text file. Plain text, markdown or CSV.`);
        continue;
      }
      if (file.size > MAX_DOC_BYTES) {
        setError(`${file.name} is too big — 2 MB is the limit.`);
        continue;
      }

      accepted.push({ name: file.name, text: await file.text() });
    }

    if (accepted.length) {
      setFiles((current) => [
        ...current,
        ...accepted.filter((a) => !current.some((c) => c.name === a.name)),
      ]);
    }
  }

  return (
    <Panel>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-inner)] border border-dashed px-6 py-8 text-center transition-colors ${
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-cream"
        }`}
      >
        <input
          type="file"
          multiple
          accept={component.accept}
          className="sr-only"
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="text-[14.5px] font-medium text-ink">
          Drop files here, or click to choose
        </span>
        <span className="mt-1 text-[13px] text-muted">
          Plain text, markdown or CSV. Price lists, service notes, induction sheets.
        </span>
      </label>

      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((file) => (
            <li
              key={file.name}
              className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                {file.name}
              </span>
              <span className="shrink-0 text-[12.5px] text-faint">
                {file.text.length.toLocaleString()} chars
              </span>
              <button
                type="button"
                onClick={() => setFiles(files.filter((f) => f.name !== file.name))}
                className="shrink-0 text-[12.5px] font-medium text-muted hover:text-flag"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[13px] text-flag">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button
          onClick={() => onAnswer({ documents: files })}
          disabled={files.length === 0}
          chevron
        >
          {files.length
            ? `Read ${files.length} file${files.length === 1 ? "" : "s"}`
            : "Read them"}
        </Button>
        <button
          type="button"
          onClick={() => onAnswer({ documents: [] })}
          className="text-[13.5px] font-medium text-muted hover:text-ink hover:underline"
        >
          {component.skipLabel}
        </button>
      </div>
    </Panel>
  );
}

function Need({ component, tradeId, onAnswer }) {
  const trade = getTrade(tradeId);
  const need = trade?.needs.find((n) => n.key === component.needKey);
  /* Prefilled with whatever is already known, so a correction is an edit. */
  const [value, setValue] = useState(component.current ?? null);
  const conflicts = component.conflicts ?? [];

  if (!need) return null;

  return (
    <Panel>
      {conflicts.length > 0 && (
        <div className="mb-4 rounded-[var(--radius-inner)] border border-line bg-cream p-3.5">
          <p className="text-[13px] font-medium text-ink">
            Your documents say two different things:
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {conflicts.map((conflict, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onAnswer({ value: conflict.value })}
                  className="rounded-full border border-line bg-paper px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white"
                >
                  {conflict.display}
                  {conflict.document && (
                    <span className="ml-1.5 font-normal opacity-60">
                      {conflict.document}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[12.5px] text-muted">
            Pick one, or set it yourself below if neither is right.
          </p>
        </div>
      )}

      {/*
        The same component the dashboard uses to edit this field. Both read the
        same `needs` array, so a question here and the field it fills can never
        drift apart — which is the point of the trade definition driving both.
      */}
      <NeedField trade={trade} need={need} value={value} onChange={setValue} />

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button onClick={() => onAnswer({ value })} chevron>
          Save
        </Button>
        {!need.required && (
          <button
            type="button"
            onClick={() => onAnswer({ value: null })}
            className="text-[13.5px] font-medium text-muted hover:text-ink hover:underline"
          >
            Skip this one
          </button>
        )}
      </div>
    </Panel>
  );
}

function Followup({ component, onAnswer }) {
  const question = component.question;
  const [text, setText] = useState("");

  if (question.kind === "choice") {
    return (
      <Panel>
        {question.why && (
          <p className="mb-3 text-[13.5px] leading-snug text-muted">{question.why}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {question.options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onAnswer({ value: option.value })}
              className="rounded-full border border-line bg-paper px-4 py-2.5 text-[14px] font-medium text-ink-soft transition-all hover:border-ink hover:bg-ink hover:text-white"
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onAnswer({ value: null })}
          className="mt-3 text-[13.5px] font-medium text-muted hover:text-ink hover:underline"
        >
          Skip this one
        </button>
      </Panel>
    );
  }

  return (
    <Panel>
      {question.why && (
        <p className="mb-3 text-[13.5px] leading-snug text-muted">{question.why}</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAnswer({ value: text.trim() || null });
        }}
      >
        <textarea
          autoFocus
          rows={3}
          className={`${inputClass} resize-y leading-relaxed`}
          placeholder="In your own words…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button type="submit" chevron>
            Save
          </Button>
          <button
            type="button"
            onClick={() => onAnswer({ value: null })}
            className="text-[13.5px] font-medium text-muted hover:text-ink hover:underline"
          >
            Skip this one
          </button>
        </div>
      </form>
    </Panel>
  );
}
