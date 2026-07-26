import { Fragment } from "react";

/*
  The headline, split to one span per character so it can arrive a letter at a
  time — the same markup the reference generates with GSAP's SplitText, done
  here at render with no library.

  The whole string stays on the element as aria-label and every character is
  aria-hidden, because a screen reader handed 24 separate spans reads 24
  separate letters. Lines are passed as an array rather than as a string with
  \n in it: where a headline breaks is a design decision, not a coincidence of
  the viewport.

  `index` runs across the whole headline rather than restarting per line, so
  the stagger keeps travelling left-to-right, top-to-bottom.

  `block: false` drops the per-line wrapper, for a line the caller is composing
  something else into — the hero sets its mark alongside the last line, and a
  block wrapper would push it onto a line of its own.
*/
export default function SplitText({
  lines,
  className = "",
  step = 24,
  delay = 0,
  block = true,
}) {
  let index = 0;
  const Line = block ? "span" : Fragment;

  return (
    <span aria-label={lines.join(" ")} className={className}>
      {lines.map((line, li) => (
        <Line key={li} {...(block ? { className: "block" } : {})}>
          {[...line].map((ch, ci) => (
            <span
              key={ci}
              aria-hidden="true"
              className="char"
              style={{ "--i": index++, animationDelay: `${delay + index * step}ms` }}
            >
              {ch}
            </span>
          ))}
        </Line>
      ))}
    </span>
  );
}
