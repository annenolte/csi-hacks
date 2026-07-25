"use client";

/* Primitives matching design/references/*.png: pill geometry, hairline borders,
   soft lift, near-black ink, handwritten script for asides. */

export function Button({
  children,
  variant = "primary",
  chevron = false,
  className = "",
  ...props
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full text-[15px] font-medium " +
    "transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 " +
    "focus-visible:outline-accent disabled:opacity-40 disabled:pointer-events-none";

  const variants = {
    primary:
      "bg-ink text-white px-6 py-3 shadow-lift hover:shadow-pop hover:-translate-y-px active:translate-y-0",
    secondary:
      "bg-paper text-ink px-6 py-3 border border-line hover:border-line-strong hover:bg-cream",
    ghost: "text-muted px-4 py-2.5 hover:text-ink",
  };

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
      {chevron && <Chevron />}
    </button>
  );
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M5 3l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Card({ children, className = "", ...props }) {
  return (
    <div
      className={`bg-paper border border-line rounded-[var(--radius-card)] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

/*
  The handwritten aside with a hand-drawn arrow, straight off the reference hero.
  Decorative: the arrow is aria-hidden, the text stays readable to screen readers.
*/
export function ScriptNote({ children, color = "green", className = "" }) {
  const tone =
    color === "blue" ? "text-script-blue" : "text-script-green";
  return (
    <span className={`script inline-flex items-end gap-1 ${tone} ${className}`}>
      <span className="text-[22px] leading-none -rotate-2">{children}</span>
      <svg
        width="34"
        height="30"
        viewBox="0 0 34 30"
        fill="none"
        aria-hidden="true"
        className="shrink-0 translate-y-1"
      >
        <path
          d="M2 1c1.6 6.4 6.2 9.2 9.4 8.2 2.6-.8 2-4-.4-3.6C8 6.1 7.4 11 10.6 15.4c3.4 4.7 10 8.6 20.6 11"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M26.4 27.8l5.4-1.4-3.4-4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </span>
  );
}

/** Label + hint + error wrapper shared by every field type. */
export function FieldShell({ id, label, hint, error, children }) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-[15px] font-medium text-ink tracking-[-0.01em]"
      >
        {label}
      </label>
      {hint && <p className="text-[13.5px] text-muted leading-snug">{hint}</p>}
      {children}
      {error && (
        <p role="alert" className="text-[13px] text-flag">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "w-full rounded-[var(--radius-inner)] border border-line bg-paper px-4 py-3 " +
  "text-[15px] text-ink placeholder:text-faint " +
  "focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft " +
  "transition-colors";

/** Small pill used for tags, chips and step markers. */
export function Pill({ children, active = false, className = "", ...props }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
        active ? "bg-ink text-white" : "bg-canvas text-ink-soft"
      } ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

export function Check({ filled }) {
  return filled ? (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill="var(--color-ink)" />
      <path
        d="M4.5 8.2l2.2 2.2 4.8-4.8"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="7.25"
        stroke="var(--color-line-strong)"
        strokeWidth="1.5"
        strokeDasharray="2.5 2.5"
      />
    </svg>
  );
}
