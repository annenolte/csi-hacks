"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HoverRoll from "./HoverRoll";
import Mark from "@/components/Mark";

/*
  The reference puts its navigation in a floating pill near the bottom of the
  window rather than a bar across the top, and hides it until you have scrolled
  past the hero. Both parts matter: the hero owns the first screen, and the nav
  is then within reach of the thumb for the whole rest of the page.

  Dark translucent fill over a blur, so it stays legible above every section
  the page passes under it — white cards, the blue chat panel, the green closer.
*/
export default function FloatingNav({ account }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // Appear once the hero is behind us. Half a viewport is roughly the point
    // where the headline has left and there is nothing else to reach for.
    const onScroll = () => setShown(window.scrollY > window.innerHeight * 0.5);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      aria-label="Primary"
      className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[15px] bg-ink/70 px-1.5 py-1.5 backdrop-blur-md transition-all duration-500 ${
        shown
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <div className="flex items-center gap-1">
        <Link
          href="/"
          aria-label="Home"
          className="grid h-9 w-9 place-items-center rounded-[11px] bg-paper text-ink"
        >
          <Mark className="h-4 w-4" />
        </Link>

        <div className="flex items-center gap-5 px-4 text-[14px] text-white/75">
          <HoverRoll href="/#how">How it works</HoverRoll>
          <HoverRoll href="/#trades">Trades</HoverRoll>
        </div>

        {account ? (
          <Link
            href="/dashboard"
            className="rounded-[11px] bg-paper px-4 py-2 text-[14px] font-medium text-ink transition-transform duration-200 hover:-translate-y-px"
          >
            Dashboard
          </Link>
        ) : (
          <>
            <Link
              href="/signin"
              className="px-3 py-2 text-[14px] text-white/75 transition-colors hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-[11px] bg-paper px-4 py-2 text-[14px] font-medium text-ink transition-transform duration-200 hover:-translate-y-px"
            >
              Create account
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
