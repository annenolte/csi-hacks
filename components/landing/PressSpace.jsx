"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/*
  The reference ends its footer with "Press Space to start your free trial", and
  the key really works. It is the last thing on a long page — someone who has
  read the whole thing shouldn't have to scroll back up to act on it.

  Two guards make a global Space binding safe. It only listens once the footer
  is on screen, so Space is an ordinary page-down everywhere else on the page.
  And it ignores the key while focus is in a field or on a control, because
  Space in a text box types a space and Space on a button presses it — stealing
  either would be a worse bug than the shortcut is a feature.
*/
export default function PressSpace({ href, children }) {
  const router = useRouter();
  const hint = useRef(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = hint.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setArmed(entry.isIntersecting), {
      threshold: 0.5,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!armed) return;

    const onKey = (e) => {
      if (e.code !== "Space" || e.metaKey || e.ctrlKey || e.altKey) return;

      const el = document.activeElement;
      const tag = el?.tagName;
      if (
        el?.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON" ||
        tag === "A"
      ) {
        return;
      }

      e.preventDefault();
      router.push(href);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed, href, router]);

  return (
    <span ref={hint} className="inline-flex items-center gap-2.5 text-[14px] text-muted">
      Press
      <kbd
        className={`rounded-full border px-4 py-1.5 font-sans text-[13px] transition-colors duration-300 ${
          armed ? "border-line-strong text-ink" : "border-line text-faint"
        }`}
      >
        Space ␣
      </kbd>
      {children}
    </span>
  );
}
