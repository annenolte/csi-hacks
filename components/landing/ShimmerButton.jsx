import Link from "next/link";

/*
  The primary call to action, copied in construction from the reference: a
  conic gradient turning behind the button, clipped to a hairline ring by an
  inset backdrop painted the same colour as the button itself.

  Three stacked layers, back to front:
    spark    — the rotating conic gradient, oversized so its corners never show
    backdrop — inset by --cut, hiding all of the spark but the ring
    content  — the label, above both

  The inner highlight is the same trick as the reference's: an inset shadow
  from the top that deepens on hover, which reads as light catching a curve.
*/
export default function ShimmerButton({
  href,
  children,
  className = "",
  shimmerColor = "#ffffff",
  background = "var(--color-ink)",
  spread = "90deg",
  cut = "1.5px",
}) {
  return (
    <Link
      href={href}
      style={{
        "--spread": spread,
        "--shimmer-color": shimmerColor,
        "--bg": background,
        "--cut": cut,
      }}
      className={
        "group relative inline-flex items-center justify-center gap-2 overflow-hidden " +
        "rounded-full px-8 py-4 text-[16px] font-medium text-white " +
        "transition-transform duration-300 active:translate-y-px " +
        `[background:var(--bg)] ${className}`
      }
    >
      <span aria-hidden="true" className="absolute inset-0 z-0 overflow-hidden rounded-full">
        <span className="shimmer-spark" />
      </span>

      <span
        aria-hidden="true"
        className="absolute z-[1] rounded-full [background:var(--bg)] [inset:var(--cut)]"
      />

      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[2] rounded-full shadow-[inset_0_-8px_10px_rgba(255,255,255,0.12)] transition-shadow duration-300 group-hover:shadow-[inset_0_-6px_10px_rgba(255,255,255,0.28)] group-active:shadow-[inset_0_-10px_10px_rgba(255,255,255,0.28)]"
      />

      <span className="relative z-[3] inline-flex items-center gap-2">
        {children}
        <Chevron />
      </span>
    </Link>
  );
}

function Chevron() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className="transition-transform duration-300 group-hover:translate-x-0.5"
    >
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
