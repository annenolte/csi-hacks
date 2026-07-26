import Link from "next/link";
import Mark from "@/components/Mark";
import { PRODUCT_NAME } from "@/lib/brand";

/** The mark + name, linking home. One definition so a rename lands everywhere. */
export default function Wordmark({ href = "/", className = "" }) {
  const inner = (
    <>
      <span
        aria-hidden="true"
        className="grid h-8 w-8 place-items-center rounded-[10px] bg-ink text-white"
      >
        <Mark className="h-[18px] w-[18px]" />
      </span>
      <span className="text-[15px] font-medium tracking-[-0.015em] text-ink">
        {PRODUCT_NAME}
      </span>
    </>
  );

  const classes = `inline-flex items-center gap-2.5 ${className}`;

  return href ? (
    <Link href={href} className={classes}>
      {inner}
    </Link>
  ) : (
    <span className={classes}>{inner}</span>
  );
}
