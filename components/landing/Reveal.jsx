"use client";

import { useEffect, useRef } from "react";

/*
  Fade-and-rise on entry, the reference's scroll behaviour without its scroll
  library.

  The element starts at opacity 0 in CSS and an IntersectionObserver adds
  .is-in once, then stops observing — content that has arrived should not be
  able to leave again, or scrolling back up plays the whole page a second time.

  If IntersectionObserver is missing the class goes on immediately, so the
  failure mode is "no animation", never "invisible page".
*/
export default function Reveal({ children, delay = 0, className = "", as: Tag = "div" }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-in");
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.classList.add("is-in");
        io.disconnect();
      },
      // Fire a little before the top edge, so it has finished by the time the
      // element is properly in view rather than animating under the reader.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={`reveal ${className}`} style={{ "--delay": `${delay}ms` }}>
      {children}
    </Tag>
  );
}
