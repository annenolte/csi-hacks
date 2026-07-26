"use client";

import Link from "next/link";
import Wordmark from "./Wordmark";

/*
  One header for every signed-in screen — the dashboard and the conversation —
  so moving between them doesn't feel like moving between two products.

  The business sits in a pill beside the wordmark rather than as a line of grey
  text under it: it is the answer to "whose agent am I looking at", which is
  worth a chip, and it keeps the header one row tall on every screen.

  `action` is whatever the current screen wants on the right. The dashboard
  puts sign-out there; the conversation puts nothing, because someone three
  questions into setup should not be offered the exit before the finish.
*/
export default function AppHeader({ business, action = null, home = "/" }) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Wordmark href={home} />

      {business?.name && (
        <span className="inline-flex min-w-0 items-center gap-2 rounded-full border border-line bg-paper/70 py-1.5 pl-3 pr-3.5 text-[13px] text-ink-soft backdrop-blur-sm">
          <span className="truncate font-medium text-ink">{business.name}</span>
          {business.tradeLabel && (
            <>
              <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-line-strong" />
              <span className="shrink-0 text-muted">{business.tradeLabel}</span>
            </>
          )}
        </span>
      )}

      {/* ml-auto rather than justify-between on the header: when the row wraps
          on a narrow screen the action still lands on the right, where it was
          before the wrap, instead of jumping to the left margin. */}
      {action && <div className="ml-auto">{action}</div>}
    </header>
  );
}

/*
  Sign out is a POST, then a full navigation rather than a router push: the
  cookie was just cleared on that response, and a client-side transition can
  render the next page from a cache that still believes there is a session.
*/
export function SignOutButton() {
  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="hover-roll text-[14px] text-muted"
    >
      <span data-hover="Sign out">Sign out</span>
    </button>
  );
}

/** The same roll on a link — used for "back to dashboard" style exits. */
export function HeaderLink({ href, children }) {
  return (
    <Link href={href} className="hover-roll text-[14px] text-muted">
      <span data-hover={String(children)}>{children}</span>
    </Link>
  );
}
