"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Wordmark from "../Wordmark";
import { Button } from "../ui";
import Composer from "./Composer";
import { COMPONENT, isAuto } from "@/lib/onboarding/components";

/*
  The onboarding conversation.

  The server owns the script, so this component is thin on purpose: it shows the
  transcript, renders whatever input the last turn asked for, and posts answers
  back. It never decides what comes next — every attempt to make a client smart
  about a server-owned state machine ends with the two disagreeing.
*/
export default function Conversation() {
  const [state, setState] = useState({ messages: [], component: null, business: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const bottom = useRef(null);
  /* Guards the auto-continue effect against firing twice for one working turn. */
  const continuing = useRef(false);

  const apply = useCallback((data) => {
    setState({
      messages: data.messages ?? [],
      component: data.component ?? null,
      business: data.business ?? null,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/onboarding");
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) setError(data.error ?? "Couldn't load your setup.");
        else apply(data);
      } catch {
        if (!cancelled) setError("Couldn't reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apply]);

  const send = useCallback(
    async (answer) => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/onboarding/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(answer === undefined ? {} : { answer }),
        });
        const data = await response.json();
        if (!response.ok) setError(data.error ?? "That didn't go through.");
        else apply(data);
      } catch {
        setError("Couldn't reach the server. Your answers so far are saved.");
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

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
  }, [state.messages, state.component, busy]);

  const finished = state.component?.kind === COMPONENT.DONE;

  return (
    <div className="relative min-h-dvh">
      <div
        aria-hidden="true"
        className="mesh-top pointer-events-none absolute inset-x-0 top-0 h-[240px] opacity-70"
      />

      <div className="relative mx-auto w-full max-w-2xl px-5 py-7 sm:px-6 sm:py-10">
        <header className="flex items-center justify-between">
          <Wordmark href="/" />
          {state.business?.name && (
            <span className="text-[13.5px] text-muted">{state.business.name}</span>
          )}
        </header>

        <div className="mt-10 space-y-6 pb-8">
          {loading && <Typing label="Getting started" />}

          {state.messages.map((message) =>
            message.role === "agent" ? (
              <AgentTurn key={message.id} body={message.body} />
            ) : (
              <UserTurn key={message.id} body={message.body} />
            ),
          )}

          {busy && <Typing />}
          {isAuto(state.component) && !busy && (
            <Typing label={state.component.label} />
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

function AgentTurn({ body }) {
  if (!body) return null;
  return (
    <div className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[13px] text-white"
      >
        ✂
      </span>
      <p className="max-w-[52ch] whitespace-pre-wrap text-[15.5px] leading-relaxed text-ink">
        {body}
      </p>
    </div>
  );
}

function UserTurn({ body }) {
  if (!body) return null;
  return (
    <div className="flex justify-end">
      <p className="max-w-[42ch] rounded-[var(--radius-inner)] rounded-br-md bg-ink px-4 py-2.5 text-[14.5px] leading-relaxed text-white">
        {body}
      </p>
    </div>
  );
}

function Typing({ label }) {
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <span
        aria-hidden="true"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[13px] text-white"
      >
        ✂
      </span>
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
