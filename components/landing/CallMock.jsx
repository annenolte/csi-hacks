"use client";

import { useEffect, useRef, useState } from "react";
import { PRODUCT_NAME } from "@/lib/brand";

/*
  The reference's blue panel holds a chat between a person and the product.
  Ours holds the thing the product is actually for: a call, at an hour nobody
  is picking up the phone.

  Every answer in it is one the dashboard mock shows the agent having read:
  the hours, the patch, the drain price, so the two illustrations agree. The
  last line is the point of the whole product: it books.

  It plays rather than sits there. The exchange starts when the panel is on
  screen and lands a line at a time, with the agent thinking before it answers,
  because a call is a thing that happens in order and a static transcript makes
  the reader do that work themselves.

  Two rules keep the motion honest. Every line is in the DOM from the first
  paint at its final size and only its opacity changes, so nothing below the
  panel moves while the conversation plays. And the whole thing is aria-hidden
  under one figure label that already describes the call end to end, so a
  screen reader gets the complete exchange immediately rather than a transcript
  that arrives on a timer.
*/

/*
  The beats, in order. `think` is how long the agent is composing before its
  line lands (the caller gets a beat of silence instead of dots — they are
  talking, not typing); `pause` is the breath after it lands.
*/
const BEATS = [
  { who: "caller", think: 260, pause: 620 },
  { who: "agent", think: 1150, pause: 900 },
  { who: "caller", think: 700, pause: 620 },
  { who: "agent", think: 1450, pause: 0 },
];

export default function CallMock() {
  /* How many lines have landed, and which one is being composed (-1 for none). */
  const [landed, setLanded] = useState(0);
  const [composing, setComposing] = useState(-1);
  const figure = useRef(null);

  /* Play once, when the panel is actually on screen — a conversation that ran
     while it was three sections below is one nobody saw happen. */
  useEffect(() => {
    const el = figure.current;
    if (!el) return;

    const still =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    const timers = [];

    /* Reduced motion, or no observer to tell us when we're visible: the whole
       exchange is simply already there. The failure mode is a static panel,
       never an empty one. */
    if (still || typeof IntersectionObserver === "undefined") {
      timers.push(setTimeout(() => setLanded(BEATS.length), 0));
      return () => timers.forEach(clearTimeout);
    }

    const play = (i) => {
      if (i >= BEATS.length) return;
      const beat = BEATS[i];
      setComposing(i);
      timers.push(
        setTimeout(() => {
          setComposing(-1);
          setLanded(i + 1);
          timers.push(setTimeout(() => play(i + 1), beat.pause));
        }, beat.think),
      );
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        play(0);
      },
      { threshold: 0.25 },
    );

    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  const shown = (i) => i < landed;

  return (
    <figure
      ref={figure}
      role="img"
      aria-label={`An illustration of a call: a customer asks about a blocked drain at 7:40pm on a Sunday, and the ${PRODUCT_NAME} agent answers with the business's own hours, callout fee and price, then books the first free slot.`}
      className="rounded-[28px] bg-[linear-gradient(180deg,#a9d9fb_0%,#cfe7fb_38%,#e9e6e1_100%)] p-6 sm:p-10"
    >
      <div aria-hidden="true" className="mx-auto max-w-[520px] select-none">
        <p className="mb-5 text-center text-[12px] text-ink-soft/70">
          Sunday, 7:41pm, incoming call
        </p>

        <Caller shown={shown(0)}>
          Hi, my kitchen drain is completely blocked. Are you even open?
        </Caller>

        <Agent shown={shown(1)} composing={composing === 1}>
          <p>
            We&apos;re closed right now. Mon–Fri 7 to 6, Saturdays 8 to 2. I can still
            get you booked.
          </p>
          <p className="mt-2.5">Where are you?</p>
        </Agent>

        <Caller shown={shown(2)}>Berkeley, near Ashby.</Caller>

        <Agent shown={shown(3)} composing={composing === 3}>
          <p>That&apos;s in our patch. Here&apos;s where we land:</p>
          <ul className="mt-3 space-y-2">
            <Row label="Drain unblock">$180 flat, from the price list</Row>
            <Row label="Out of hours">$95 callout on top, after 6pm</Row>
            <Row label="First slot">Monday 8:30am with Dave</Row>
          </ul>
          <p className="mt-3 text-[13px] italic text-muted">
            Want me to hold Monday 8:30, or find something sooner?
          </p>
          <span className="mt-4 block rounded-[14px] bg-canvas py-2.5 text-center text-[13px] font-medium text-ink">
            Book Monday 8:30am
          </span>
        </Agent>
      </div>
    </figure>
  );
}

function Caller({ shown, children }) {
  return (
    <div className="mb-4 flex justify-end">
      <p
        className={`msg max-w-[86%] origin-bottom-right rounded-[18px] bg-accent px-4 py-3 text-[14px] leading-snug text-white ${
          shown ? "is-shown" : ""
        }`}
      >
        {children}
      </p>
    </div>
  );
}

/*
  The dots sit exactly where the bubble will be, because the row is holding
  that space already. It reads as one thing arriving rather than two.
*/
function Agent({ shown, composing, children }) {
  return (
    <div className="relative mb-4">
      {composing && (
        <div className="msg is-shown absolute left-0 top-0 flex items-start gap-2.5">
          <Avatar />
          <span className="flex items-center gap-1 rounded-[18px] bg-paper px-4 py-3.5 shadow-lift">
            {[0, 1, 2].map((i) => (
              <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-ink" />
            ))}
          </span>
        </div>
      )}

      <div
        className={`msg flex origin-bottom-left items-start gap-2.5 ${shown ? "is-shown" : ""}`}
      >
        <Avatar />
        <div className="max-w-[86%] rounded-[18px] bg-paper px-4 py-3 text-[14px] leading-snug text-ink shadow-lift">
          {children}
        </div>
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-medium text-white">
      {PRODUCT_NAME.slice(0, 1)}
    </span>
  );
}

function Row({ label, children }) {
  return (
    <li className="rounded-[12px] border border-line px-3 py-2 text-[13px]">
      <span className="font-medium text-ink">{label}: </span>
      <span className="text-ink-soft">{children}</span>
    </li>
  );
}
