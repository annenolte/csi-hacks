"use client";

import { useEffect, useRef } from "react";

/*
  The black dot that trails the pointer, taken from the reference site. Mounted
  once in the root layout, so it is the same on the landing page, the auth
  screens, the conversation and the dashboard.

  It rides alongside the native cursor rather than replacing it. The reference
  does the same, and the reason is worth keeping: a page that hides the real
  cursor and then drops a frame — or fails to hydrate — leaves someone clicking
  blind. Here the worst case is that a decorative dot doesn't show up.

  Three states, because this now runs over screens people work in rather than
  only ones they read. Over a link or a button it opens into a ring, which
  reads as a target. Over a text field it disappears entirely: the native
  cursor there is an I-beam sitting between two characters, and a 24px disc
  covering the insertion point while someone types is a real cost for a
  decoration. Everywhere else it is the dot.

  Position is written straight to the transform inside a rAF loop, easing
  toward the pointer rather than snapping to it, so it lags the way the
  reference's does. No state, so no re-render per mouse move.
*/
export default function Cursor() {
  const dot = useRef(null);

  useEffect(() => {
    const el = dot.current;
    if (!el) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    // Start off-screen so it doesn't flash at the origin before the first move.
    let x = -100;
    let y = -100;
    let tx = -100;
    let ty = -100;
    let seen = false;
    let frame = 0;

    const TEXT_FIELD =
      "textarea, [contenteditable='true'], input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='file'])";

    const onMove = (e) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!seen) {
        // Jump to the pointer the first time so it doesn't fly in from a corner.
        seen = true;
        x = tx;
        y = ty;
      }

      const target = e.target instanceof Element ? e.target : null;
      const overText = Boolean(target?.closest(TEXT_FIELD));
      const overClickable = Boolean(
        target?.closest("a, button, [role='button'], select, summary, label[for]"),
      );

      el.style.opacity = overText ? "0" : "1";
      el.classList.toggle("is-over", overClickable && !overText);
    };

    const onLeave = () => {
      el.style.opacity = "0";
    };

    const tick = () => {
      // Ease 18% of the remaining distance each frame — enough lag to read as
      // a trail, not so much that it feels detached from the hand.
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <div ref={dot} aria-hidden="true" className="cursor-dot" style={{ opacity: 0 }} />;
}
