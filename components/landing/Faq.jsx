"use client";

import { useState } from "react";

/*
  The reference's closing accordion: hairline-separated rows, a + that turns
  into a ×, one panel open at a time.

  Built on button + region rather than details/summary, because the row needs
  to animate its height and a native <details> jumps. aria-expanded and
  aria-controls carry the state that the rotation only shows.
*/
export default function Faq({ items }) {
  const [open, setOpen] = useState(null);

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className={i > 0 ? "border-t border-line" : ""}>
            <h3>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                className="flex w-full items-center gap-4 px-6 py-5 text-left transition-colors hover:bg-cream sm:px-8"
              >
                <span
                  aria-hidden="true"
                  className={`shrink-0 text-[18px] leading-none text-muted transition-transform duration-300 ${
                    isOpen ? "rotate-45" : ""
                  }`}
                >
                  +
                </span>
                <span className="text-[15.5px] font-medium tracking-[-0.01em] text-ink">
                  {item.q}
                </span>
              </button>
            </h3>

            <div
              id={`faq-panel-${i}`}
              role="region"
              hidden={!isOpen}
              className="px-6 pb-6 pl-[3.25rem] sm:px-8 sm:pl-[4.25rem]"
            >
              <p className="max-w-[68ch] text-[14.5px] leading-relaxed text-muted">{item.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
