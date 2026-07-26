import Link from "next/link";

/*
  The reference's nav link: on hover the label slides up out of a clipped box
  and an identical copy slides in behind it.

  The copy is a CSS pseudo-element fed by data-hover, not a second node, so a
  screen reader reads the label once. The wrapper needs an explicit height —
  overflow-y: hidden is what crops the outgoing copy — which is why the text
  goes in a span rather than straight on the anchor.
*/
export default function HoverRoll({ href, children, className = "" }) {
  const label = String(children);

  return (
    <Link href={href} className={`hover-roll ${className}`}>
      <span data-hover={label}>{label}</span>
    </Link>
  );
}
