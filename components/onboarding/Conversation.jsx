"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppHeader from "../AppHeader";
import Mark from "../Mark";
import { Button } from "../ui";
import Composer from "./Composer";
import { getTrade } from "@/lib/trades";
import { attachmentsIn, describeAnswer } from "@/lib/onboarding/describe";
import { COMPONENT, isAuto } from "@/lib/onboarding/components";
import { byteSize, extensionOf } from "@/lib/documents/formats";

/*
  The onboarding conversation.

  The server owns the script, so this component is thin on purpose: it shows the
  transcript, renders whatever input the last turn asked for, and posts answers
  back. It never decides what comes next — every attempt to make a client smart
  about a server-owned state machine ends with the two disagreeing.

  Two things it does decide, and both are about time rather than script. The
  answer someone just gave is echoed into the transcript immediately, before the
  server has confirmed anything, because a click that produces nothing for four
  seconds reads as a click that didn't register. And the agent's reply is drawn
  as it streams. Both are provisional: when the finished turn arrives it replaces
  them wholesale with what was actually saved.
*/
export default function Conversation() {
  const [state, setState] = useState({ messages: [], component: null, business: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  /* What the person just answered, until the server sends the saved version. */
  const [pending, setPending] = useState(null);
  /* The agent's reply so far, mid-stream. */
  const [streamed, setStreamed] = useState("");
  /* A message from the calendar round trip, which happens off this page. */
  const [notice, setNotice] = useState(null);

  const bottom = useRef(null);
  /* Guards the auto-continue effect against firing twice for one working turn. */
  const continuing = useRef(false);
  /*
    The live component and trade, for describing an answer the moment it's given.
    Refs rather than state so `send` doesn't have to be rebuilt on every turn —
    the auto-continue effect depends on its identity.
  */
  const live = useRef({ component: null, tradeId: null });

  const apply = useCallback((data) => {
    live.current = {
      component: data.component ?? null,
      tradeId: data.business?.tradeId ?? null,
    };
    setState({
      messages: data.messages ?? [],
      component: data.component ?? null,
      business: data.business ?? null,
    });
  }, []);

  const send = useCallback(
    async (answer) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      setStreamed("");

      /*
        The echo. Same two functions the server uses to write the transcript, so
        the bubble and the file cards that appear on click are the ones that
        replace them a moment later — a wording that changed under them would be
        worse than the wait.
      */
      const echo = describeAnswer({
        trade: getTrade(live.current.tradeId),
        component: live.current.component,
        answer,
      });
      const attached = attachmentsIn(answer);
      setPending(echo || attached.length ? { body: echo, attachments: attached } : null);

      try {
        const response = await fetch("/api/onboarding/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(answer === undefined ? {} : { answer }),
        });

        /* An auth or config failure never reaches the stream — it's plain JSON. */
        if (!response.body || !response.headers.get("content-type")?.includes("ndjson")) {
          const data = await response.json().catch(() => ({}));
          setError(data.error ?? "That didn't go through.");
          setPending(null);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";
        let finished = false;

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          /* The tail is whatever arrived without its newline yet. */
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;

            let frame;
            try {
              frame = JSON.parse(line);
            } catch {
              continue;
            }

            if (frame.type === "delta") {
              text += frame.text;
              setStreamed(text);
            } else if (frame.type === "done") {
              finished = true;
              apply(frame);
              setPending(null);
              setStreamed("");
            } else if (frame.type === "error") {
              finished = true;
              setError(frame.error ?? "That didn't go through.");
              setPending(null);
              setStreamed("");
            }
          }
        }

        if (!finished) {
          setError("The connection dropped before that finished. Your answers are saved.");
          setPending(null);
          setStreamed("");
        }
      } catch {
        setError("Couldn't reach the server. Your answers so far are saved.");
        setPending(null);
        setStreamed("");
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/onboarding");
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error ?? "Couldn't load your setup.");
          return;
        }

        apply(data);
        resumeFromCalendar(data, { send, setNotice });
      } catch {
        if (!cancelled) setError("Couldn't reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apply, send]);

  /*
    A working stage takes no input — the agent is reading a website or a pile of
    documents. The client asks the server to carry on straight away, which is what
    turns a 40-second wait into a visible "reading your website" state instead of
    a page that looks frozen.

    The `error` guard is load-bearing. A working stage that fails leaves the
    component as-is, so without it the effect would fire again the moment `busy`
    clears and hammer a failing endpoint forever. Stopping on the first error
    leaves the retry button in front of the person instead.
  */
  useEffect(() => {
    if (!isAuto(state.component) || busy || error || continuing.current) return;
    continuing.current = true;
    send().finally(() => {
      continuing.current = false;
    });
  }, [state.component, busy, error, send]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.messages, state.component, pending, streamed, busy]);

  const finished = state.component?.kind === COMPONENT.DONE;
  /*
    One of these three at a time, never two: the words as they stream, a named
    wait, or dots. A working stage keeps its label whether or not a request is in
    flight — there is a tick between the stage landing and the client asking the
    server to carry on, and blinking the label off for it reads as a stutter.
  */
  const working = isAuto(state.component);
  const waiting = (busy || working) && !streamed;

  return (
    <div className="relative min-h-dvh">
      <div
        aria-hidden="true"
        className="mesh-top pointer-events-none absolute inset-x-0 top-0 h-[280px]"
      />

      <div className="relative mx-auto w-full max-w-2xl px-5 py-7 sm:px-6 sm:py-10">
        <AppHeader business={state.business} />

        <div className="mt-10 space-y-6 pb-8">
          {loading && <Typing label="Getting started" />}

          {state.messages.map((message) =>
            message.role === "agent" ? (
              <AgentTurn key={message.id} body={message.body} />
            ) : (
              <UserTurn
                key={message.id}
                body={message.body}
                attachments={attachmentsIn(message.answer)}
              />
            ),
          )}

          {pending && (
            <UserTurn body={pending.body} attachments={pending.attachments} pending />
          )}

          {streamed && <AgentTurn body={streamed} />}

          {waiting && <Typing label={working ? state.component.label : undefined} />}

          {notice && (
            <div
              role="status"
              className="rounded-[var(--radius-inner)] border border-line bg-cream px-4 py-3 text-[13.5px] leading-relaxed text-ink-soft"
            >
              {notice}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-[var(--radius-inner)] border border-flag/30 bg-flag/5 px-4 py-3 text-[13.5px] leading-relaxed text-flag"
            >
              <p>{error}</p>
              {/*
                Only offer a retry on a working stage. Everywhere else the input
                is still on screen, and re-posting with no answer would advance
                the script as though the person had skipped the question.
              */}
              {isAuto(state.component) && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    send();
                  }}
                  className="mt-2 font-medium underline"
                >
                  Try that again
                </button>
              )}
            </div>
          )}

          {finished ? (
            <Finished phoneNumber={state.component.phoneNumber} />
          ) : (
            <Composer
              component={state.component}
              tradeId={state.business?.tradeId}
              busy={busy || loading}
              onAnswer={send}
            />
          )}

          <div ref={bottom} />
        </div>
      </div>
    </div>
  );
}

/*
  Picking the conversation back up after Google.

  Connecting a calendar means leaving the page, so the answer to that question
  arrives as a query string rather than a click. A success answers it and moves
  on; a failure leaves the question standing with the reason above it, because
  the one thing worse than not connecting is being advanced past the offer as
  though you had.
*/
function resumeFromCalendar(data, { send, setNotice }) {
  const params = new URLSearchParams(window.location.search);
  const outcome = params.get("calendar");
  if (!outcome) return;

  /* Don't leave it in the URL to be re-applied on the next reload. */
  window.history.replaceState({}, "", window.location.pathname);

  if (data.component?.kind !== COMPONENT.CALENDAR) return;

  if (outcome === "connected") {
    send({ connected: true });
  } else {
    setNotice(params.get("reason") ?? "That didn't connect. You can try again below.");
  }
}

/* The agent's face, wherever it speaks — the brand mark, so the thing
   answering here is visibly the thing that will answer the phone. */
function AgentAvatar({ className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-white ${className}`}
    >
      <Mark className="h-[15px] w-[15px]" />
    </span>
  );
}

function AgentTurn({ body }) {
  if (!body) return null;
  return (
    <div className="flex gap-3">
      <AgentAvatar className="mt-0.5" />
      <p className="max-w-[52ch] whitespace-pre-wrap text-[15.5px] leading-relaxed text-ink">
        {body}
      </p>
    </div>
  );
}

/*
  What the person said, and what they sent.

  Files are shown as the files themselves rather than as a sentence naming them.
  A document is a thing someone recognises on sight — the shape of the box, the
  format, the name they gave it — and three of them in a row is a legible record
  of what was handed over, where "prices.pdf, hours.docx, induction.docx" is a
  line of text to be parsed. The cards sit above the bubble, in the order they
  were sent, on the person's own side of the conversation.
*/
function UserTurn({ body, attachments = [], pending = false }) {
  if (!body && attachments.length === 0) return null;

  return (
    <div
      className={`flex flex-col items-end gap-2 transition-opacity ${
        pending ? "opacity-70" : ""
      }`}
    >
      {attachments.length > 0 && (
        <ul className="flex max-w-full flex-wrap justify-end gap-2">
          {attachments.map((file, i) => (
            <li key={`${file.name}:${i}`}>
              <SentFile file={file} />
            </li>
          ))}
        </ul>
      )}

      {body && (
        <p className="max-w-[42ch] rounded-[var(--radius-inner)] rounded-br-md bg-ink px-4 py-2.5 text-[14.5px] leading-relaxed text-white">
          {body}
        </p>
      )}
    </div>
  );
}

/*
  One sent document.

  A square, because the thing it stands for is a page. The format badge is the
  same one the upload cards and the dashboard's document list use, so a file
  looks like itself everywhere in the product — and it is the badge, not the
  extension buried at the end of a truncated name, that says at a glance which of
  these was the PDF.
*/
function SentFile({ file }) {
  const ext = extensionOf(file.name).toUpperCase() || "FILE";
  const size = byteSize(file.bytes);

  return (
    <div
      title={file.name}
      className="flex h-[104px] w-[104px] flex-col justify-between rounded-[var(--radius-inner)] border border-line bg-paper p-3 shadow-lift"
    >
      <span
        aria-hidden="true"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-canvas text-[9px] font-semibold tracking-[0.02em] text-muted"
      >
        {ext.slice(0, 4)}
      </span>

      <span className="min-w-0">
        {/*
          Two lines and then an ellipsis. `break-words` rather than `break-all`,
          so "new-hire-notes.txt" wraps at its hyphen instead of mid-word, and
          only a name with nowhere to break gets split arbitrarily. A box this
          size can't show both ends of a long filename; the whole of it is on the
          title attribute.
        */}
        <span className="line-clamp-2 break-words text-[11.5px] font-medium leading-tight text-ink">
          {file.name}
        </span>
        {size && (
          <span className="mt-1 block text-[10.5px] leading-none text-faint">{size}</span>
        )}
      </span>
    </div>
  );
}

function Typing({ label }) {
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <AgentAvatar />
      <span className="flex items-center gap-1.5 text-[14px] text-muted">
        {label && <span>{label}</span>}
        <Dots />
      </span>
    </div>
  );
}

function Dots() {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-faint"
          style={{ animationDelay: `${i * 160}ms`, animationDuration: "1.1s" }}
        />
      ))}
    </span>
  );
}

function Finished({ phoneNumber }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-paper p-7 text-center shadow-lift">
      <p className="text-[13px] uppercase tracking-[0.08em] text-muted">
        Your agent&apos;s number
      </p>
      <p className="display mt-2 text-[34px] sm:text-[42px]">{phoneNumber}</p>
      <p className="mx-auto mt-3 max-w-[38ch] text-[14px] leading-relaxed text-muted">
        Give this to customers. It isn&apos;t connected to a carrier in this
        prototype, so it won&apos;t actually ring.
      </p>
      <div className="mt-7">
        <Link href="/dashboard">
          <Button chevron>Go to your dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
