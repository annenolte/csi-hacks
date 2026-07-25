"use client";

import { useRef, useState } from "react";
import { Button } from "../ui";

/* The payoff screen: the number, the calendar, and what the agent has read. */
export default function Overview({ data, notice, onRefresh }) {
  return (
    <div className="space-y-5">
      <PhoneCard business={data.business} />
      <CalendarCard calendar={data.calendar} notice={notice} onRefresh={onRefresh} />
      <DocumentsCard documents={data.documents} onRefresh={onRefresh} />
    </div>
  );
}

function Card({ children, className = "" }) {
  return (
    <section
      className={`rounded-[var(--radius-card)] border border-line bg-paper p-6 shadow-lift ${className}`}
    >
      {children}
    </section>
  );
}

function CardHead({ title, aside }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-[16px] font-medium tracking-[-0.015em] text-ink">{title}</h2>
      {aside}
    </div>
  );
}

function PhoneCard({ business }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(business.phoneNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard blocked. The number is on screen and selectable regardless. */
    }
  }

  if (!business.phoneNumber) {
    return (
      <Card>
        <CardHead title="Your agent's number" />
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          You&apos;ll get a number when setup is finished.
        </p>
      </Card>
    );
  }

  return (
    <Card className="text-center">
      <p className="text-[12.5px] uppercase tracking-[0.08em] text-muted">
        Your agent&apos;s number
      </p>
      <p className="display mt-2 text-[36px] sm:text-[46px]">{business.phoneNumber}</p>
      <p className="mx-auto mt-3 max-w-[42ch] text-[13.5px] leading-relaxed text-muted">
        Give this to customers. It isn&apos;t connected to a carrier in this
        prototype, so it won&apos;t actually ring.
      </p>
      <div className="mt-5">
        <Button variant="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy number"}
        </Button>
      </div>
    </Card>
  );
}

function CalendarCard({ calendar, notice, onRefresh }) {
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    setBusy(true);
    try {
      await fetch("/api/calendar/disconnect", { method: "POST" });
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHead
        title="Calendar"
        aside={
          <span
            className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${
              calendar.connected ? "bg-accent-soft text-accent" : "bg-canvas text-muted"
            }`}
          >
            {calendar.connected ? "Connected" : "Not connected"}
          </span>
        }
      />

      <p className="mt-2 max-w-[56ch] text-[14px] leading-relaxed text-muted">
        {calendar.connected
          ? `Reading and writing ${calendar.email ? `${calendar.email}'s` : "your"} Google Calendar. This is what the agent will check for free slots and write bookings into.`
          : "Connect Google Calendar so the agent can offer real open slots and put jobs straight into your diary."}
      </p>

      {notice && (
        <p
          role="status"
          className={`mt-3 text-[13px] leading-snug ${
            notice.tone === "error" ? "text-flag" : "text-accent"
          }`}
        >
          {notice.text}
        </p>
      )}

      {!calendar.configured && (
        <p className="mt-3 text-[13px] leading-snug text-muted">
          Google isn&apos;t configured on this server yet — see{" "}
          <code className="rounded bg-canvas px-1 py-0.5 text-[12px]">docs/SETUP.md</code>{" "}
          section 3.
        </p>
      )}

      <div className="mt-5">
        {calendar.connected ? (
          <Button variant="secondary" onClick={disconnect} disabled={busy}>
            {busy ? "Disconnecting…" : "Disconnect"}
          </Button>
        ) : (
          <a href="/api/calendar/google/start">
            <Button disabled={!calendar.configured} chevron>
              Connect Google Calendar
            </Button>
          </a>
        )}
      </div>
    </Card>
  );
}

const MAX_DOC_BYTES = 2 * 1024 * 1024;

function DocumentsCard({ documents, onRefresh }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function add(fileList) {
    setError(null);
    setResult(null);

    const accepted = [];
    for (const file of Array.from(fileList ?? [])) {
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

    if (!accepted.length) return;

    setBusy(true);
    try {
      const response = await fetch("/api/dashboard/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documents: accepted }),
      });
      const data = await response.json();
      if (!response.ok) setError(data.error ?? "Couldn't add that.");
      else {
        setResult(
          data.failure
            ? `Saved, but re-reading failed: ${data.failure}`
            : data.learned
              ? `Read it. ${data.learned} new thing${data.learned === 1 ? "" : "s"} the agent now knows.`
              : "Read it. Nothing new in there the agent didn't already know.",
        );
        onRefresh();
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/dashboard/documents?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Couldn't remove that.");
      } else {
        setResult("Removed, and everything else re-read.");
        onRefresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHead
        title="What the agent has read"
        aside={
          <span className="text-[13px] text-muted">
            {documents.length} document{documents.length === 1 ? "" : "s"}
          </span>
        }
      />

      <p className="mt-2 max-w-[56ch] text-[14px] leading-relaxed text-muted">
        Add or remove anything and the agent re-reads everything from scratch —
        a removed document takes what it taught with it.
      </p>

      {documents.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-[var(--radius-inner)] border border-line">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-start gap-3 px-3.5 py-3">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-ink">
                    {doc.name}
                  </span>
                  {doc.kind === "url" && (
                    <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
                      Website
                    </span>
                  )}
                </span>
                {doc.preview && (
                  <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                    {doc.preview}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => remove(doc.id)}
                disabled={busy}
                className="shrink-0 text-[12.5px] font-medium text-muted hover:text-flag disabled:opacity-40"
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
      {result && (
        <p role="status" className="mt-3 text-[13px] text-muted">
          {result}
        </p>
      )}

      <div className="mt-5">
        <input
          ref={input}
          type="file"
          multiple
          accept=".txt,.md,.markdown,.csv"
          className="sr-only"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          variant="secondary"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          {busy ? "Re-reading everything…" : "Add a document"}
        </Button>
      </div>
    </Card>
  );
}
