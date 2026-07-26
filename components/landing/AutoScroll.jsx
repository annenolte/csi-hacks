"use client";

import { useEffect, useState } from "react";

/*
  Double-tap S and the page reads itself: a slow, even crawl to the bottom, a
  quick smooth rewind to the top, and round again until S S stops it.

  It is a hands-off tour of a long page — the thing you want running on a
  screen behind you, or when showing the site to someone across a desk.

  Three things keep a global letter binding safe, and they are the same guards
  PressSpace uses. It ignores the key while focus is in a field or on a control,
  because S in a text box types an S. It ignores modified presses, so ⌘S still
  belongs to the browser. And it takes two taps inside DOUBLE_TAP_MS, so a
  stray keystroke can't set the page moving on its own.

  The crawl reads the live scroll position every frame rather than integrating
  its own, so scrolling by hand mid-run just moves where it carries on from
  instead of fighting it. During the rewind — the one stretch with a fixed
  destination — any wheel or touch hands control straight back and resumes the
  crawl from wherever that left the page.
*/

// Roughly a screen every eight seconds: quick enough not to stall on a short
// section, slow enough to read the body copy as it goes.
const SPEED = 120; // px per second
const DOUBLE_TAP_MS = 400;
const HOLD_AT_BOTTOM = 900; // let the footer land before rewinding
const HOLD_AT_TOP = 600; // and the hero settle before setting off again
const REWIND_SPEED = 4200; // px per second
const REWIND_MIN = 600;
const REWIND_MAX = 1800;

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const maxScroll = () =>
  Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

export default function AutoScroll() {
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let lastTap = 0;

    const typing = () => {
      const el = document.activeElement;
      const tag = el?.tagName;
      return (
        el?.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
      );
    };

    const onKey = (e) => {
      if (e.key === "Escape") {
        setRunning(false);
        return;
      }
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() !== "s") return;
      if (typing()) return;

      const now = e.timeStamp;
      if (now - lastTap < DOUBLE_TAP_MS) {
        lastTap = 0;
        setRunning((on) => !on);
      } else {
        lastTap = now;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!running) return;

    // The rewind is the only decorative motion here — the crawl itself is what
    // was asked for — so reduced motion keeps the tour and drops the swoop.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    let phase = "down";
    let last = 0;
    let until = 0; // when the current hold ends
    let from = 0; // rewind start position
    let span = 0; // rewind duration

    const handOverToUser = () => {
      if (phase === "rewind") phase = "down";
    };

    const tick = (now) => {
      frame = requestAnimationFrame(tick);
      const dt = last ? Math.min(now - last, 100) : 0; // a backgrounded tab
      last = now;

      if (phase === "hold") {
        if (now >= until) {
          if (window.scrollY <= 1) {
            phase = "down";
          } else {
            from = window.scrollY;
            span = reduced
              ? 0
              : Math.min(REWIND_MAX, Math.max(REWIND_MIN, (from / REWIND_SPEED) * 1000));
            until = now;
            phase = "rewind";
          }
        }
        return;
      }

      if (phase === "rewind") {
        const t = span ? Math.min(1, (now - until) / span) : 1;
        window.scrollTo(0, from * (1 - easeInOutCubic(t)));
        if (t === 1) {
          phase = "hold";
          until = now + HOLD_AT_TOP;
        }
        return;
      }

      const bottom = maxScroll();
      if (bottom <= 0) return;

      const next = window.scrollY + (SPEED * dt) / 1000;
      if (next >= bottom) {
        window.scrollTo(0, bottom);
        phase = "hold";
        until = now + HOLD_AT_BOTTOM;
        return;
      }
      window.scrollTo(0, next);
    };

    frame = requestAnimationFrame(tick);
    window.addEventListener("wheel", handOverToUser, { passive: true });
    window.addEventListener("touchstart", handOverToUser, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("wheel", handOverToUser);
      window.removeEventListener("touchstart", handOverToUser);
    };
  }, [running]);

  // Nothing to draw. The page moving is the whole indication — a badge pinned
  // over the corner of the design would be visible in every second of the tour
  // it exists to caption.
  return null;
}
