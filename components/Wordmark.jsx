import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";

/** The mark + name, linking home. One definition so a rename lands everywhere. */
export default function Wordmark({ href = "/", className = "" }) {
  const inner = (
    <>
      <span
        aria-hidden="true"
        className="grid h-8 w-8 place-items-center rounded-[10px] bg-ink text-[15px] text-white"
      >
        ✂
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
