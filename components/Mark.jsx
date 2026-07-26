/*
  The brand mark: a point and three arcs leaving it — a line that carries a
  voice. It draws in currentColor and carries no colour of its own, so the same
  glyph works white-on-black in the wordmark's tile and black-on-white in the
  nav pill.

  Decorative everywhere it appears; the accessible name comes from the wordmark
  or the link around it, never from here.
*/
export default function Mark({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="6.5" cy="12" r="2" fill="currentColor" />
      <g
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M10.04 7.79A5.5 5.5 0 0 1 10.04 16.21" />
        <path d="M12.61 4.72A9.5 9.5 0 0 1 12.61 19.28" opacity="0.72" />
        <path d="M14.86 2.04A13 13 0 0 1 14.86 21.96" opacity="0.45" />
      </g>
    </svg>
  );
}
