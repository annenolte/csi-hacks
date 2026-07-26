"use client";

import { useRef, useState } from "react";
import { getTrade } from "@/lib/trades";
import NeedField from "../NeedField";
import { Button, inputClass } from "../ui";
import { COMPONENT } from "@/lib/onboarding/components";
import { readFile, rejectionFor } from "@/lib/documents/read";
import {
  ACCEPT,
  ACCEPT_SUMMARY,
  MAX_DOCUMENTS_PER_UPLOAD,
  byteSize,
  extensionOf,
} from "@/lib/documents/formats";

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
    case COMPONENT.CALENDAR:
      return <Calendar key={key} component={component} onAnswer={onAnswer} />;
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

/*
  What a file looks like on the way in.

  A card per file, appearing the moment it's dropped rather than when it's been
  read. The bytes go to the server and come back as text — a PDF or a workbook is
  parsed there, not here — so there is a real wait to show, and showing it per
  file means the .txt that took 200ms doesn't sit hidden behind the 40-page PDF.
*/
function Documents({ component, onAnswer }) {
  const [files, setFiles] = useState([]);
  const [batchError, setBatchError] = useState(null);
  const [dragging, setDragging] = useState(false);
  /* Ids, not names: two folders can both hand you a "prices.pdf". */
  const nextId = useRef(0);

  const reading = files.some((f) => f.status === "reading");
  const ready = files.filter((f) => f.status === "ready");

  function take(fileList) {
    const dropped = Array.from(fileList ?? []);
    if (!dropped.length) return;

    setBatchError(null);

    const room = MAX_DOCUMENTS_PER_UPLOAD - files.length;
    if (dropped.length > room) {
      setBatchError(
        `That's more than ${MAX_DOCUMENTS_PER_UPLOAD} files. Add the rest afterwards.`,
      );
    }

    for (const file of dropped.slice(0, Math.max(0, room))) {
      const id = nextId.current++;
      const rejection = rejectionFor(file);

      setFiles((current) => [
        ...current,
        {
          id,
          name: file.name,
          bytes: file.size,
          status: rejection ? "error" : "reading",
          error: rejection,
          text: null,
        },
      ]);

      if (rejection) continue;

      /* Each file settles on its own, so the list fills in as they finish. */
      readFile(file).then(({ document, error }) => {
        setFiles((current) =>
          current.map((entry) =>
            entry.id !== id
              ? entry
              : document
                ? { ...entry, status: "ready", text: document.text }
                : { ...entry, status: "error", error },
          ),
        );
      });
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
        {/*
          Read from the format table rather than from `component`, which is
          replayed out of the conversation row and would pin whichever formats
          were current when that turn was written.
        */}
        <input
          type="file"
          multiple
          accept={ACCEPT}
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
          Price lists, service notes, induction sheets. {ACCEPT_SUMMARY}
        </span>
      </label>

      {files.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {files.map((file) => (
            <li key={file.id}>
              <FileCard
                file={file}
                onRemove={() =>
                  setFiles((current) => current.filter((f) => f.id !== file.id))
                }
              />
            </li>
          ))}
        </ul>
      )}

      {batchError && (
        <p role="alert" className="mt-3 text-[13px] text-flag">
          {batchError}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button
          onClick={() =>
            onAnswer({
              /*
                The size travels with the file. The transcript draws a card per
                document on both sides of the round trip, and a card that says
                nothing about how much document arrived is a filename in a box.
              */
              documents: ready.map((f) => ({
                name: f.name,
                text: f.text,
                bytes: f.bytes,
              })),
            })
          }
          disabled={ready.length === 0 || reading}
          chevron
        >
          {reading
            ? "Reading…"
            : ready.length
              ? `Read ${ready.length} file${ready.length === 1 ? "" : "s"}`
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

/*
  One card per file: type badge, name, and what happened to it.

  A refused file keeps its card and says why on it, rather than moving the
  explanation to a list underneath. Dropping five documents and having one
  refused should point at the one — a message with a filename in it, three
  cards away from the card it's about, makes the person do that matching.
*/
function FileCard({ file, onRemove }) {
  const ext = extensionOf(file.name).toUpperCase() || "FILE";
  const failed = file.status === "error";

  return (
    <div
      className={`flex items-start gap-3 rounded-[var(--radius-inner)] border px-3 py-2.5 transition-colors ${
        failed ? "border-flag/30 bg-flag/5" : "border-line bg-canvas"
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[9.5px] font-semibold tracking-[0.02em] ${
          failed ? "bg-flag/10 text-flag" : "bg-paper text-muted"
        }`}
      >
        {ext.slice(0, 4)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-ink">
          {file.name}
        </span>
        {/*
          A rejection wraps; everything else stays on one line. The whole value
          of the message is the second half of it — "save as .docx" — and a
          truncated version tells someone their file was refused and then hides
          the one thing they could do about it.
        */}
        <span
          className={`mt-0.5 flex gap-1.5 text-[12px] ${
            failed ? "items-start text-flag" : "items-center text-muted"
          }`}
        >
          {file.status === "reading" && <Spinner />}
          <span className={failed ? "leading-snug" : "truncate"}>
            {file.status === "reading"
              ? "Reading…"
              : failed
                ? file.error
                : `${byteSize(file.bytes)} · ${wordCount(file.text)} words read`}
          </span>
        </span>
      </span>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="mt-0.5 shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-paper hover:text-flag"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M3.5 3.5l7 7m0-7l-7 7"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className="shrink-0 animate-spin"
    >
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
      <path
        d="M10.5 6A4.5 4.5 0 006 1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/*
  Words, not characters. "12,481 chars" is a number nobody has a feel for; the
  point of the line is to say the file was really read, and roughly how much of
  it there was.
*/
const wordCount = (text) =>
  ((text ?? "").match(/\S+/g)?.length ?? 0).toLocaleString();

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

/*
  The one input that leaves the page.

  A link, not a button that posts an answer: Google's consent screen is a full
  navigation, and the conversation is picked back up when the callback lands
  someone on /onboarding again. Conversation.jsx answers this question on their
  behalf from the flag in the URL, so the transcript reads the same either way.
*/
function Calendar({ component, onAnswer }) {
  return (
    <Panel>
      <p className="text-[13.5px] leading-snug text-muted">
        We ask for read and write access: read to find open slots, write to put a
        booked job in. You can disconnect any time from the dashboard.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <a href="/api/calendar/google/start?next=onboarding">
          <Button chevron>Connect Google Calendar</Button>
        </a>
        <button
          type="button"
          onClick={() => onAnswer({ connected: false })}
          className="text-[13.5px] font-medium text-muted hover:text-ink hover:underline"
        >
          {component.skipLabel}
        </button>
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
