"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Wordmark from "../Wordmark";
import Overview from "./Overview";
import Knowledge from "./Knowledge";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "knowledge", label: "What it knows" },
];

/* No setState in here, so both the first load and every refresh can share it. */
async function fetchDashboard() {
  try {
    const response = await fetch("/api/dashboard");
    const payload = await response.json();
    if (!response.ok) return { error: payload.error ?? "Couldn't load your dashboard." };
    return { data: payload };
  } catch {
    return { error: "Couldn't reach the server." };
  }
}

export default function Dashboard() {
  const params = useSearchParams();
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((result) => {
    if (result.error) setError(result.error);
    else {
      setData(result.data);
      setError(null);
    }
    setLoading(false);
  }, []);

  const load = useCallback(async () => apply(await fetchDashboard()), [apply]);

  useEffect(() => {
    /* Ignore a response that lands after the component is gone. */
    let cancelled = false;
    fetchDashboard().then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  /* The Google callback redirects here with the outcome in the query string. */
  const calendarNotice = (() => {
    const status = params.get("calendar");
    if (status === "connected") {
      const account = params.get("account");
      return { tone: "ok", text: account ? `Connected ${account}.` : "Connected." };
    }
    if (status === "error") {
      return { tone: "error", text: params.get("reason") ?? "That didn't work." };
    }
    return null;
  })();

  return (
    <div className="relative min-h-dvh">
      <div
        aria-hidden="true"
        className="mesh-top pointer-events-none absolute inset-x-0 top-0 h-[220px] opacity-60"
      />

      <div className="relative mx-auto w-full max-w-3xl px-5 py-7 sm:px-6 sm:py-10">
        <Header business={data?.business} />

        <nav aria-label="Dashboard sections" className="mt-8">
          <ol className="inline-flex items-center gap-1 rounded-full bg-canvas/80 p-1 backdrop-blur-sm">
            {TABS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setTab(item.id)}
                  aria-current={tab === item.id ? "page" : undefined}
                  className={`rounded-full px-4 py-1.5 text-[13.5px] font-medium transition-all ${
                    tab === item.id
                      ? "bg-paper text-ink shadow-lift"
                      : "text-ink-soft hover:bg-paper/70"
                  }`}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <main className="mt-7 pb-16">
          {loading && <p className="text-[15px] text-muted">Loading…</p>}

          {error && (
            <div
              role="alert"
              className="rounded-[var(--radius-card)] border border-flag/30 bg-flag/5 px-5 py-4 text-[14px] leading-relaxed text-flag"
            >
              {error}
            </div>
          )}

          {data && !loading && (
            <>
              {data.business.status !== "complete" && <ResumeBanner />}
              {tab === "overview" ? (
                <Overview data={data} notice={calendarNotice} onRefresh={load} />
              ) : (
                <Knowledge data={data} onRefresh={load} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Header({ business }) {
  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <Wordmark href="/" />
        {business && (
          <p className="mt-2 text-[13.5px] text-muted">
            {business.name}
            {business.tradeLabel ? ` · ${business.tradeLabel}` : ""}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={signOut}
        className="rounded-full px-3.5 py-2 text-[13.5px] font-medium text-muted transition-colors hover:bg-paper/70 hover:text-ink"
      >
        Sign out
      </button>
    </header>
  );
}

function ResumeBanner() {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-cream px-5 py-4">
      <p className="text-[14px] leading-relaxed text-ink-soft">
        Setup isn&apos;t finished — your agent doesn&apos;t have a number yet.
      </p>
      <Link
        href="/onboarding"
        className="shrink-0 rounded-full bg-ink px-4 py-2 text-[13.5px] font-medium text-white shadow-lift transition-all hover:-translate-y-px hover:shadow-pop"
      >
        Pick it back up
      </Link>
    </div>
  );
}
